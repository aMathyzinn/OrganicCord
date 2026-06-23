import { invoke } from "@tauri-apps/api/core";
import type { AiConversation, RuntimeState, ChannelMessage } from "./types";

const ORCHESTRATOR_MODEL = "deepseek/deepseek-v4-flash";
const FALLBACK_MODEL = "deepseek/deepseek-v4-pro";
export const ORCHESTRATOR_COLOR = "#a78bfa";

const CONTEXT_WINDOW = 25;

// ─── Structured directive ─────────────────────────────────────────────────────
// Instead of free-form text, the orchestrator returns a typed object.
// Each field maps to a specific injection in the participant prompts.

export type OrchestratorAction =
  | "CONTINUE"      // conversation is flowing well — just keep going
  | "DEEPEN"        // dig deeper into the current topic, add a specific angle
  | "SHIFT"         // natural topic drift — something loosely related
  | "BREAK"         // hard pivot — completely different subject
  | "REACT"         // someone said something worth reacting to — call it out
  | "QUESTION"      // provoke with a question that opens a new thread
  | "TENSION";      // create mild disagreement or debate about something specific

export interface OrchestratorDirective {
  action: OrchestratorAction;
  // The specific subject/angle to talk about (always concrete, never abstract)
  subject: string;
  // Optional: which participant should lead this (by username). Others follow.
  leader?: string;
  // Tone modifier that overrides personality slightly
  tone?: "casual" | "provocative" | "curious" | "skeptical" | "hyped";
  // Raw for logging
  raw: string;
}

export interface OrchestratorResult {
  directive: OrchestratorDirective;
  log_summary: string;
}

// ─── Conversation state analysis ──────────────────────────────────────────────

const ORCH_STOP = new Set([
  "que","não","sim","mas","pra","pro","com","por","uma","uns","sei","aí",
  "né","tá","ta","vai","vou","tem","ter","ser","aqui","ali","isso","esse",
  "essa","tipo","cara","mano","vc","você","eu","de","da","do","em","na",
  "no","já","ja","faz","kk","kkk","kkkk","haha","slk","vdd","tbm","tmb","gente",
  "isso","aqui","ali","muito","mais","menos","ainda","agora","depois","antes",
]);

function analyzeConversationState(msgs: ChannelMessage[]): string {
  if (msgs.length === 0) return "conversa não iniciou ainda";

  const recent = msgs.slice(-CONTEXT_WINDOW);
  const allText = recent.map((m) => m.content).join(" ").toLowerCase();

  const speakers = new Set(recent.map((m) => m.author_name)).size;
  const avgLen = allText.length / recent.length;
  const isStalling = avgLen < 15 && recent.length >= 5;

  const speakerCounts = new Map<string, number>();
  for (const m of recent) speakerCounts.set(m.author_name, (speakerCounts.get(m.author_name) ?? 0) + 1);
  const topTwo = [...speakerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const topTwoShare = topTwo.reduce((s, [, c]) => s + c, 0) / recent.length;
  const isDominated = topTwoShare > 0.85 && speakers >= 3;

  const words = allText.split(/\s+/).filter((w) => w.length > 3 && !ORCH_STOP.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const topWords = sorted.slice(0, 5).map(([w]) => w).join(", ");
  const topWord = sorted[0];
  const topicSaturation = (topWord?.[1] ?? 0) / Math.max(1, recent.length);

  // Compare vocabulary of first half vs second half to detect topic evolution
  const half = Math.floor(recent.length / 2);
  const firstHalfWords = new Set(recent.slice(0, half).map((m) => m.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !ORCH_STOP.has(w))).flat());
  const secondHalfWords = new Set(recent.slice(half).map((m) => m.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !ORCH_STOP.has(w))).flat());
  const intersection = [...firstHalfWords].filter((w) => secondHalfWords.has(w)).length;
  const union = new Set([...firstHalfWords, ...secondHalfWords]).size;
  const topicSimilarity = union > 0 ? intersection / union : 0;
  const isStagnant = topicSimilarity > 0.5 && recent.length >= 6;

  const lines: string[] = [];
  lines.push(`Palavras mais usadas: ${topWords || "sem padrão claro"}`);
  lines.push(`Participantes ativos: ${speakers}`);

  if (isStagnant) lines.push(`⚠️ ESTAGNADA — vocabulário idêntico entre primeira e segunda metade (similaridade ${(topicSimilarity * 100).toFixed(0)}%). A conversa não evoluiu. Use BREAK ou SHIFT.`);
  else if (isStalling) lines.push("⚠️ TRAVADA — mensagens muito curtas, sem substância. Use QUESTION ou BREAK.");
  else if (topicSaturation > 1.5) lines.push("⚠️ SATURADA — palavra-tema aparece em excesso. Hora de mudar ou aprofundar com ângulo novo.");
  else lines.push("✅ FLUINDO — vocabulário variado, conversa evoluindo.");

  if (isDominated) lines.push("⚠️ Par monopolizando: outros participantes parados. Use QUESTION direcionada a outro.");

  return lines.join(" | ");
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildOrchestratorSystemPrompt(conv: AiConversation, extraInstructions: string): string {
  const names = conv.participants.map((p) => `${p.username} (personalidade: ${p.personality || "neutro"})`).join(", ");

  return [
    "Você é o orquestrador de uma conversa simulada no Discord. Você NUNCA posta mensagens.",
    "Seu trabalho é analisar o estado da conversa e emitir UMA diretiva estruturada.",
    "",
    `Participantes: ${names}.`,
    conv.topic ? `Contexto/tema geral: ${conv.topic}` : "",
    extraInstructions ? `Instruções do criador: ${extraInstructions}` : "",
    "",
    "PRINCÍPIOS DE CONVERSA REAL NO DISCORD:",
    "- Pessoas ficam num assunto por 3-5 turnos antes de mudar — não deixe passar de 6 sem mudar ou aprofundar.",
    "- Se a conversa parece estar girando em círculos, mude. BREAK ou SHIFT agora.",
    "- CONTINUE só é válido se a conversa está visivelmente evoluindo — não só falando da mesma coisa de novo.",
    "- Discordâncias são necessárias. Sem elas a conversa parece roteiro.",
    "- Prefira ações concretas (BREAK, TENSION, QUESTION) a CONTINUE genérico.",
    "",
    "AÇÕES DISPONÍVEIS:",
    "- CONTINUE: SOMENTE se a conversa está evoluindo de verdade, não girando em círculos",
    "- DEEPEN: aprofunde com ângulo novo e específico — NÃO use se o tópico já foi esgotado",
    "- SHIFT: deriva natural para algo relacionado mas diferente (ex: de 'jogo X' para 'DLC do jogo X')",
    "- BREAK: pivô completo para assunto diferente — use sempre que detectar stagnação",
    "- REACT: alguém disse algo que merece reação — aponte e provoque",
    "- QUESTION: pergunta aberta que abre fio novo — preferível a CONTINUE quando estagnado",
    "- TENSION: discordância saudável — use quando a conversa está plana/concordante demais",
    "",
    "FORMATO DE RESPOSTA — retorne APENAS JSON válido, sem markdown, sem explicação:",
    '{"action":"CONTINUE","subject":"assunto concreto aqui","leader":"NomeOpcional","tone":"casual","raw":"resumo em 1 frase"}',
    "",
    "Regras do JSON:",
    "- action: uma das ações acima",
    "- subject: SEMPRE concreto e específico (ex: 'preço do RTX 5090', 'último episódio de X', 'bug no valorant hoje'). NUNCA abstrato.",
    "- leader: username de quem deve liderar essa virada (opcional — omita se for geral)",
    "- tone: casual | provocative | curious | skeptical | hyped",
    "- raw: 1 frase descrevendo o que quer que aconteça, para o log",
  ].filter(Boolean).join("\n");
}

function buildOrchestratorUserPrompt(
  recentMessages: ChannelMessage[],
  currentDirective: OrchestratorDirective | null,
  stateAnalysis: string
): string {
  const msgBlock = recentMessages
    .slice(-CONTEXT_WINDOW)
    .map((m) => `${m.author_name}: ${m.content}`)
    .join("\n");

  return [
    "=== ESTADO DA CONVERSA ===",
    stateAnalysis,
    "",
    "=== ÚLTIMAS MENSAGENS ===",
    msgBlock || "(conversa não iniciou)",
    "",
    currentDirective
      ? `=== DIRETIVA ANTERIOR ===\nAção: ${currentDirective.action} | Assunto: ${currentDirective.subject}\n`
      : "",
    "Emita a próxima diretiva em JSON:",
  ].filter(Boolean).join("\n");
}

// ─── JSON parser (resilient) ──────────────────────────────────────────────────

function parseDirective(raw: string): OrchestratorDirective | null {
  try {
    // Strip markdown code blocks if model wrapped it
    const cleaned = raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<OrchestratorDirective> & { raw?: string };

    const validActions: OrchestratorAction[] = ["CONTINUE", "DEEPEN", "SHIFT", "BREAK", "REACT", "QUESTION", "TENSION"];
    const action = validActions.includes(parsed.action as OrchestratorAction)
      ? (parsed.action as OrchestratorAction)
      : "CONTINUE";

    return {
      action,
      subject: (typeof parsed.subject === "string" && parsed.subject.trim()) ? parsed.subject.trim() : "assunto atual",
      leader: typeof parsed.leader === "string" ? parsed.leader : undefined,
      tone: (["casual", "provocative", "curious", "skeptical", "hyped"] as const).includes(parsed.tone as any)
        ? (parsed.tone as OrchestratorDirective["tone"])
        : "casual",
      raw: typeof parsed.raw === "string" ? parsed.raw : `${action}: ${parsed.subject ?? ""}`,
    };
  } catch {
    return null;
  }
}

// ─── OpenRouter call ──────────────────────────────────────────────────────────

async function callOrchestrator(
  conv: AiConversation,
  rt: RuntimeState,
  recentMessages: ChannelMessage[],
  apiKey: string,
  extraInstructions: string
): Promise<OrchestratorResult> {
  const stateAnalysis = analyzeConversationState(recentMessages);
  const systemPrompt = buildOrchestratorSystemPrompt(conv, extraInstructions);
  const userPrompt = buildOrchestratorUserPrompt(recentMessages, rt.orchestrator_directive, stateAnalysis);

  const models = [ORCHESTRATOR_MODEL, FALLBACK_MODEL];
  let lastError: string | null = null;

  for (const model of models) {
    try {
      const result = await invoke<{ text: string; sent: boolean }>("ai_generate", {
        payload: {
          config: {
            provider: "openrouter",
            api_key: apiKey,
            model,
            system_prompt: systemPrompt,
            temperature: 0.6,
            max_tokens: 200,
          },
          messages: [{ role: "user", content: userPrompt }],
          account_id: conv.participants[0]?.account_id ?? "",
          channel_id: conv.channel_id,
          send: false,
          reply_to: null,
        },
      });

      const directive = parseDirective(result.text.trim());
      if (directive) {
        return {
          directive,
          log_summary: `[${directive.action}] ${directive.subject}${directive.leader ? ` (→${directive.leader})` : ""}`,
        };
      }

      lastError = `Model ${model} returned unparseable content: ${result.text.slice(0, 80)}`;
      console.warn(`[Orchestrator] ${lastError}, trying fallback...`);
    } catch (e) {
      lastError = String(e);
      console.warn(`[Orchestrator] Model ${model} failed: ${e}, trying fallback...`);
    }
  }

  throw new Error(lastError ?? "All orchestrator models failed");
}

// ─── Resume after long silence ────────────────────────────────────────────────

export async function runResumeOrchestrator(
  conv: AiConversation,
  rt: RuntimeState,
  recentMessages: ChannelMessage[],
  silenceMs: number
): Promise<OrchestratorResult | null> {
  const cfg = conv.orchestrator;
  if (!cfg?.enabled || !cfg.api_key) return null;

  const silenceMin = Math.round(silenceMs / 1000 / 60);
  const names = conv.participants.map((p) => p.username).join(", ");

  const systemPrompt = [
    "Você é um orquestrador de conversa no Discord. Retorne APENAS JSON.",
    `Participantes: ${names}.`,
    "",
    `O chat ficou mudo por ${silenceMin} minutos.`,
    "Gere uma diretiva BREAK com um assunto completamente novo e concreto para retomar.",
    "Escolha um assunto que qualquer um falaria ao voltar pro Discord: jogo, comida, meme, notícia, tech, etc.",
    "",
    'Formato: {"action":"BREAK","subject":"assunto específico","tone":"casual","raw":"resumo"}',
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Silêncio de ${silenceMin} minutos.`,
    "Últimas mensagens:",
    recentMessages.slice(-5).map((m) => `${m.author_name}: ${m.content}`).join("\n") || "(nenhuma)",
    "\nGere a diretiva de retomada em JSON:",
  ].join("\n");

  const models = [ORCHESTRATOR_MODEL, FALLBACK_MODEL];

  for (const model of models) {
    try {
      const result = await invoke<{ text: string; sent: boolean }>("ai_generate", {
        payload: {
          config: {
            provider: "openrouter",
            api_key: cfg.api_key,
            model,
            system_prompt: systemPrompt,
            temperature: 0.9,
            max_tokens: 150,
          },
          messages: [{ role: "user", content: userPrompt }],
          account_id: conv.participants[0]?.account_id ?? "",
          channel_id: conv.channel_id,
          send: false,
          reply_to: null,
        },
      });

      const directive = parseDirective(result.text.trim());
      if (directive) {
        return {
          directive,
          log_summary: `[RESUME após ${silenceMin}min] ${directive.subject}`,
        };
      }
    } catch (e) {
      console.warn(`[Orchestrator-Resume] Model ${model} failed: ${e}`);
    }
  }

  return null;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runOrchestrator(
  conv: AiConversation,
  rt: RuntimeState,
  recentMessages: ChannelMessage[]
): Promise<OrchestratorResult | null> {
  const cfg = conv.orchestrator;
  if (!cfg?.enabled || !cfg.api_key) return null;
  if (rt.orchestrator_running) return null;

  rt.orchestrator_running = true;
  try {
    return await callOrchestrator(conv, rt, recentMessages, cfg.api_key, cfg.extra_instructions ?? "");
  } catch (e) {
    console.error("[Orchestrator] failed:", e);
    return null;
  } finally {
    rt.orchestrator_running = false;
  }
}
