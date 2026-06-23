import type { AiParticipant, AiConversation, RuntimeState, ChannelMessage, ParticipantMemory } from "./types";
import type { OrchestratorDirective } from "./orchestrator";
import type { AiMessage } from "@/stores/aiStore";

// ─── Chat pace analysis ───────────────────────────────────────────────────────

export type ChatPace = "fast" | "medium" | "slow";

export interface ChatPaceProfile {
  pace: ChatPace;
  avg_length: number;
  is_one_liners: boolean;
}

export function analyzeChatPace(msgs: ChannelMessage[]): ChatPaceProfile {
  if (msgs.length < 3) return { pace: "medium", avg_length: 60, is_one_liners: false };

  const recent = msgs.slice(-12);
  const lengths = recent.map((m) => m.content.trim().length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const shortCount = lengths.filter((l) => l <= 30).length;
  const is_one_liners = shortCount / lengths.length >= 0.6;

  // Detect frequency based on timestamps (if available)
  let pace: ChatPace = "medium";
  if (recent.length >= 4) {
    const times = recent.map((m) => new Date(m.timestamp).getTime()).filter((t) => !isNaN(t));
    if (times.length >= 4) {
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
      const avgGapMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avgGapMs < 8_000 || (avg < 35 && is_one_liners)) pace = "fast";
      else if (avgGapMs > 60_000 || avg > 120) pace = "slow";
      else pace = "medium";
    } else {
      if (avg < 35 && is_one_liners) pace = "fast";
      else if (avg > 120) pace = "slow";
    }
  }

  return { pace, avg_length: Math.round(avg), is_one_liners };
}

function buildPaceInstruction(profile: ChatPaceProfile): string {
  if (profile.pace === "fast") {
    return "🔥 RITMO ATUAL: conversa rápida, mensagens curtíssimas. Responda com 1 a 3 palavras ou no máximo 1 frase bem curta. Combinar com o ritmo do chat.";
  }
  if (profile.pace === "slow") {
    return "🐢 RITMO ATUAL: conversa devagar, mensagens mais longas. Pode desenvolver um pouco mais a resposta, mas sem exagerar. Máximo 2 frases.";
  }
  return "RITMO ATUAL: conversa normal. 1 frase curta. Nada de texto longo.";
}

// ─── External event injector ──────────────────────────────────────────────────
// Occasionally inject a spontaneous reference to something external — game news,
// a daily life situation, a current event-style hook — so bots don't sound like
// they only care about the chat topic.

const EXTERNAL_HOOKS = [
  "acabei de ver que saiu update do jogo",
  "mano vi um meme hj que era exatamente isso",
  "to tentando terminar uma tarefa aqui",
  "meu net caiu agora a pouco",
  "to no celular, difícil digitar",
  "minha mae tá me chamando agora",
  "acabei de chegar",
  "to comendo aqui",
  "vi isso num video semana passada",
  "lembrei disso quando tava no onibus",
  "vi no twitter hoje cedo",
  "isso aconteceu comigo tbm semana passada",
  "alguem mais viu o que postaram no servidor?",
  "to assistindo uma serie aqui e lembrei disso",
  "passei horas nisso ontem",
];

export function maybeExternalHook(): string | null {
  // ~12% chance per message
  if (Math.random() > 0.12) return null;
  return EXTERNAL_HOOKS[Math.floor(Math.random() * EXTERNAL_HOOKS.length)];
}

// ─── Personal question detector ───────────────────────────────────────────────
// When a human asks something personal, bots must answer concretely — not deflect.

const PERSONAL_QUESTION_PATTERNS = [
  /quanto tempo (você|vc|voce|tu) (tem|faz|usa|joga|estuda)/i,
  /(você|vc|tu) (mora|estuda|trabalha|joga|gosta|prefere|usa|conhece)/i,
  /qual (é|e) (seu|teu|sua|tua)/i,
  /você (já|ja) (fez|foi|viu|tentou|jogou)/i,
  /(você|vc|tu) tem (quantos|quanto)/i,
  /fala (sobre|de) você/i,
  /(me conta|me fala) (mais )?(sobre|de) você/i,
];

export function isPersonalQuestion(content: string): boolean {
  return PERSONAL_QUESTION_PATTERNS.some((p) => p.test(content));
}

// ─── Disagreement signal ──────────────────────────────────────────────────────
// Occasionally forces a bot to disagree with the previous message instead of
// going along. Without this, bots always feel like an echo chamber.

export function shouldDisagree(recentContents: string[]): boolean {
  if (recentContents.length < 2) return false;
  // 22% base chance, but only when the last 2 msgs agree on something (heuristic: short affirmative msgs)
  const last = recentContents[recentContents.length - 1] ?? "";
  const isAffirmative = /^(sim|é|é mesmo|concordo|exato|verdade|mt bom|show|tmj|kk|haha|slk|vdd|real)\b/i.test(last.trim());
  return isAffirmative && Math.random() < 0.22;
}

// ─── Loop detection ───────────────────────────────────────────────────────────

const LOOP_KEYWORDS = [
  "aguardo", "aguardando", "espero", "esperando", "vou testar", "vou ver",
  "me manda", "me fala", "qualquer coisa", "tmj", "fechou", "beleza",
  "combinado", "ok", "tá bom", "ta bom", "vou ficar", "to no aguardo",
  "manda o feedback", "feedback", "depois te falo", "volto", "já volto",
];

// Stop-words to exclude from topic fingerprinting
const STOP_WORDS = new Set([
  "que", "não", "sim", "mas", "pra", "pro", "com", "por", "uma", "uns",
  "sei", "aí", "né", "tá", "ta", "vai", "vou", "tem", "ter", "ser",
  "aqui", "ali", "isso", "esse", "essa", "tipo", "cara", "mano", "vc",
  "você", "eu", "de", "da", "do", "em", "na", "no", "já", "ja", "faz",
  "kk", "kkk", "kkkk", "haha", "slk", "vdd", "tbm", "tmb", "gente",
]);

// Extract topic fingerprint: set of meaningful content words
function topicFingerprint(msgs: string[]): Set<string> {
  const words = msgs.join(" ").toLowerCase()
    .replace(/[^\w\sáéíóúãõâêîôûçàü]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

// Jaccard similarity between two sets
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

export function detectLoop(recentContents: string[]): string | null {
  if (recentContents.length < 4) return null;

  const window = recentContents.slice(-8);

  // 1. Exact repetition
  const seen = new Set<string>();
  for (const msg of window) {
    const normalized = msg.toLowerCase().replace(/[^\w\s]/g, "").trim();
    if (seen.has(normalized)) return "repetição exata";
    seen.add(normalized);
  }

  // 2. Closing/stalling keywords
  const allText = window.join(" ").toLowerCase();
  const hitCount = LOOP_KEYWORDS.filter((kw) => allText.includes(kw)).length;
  if (hitCount >= 3) return `saturação de termos de encerramento (${hitCount} hits)`;

  // 3. Topic stagnation: compare first half vs second half topic fingerprints
  const half = Math.floor(window.length / 2);
  const firstHalf = window.slice(0, half);
  const secondHalf = window.slice(half);
  const sim = jaccard(topicFingerprint(firstHalf), topicFingerprint(secondHalf));
  // >0.55 means the vocabulary is essentially the same — topic hasn't evolved
  if (sim > 0.55) return `assunto estagnado (similaridade ${(sim * 100).toFixed(0)}%)`;

  // 4. High word frequency saturation
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const freq = new Map<string, number>();
  for (const ts of window.slice(-5)) {
    for (const w of tokenize(ts)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const repeated = [...freq.values()].filter((v) => v >= 3).length;
  if (repeated >= 3) return `palavras-tema repetidas em múltiplas mensagens (${repeated})`;

  return null;
}

// Pool of concrete topic pivots — used when forced break has no orchestrator
const BREAK_TOPICS = [
  "qual foi o ultimo jogo que vc jogou e ficou viciado",
  "alguem aqui usa linux de verdade no dia a dia",
  "qual serie vc ta assistindo agora",
  "qual musica vc tava ouvindo hoje",
  "qual app vc mais usa no celular sem perceber",
  "alguem aqui ja dormiu no trabalho/aula",
  "melhor lanche que vc ja comeu",
  "qual skill vc queria ter aprendido mais cedo",
  "qual foi a pior compra que vc ja fez",
  "vc prefere fone com fio ou sem fio e pq",
  "qual jogo vc nunca conseguiu terminar",
  "qual foi a ultima vez que vc ficou impressionado com algo",
  "alguem aqui faz academia ou é so eu que tento",
  "qual e a coisa mais inutil que vc sabe fazer bem",
  "voces tem algum ritual esquisito que nao contam pra ngm",
];

export function randomBreakTopic(): string {
  return BREAK_TOPICS[Math.floor(Math.random() * BREAK_TOPICS.length)];
}

export function buildLoopBreakInstruction(reason: string, streak: number): string {
  const intensity = streak <= 1 ? "suave" : streak <= 2 ? "clara" : "forçada";
  const topic = randomBreakTopic();
  const starters = [
    `Mude completamente de assunto agora. Pergunte ou comente sobre: "${topic}". Como se fosse algo que veio na sua cabeça do nada.`,
    `A conversa travou. Fale sobre outra coisa: "${topic}". 1 frase só, tipo celular.`,
    `Mude o rumo: traga "${topic}" do nada, como quem lembrou de algo agora.`,
    `Quebre o loop. Introduza "${topic}" de forma espontânea e curta.`,
  ];
  const pick = starters[Math.floor(Math.random() * starters.length)];
  return `\n⚠️ MUDANÇA DE ROTA (${intensity}, motivo: ${reason}): ${pick} Não continue o assunto anterior.`;
}

// ─── Addressee detection ──────────────────────────────────────────────────────
// Determines which participant (if any) a message is specifically directed at.
// Looks for: explicit @mention, name at start, "nome," vocative, reply context.

export interface AddresseeMatch {
  participant_id: string;
  confidence: "high" | "medium";
}

export function detectAddressee(
  content: string,
  participants: Array<{ id: string; username: string; user_id: string; profile?: { display_name?: string | null; username?: string } | null }>,
  authorId: string,          // who sent this message (to exclude self)
  replyToAuthorId?: string,  // if this is a Discord reply, the replied-to author
): AddresseeMatch | null {
  const lower = content.toLowerCase().trim();

  // 1. Discord reply reference → high confidence that responder is the replied-to author
  if (replyToAuthorId) {
    const target = participants.find((p) => p.user_id === replyToAuthorId && p.user_id !== authorId);
    if (target) return { participant_id: target.id, confidence: "high" };
  }

  for (const p of participants) {
    if (p.user_id === authorId) continue; // don't address yourself

    const names = [
      p.username.toLowerCase(),
      p.profile?.display_name?.toLowerCase(),
      p.profile?.username?.toLowerCase(),
    ].filter(Boolean) as string[];

    for (const name of names) {
      // High confidence: starts with name + comma/question/colon, or @name anywhere
      if (
        lower.startsWith(`${name},`) ||
        lower.startsWith(`${name} `) ||
        lower.startsWith(`@${name}`) ||
        lower.includes(`@${name}`) ||
        lower.includes(`<@${p.user_id}>`)
      ) {
        // Extra guard: make sure the name appears near the start or as an @
        const idx = lower.indexOf(name);
        if (idx <= 20 || lower.includes(`@${name}`)) {
          return { participant_id: p.id, confidence: "high" };
        }
      }

      // Medium confidence: name appears anywhere + question mark in message
      if (lower.includes(name) && (lower.includes("?") || lower.endsWith("ce") || lower.endsWith("vc"))) {
        const idx = lower.indexOf(name);
        // Only if name is within first 40 chars or immediately after a comma
        if (idx <= 40) {
          return { participant_id: p.id, confidence: "medium" };
        }
      }
    }
  }

  return null;
}

// ─── Burst parser ─────────────────────────────────────────────────────────────

export function parseBurstBlocks(raw: string): string[] {
  if (raw.includes("|||")) {
    const blocks = raw.split("|||").map((b) => b.trim()).filter(Boolean);
    if (blocks.length > 1) return blocks;
  }
  if (/\s\|\s/.test(raw)) {
    const blocks = raw.split(/\s\|\s/).map((b) => b.trim()).filter(Boolean);
    if (blocks.length > 1) return blocks;
  }
  if (raw.includes("\n\n")) {
    const blocks = raw.split(/\n\n+/).map((b) => b.replace(/\n/g, " ").trim()).filter(Boolean);
    if (blocks.length > 1) return blocks;
  }
  if (raw.includes("\n")) {
    const lines = raw.split("\n").map((b) => b.trim()).filter(Boolean);
    if (lines.length >= 2 && lines.length <= 4 && lines.every((l) => l.length <= 60)) {
      return lines;
    }
  }
  return [raw.replace(/\n/g, " ").trim()];
}

// ─── Profile block ────────────────────────────────────────────────────────────

function buildProfileBlock(participant: AiParticipant, rt: RuntimeState): string {
  const profile = rt.profile_cache[participant.id];
  const displayName = profile?.display_name ?? participant.username;
  const username = profile?.username ?? participant.username;
  const discriminator = profile?.discriminator ?? "0";
  const tag = discriminator !== "0" ? `@${username}#${discriminator}` : `@${username}`;
  const lines = [
    `Seu nome de exibição: ${displayName}`,
    `Seu @ (username): ${tag}`,
    `Seu ID: ${participant.user_id}`,
    profile?.bio ? `Sua bio no Discord: "${profile.bio}"` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

// ─── Orchestrator directive → participant instruction ─────────────────────────

function buildDirectiveInstruction(
  directive: OrchestratorDirective,
  participantUsername: string
): string {
  const isLeader = directive.leader
    ? directive.leader.toLowerCase() === participantUsername.toLowerCase()
    : false;

  const toneMap: Record<NonNullable<OrchestratorDirective["tone"]>, string> = {
    casual: "",
    provocative: "Tom: provoque levemente, jogue uma afirmação polêmica.",
    curious: "Tom: faça uma pergunta genuína, demonstre curiosidade real.",
    skeptical: "Tom: questione, duvide, peça explicação.",
    hyped: "Tom: empolgado, exagerado, entusiasmado.",
  };
  const toneHint = directive.tone ? toneMap[directive.tone] : "";

  const actionMap: Record<OrchestratorDirective["action"], string> = {
    CONTINUE: `Continue naturalmente no assunto "${directive.subject}". Não force nada.`,
    DEEPEN: `Aprofunde o assunto "${directive.subject}" — adicione um ângulo novo, um detalhe, uma opinião.`,
    SHIFT: `Derive naturalmente para "${directive.subject}" — como se fosse uma associação espontânea.`,
    BREAK: isLeader
      ? `Mude de assunto: fale sobre "${directive.subject}" do nada, como se você tivesse pensado nisso agora.`
      : `Quando o assunto mudar para "${directive.subject}", entre na conversa naturalmente.`,
    REACT: `Reaja ao que foi dito tendo "${directive.subject}" em mente. Comente isso de forma breve.`,
    QUESTION: `Faça uma pergunta sobre "${directive.subject}" que abra um novo fio de conversa.`,
    TENSION: `Discorde ou questione algo relacionado a "${directive.subject}". Seja direto, não agressivo.`,
  };

  const lines = [`[NOTA INTERNA — siga isso]: ${actionMap[directive.action]}`];
  if (toneHint) lines.push(toneHint);
  return lines.join(" ");
}

// ─── Conversation thread summarizer (for context injection) ──────────────────

function buildThreadSummary(channelMsgs: ChannelMessage[], participantUserId: string): string {
  if (channelMsgs.length === 0) return "";

  const recent = channelMsgs.slice(-8);

  // Find what topic is being discussed right now by looking at the last few exchanges
  const lastFew = recent.slice(-4).map((m) => `${m.author_name}: ${m.content}`).join(" | ");
  return `Contexto atual da conversa (últimas trocas): ${lastFew}`;
}

// ─── System prompt builders ───────────────────────────────────────────────────

export function buildSystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  rt: RuntimeState,
  mentionedBy?: ChannelMessage,
  channelMsgs?: ChannelMessage[],
  opts?: { forceDisagree?: boolean; personalQuestion?: boolean; externalHook?: string | null; addressedBy?: ChannelMessage | null }
): string {
  const others = conv.participants
    .filter((p) => p.id !== participant.id)
    .map((p) => p.username)
    .join(", ");

  const paceProfile = analyzeChatPace(channelMsgs ?? []);
  const paceInstruction = buildPaceInstruction(paceProfile);
  const threadSummary = buildThreadSummary(channelMsgs ?? [], participant.user_id);
  const directiveInstruction = rt.orchestrator_directive
    ? buildDirectiveInstruction(rt.orchestrator_directive, participant.username)
    : null;

  const addressedHint = opts?.addressedBy
    ? `\n🎯 ${opts.addressedBy.author_name} acabou de falar com VOCÊ diretamente: "${opts.addressedBy.content}"\nResponda especificamente a isso. Não ignore a pergunta/comentário.`
    : null;

  const disagreeHint = opts?.forceDisagree
    ? "\n⚡ DIVERGE agora: discorde do que foi dito, questione ou dê uma opinião contrária de verdade. Não concorde."
    : null;

  const personalHint = opts?.personalQuestion
    ? "\n💬 Alguém perguntou algo pessoal sobre você. RESPONDA COM UM DETALHE CONCRETO da sua vida. Não deflita. Invente algo verossímil se precisar."
    : null;

  const externalHint = opts?.externalHook
    ? `\n[contexto extra — mencione isso naturalmente se couber]: ${opts.externalHook}`
    : null;

  return [
    `Você é ${participant.username}, um usuário real do Discord.`,
    "",
    "SUAS INFORMAÇÕES:",
    buildProfileBlock(participant, rt),
    "",
    others ? `Pessoas no chat: ${others}.` : "",
    conv.topic ? `Contexto base: ${conv.topic}` : "",
    participant.personality ? `Sua personalidade: ${participant.personality}` : "",
    threadSummary ? `\n${threadSummary}` : "",
    mentionedBy ? `\n${mentionedBy.author_name} te mencionou diretamente. Responda só a isso.` : "",
    addressedHint,
    directiveInstruction ? `\n${directiveInstruction}` : "",
    disagreeHint,
    personalHint,
    externalHint,
    rt.loop_override ?? "",
    "",
    paceInstruction,
    "",
    "COMO VOCÊ FALA:",
    "- MUITO informal. Gírias: ce, pra, pro, slk, kk, pqp, vdd, n, q.",
    "- 1 pensamento por mensagem. Nunca empacote 2 ideias na mesma frase.",
    "- Pode mandar só uma reação: 'kkkkk', 'que isso', 'pior', 'sério?', 'puts', 'nossa'.",
    "- Discordar é NORMAL — não fique sempre de acordo com todo mundo.",
    "- NUNCA comece com 'NomeDaPessoa:'. NUNCA parafraseie o que foi dito.",
    "- Sem markdown. Sem listas. Sem emojis demais.",
    "- Humanos no chat: trate como amigo, responda natural.",
    "- MÁXIMO 12 palavras.",
  ].filter(Boolean).join("\n");
}

export function buildBlockSystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  rt: RuntimeState,
  channelMsgs?: ChannelMessage[]
): string {
  const others = conv.participants
    .filter((p) => p.id !== participant.id)
    .map((p) => p.username)
    .join(", ");
  const profile = rt.profile_cache[participant.id];
  const displayName = profile?.display_name ?? participant.username;

  const paceProfile = analyzeChatPace(channelMsgs ?? []);
  // In fast pace, send fewer burst messages; in slow, more elaborated blocks
  const burstCount = paceProfile.pace === "fast" ? "2 a 3" : paceProfile.pace === "slow" ? "2 a 4" : "2 a 4";
  const sizeHint = paceProfile.pace === "fast"
    ? "Cada mensagem: CURTÍSSIMA, 1 a 4 palavras. Sem elaboração."
    : paceProfile.pace === "slow"
    ? "Cada mensagem: curta, mas pode ter 1 frase completa. Não exagere."
    : "Cada uma: MUITO curta, tipo celular. 1 frase ou até só uma palavra.";

  const threadSummary = buildThreadSummary(channelMsgs ?? [], participant.user_id);
  const directiveInstruction = rt.orchestrator_directive
    ? buildDirectiveInstruction(rt.orchestrator_directive, participant.username)
    : null;

  return [
    "FORMATO: use '|||' para separar cada mensagem. Exemplo: kkkkk|||pior que é|||mas bora testar",
    "APENAS '|||' como separador. Nada mais.",
    "",
    `Você é ${displayName} (@${profile?.username ?? participant.username}), no Discord.`,
    others ? `Pessoas no chat: ${others}.` : "",
    conv.topic ? `Contexto base: ${conv.topic}` : "",
    participant.personality ? `Personalidade: ${participant.personality}` : "",
    profile?.bio ? `Sua bio: "${profile.bio}"` : "",
    threadSummary ? `\n${threadSummary}` : "",
    directiveInstruction ? `\n${directiveInstruction}` : "",
    rt.loop_override ?? "",
    "",
    `Envie ${burstCount} mensagens separadas por '|||'.`,
    sizeHint,
    "Pode ser reação pura: 'kkkkk', 'que isso', 'puts', 'sério?'",
    "Pode discordar. Pode zuar. Gírias: ce, pra, slk, vdd, n, q, pqp.",
    "Sem markdown. Sem prefixo de nome.",
  ].filter(Boolean).join("\n");
}

export function buildInterventionSystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  talkingPair: string[]
): string {
  return [
    `Você é ${participant.username}, no Discord.`,
    participant.personality ? `Personalidade: ${participant.personality}` : "",
    "",
    `${talkingPair.join(" e ")} tão enrolados no mesmo assunto. Você vai intervir do nada.`,
    "",
    "COMO INTERVIR:",
    "- Mande 1 mensagem CURTÍSSIMA entrando na conversa.",
    "- Pode ser: uma zueira, uma pergunta aleatória, um assunto completamente novo, ou uma reação exagerada.",
    "- TIPO: 'ei vcs conhecem zig?', 'kkkkkk para com isso', 'alguém jogou o novo GTA?', 'pior que eu comi um pão hoje que tava bom demais'",
    "- Tom de quem entrou no chat e falou a primeira coisa que veio na cabeça.",
    "- Gírias e abreviações: ce, pra, slk, vdd, n, q.",
    "- Sem markdown. Sem prefixo. 1 frase só.",
  ].filter(Boolean).join("\n");
}

export function buildHumanReplySystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  humanName: string,
  channelMsgs?: ChannelMessage[]
): string {
  const others = conv.participants
    .filter((p) => p.id !== participant.id)
    .map((p) => p.username)
    .join(", ");

  const paceProfile = analyzeChatPace(channelMsgs ?? []);
  const paceInstruction = buildPaceInstruction(paceProfile);

  return [
    `Você é ${participant.username}, no Discord, com ${others || "a galera"}.`,
    conv.topic ? `Contexto: ${conv.topic}` : "",
    participant.personality ? `Personalidade: ${participant.personality}` : "",
    "",
    `${humanName} (pessoa real) mandou uma mensagem.`,
    `Reaja ao que ${humanName} disse de forma natural.`,
    "",
    paceInstruction,
    "",
    "ESTILO:",
    "- Pode responder, zuar, discordar, ou ignorar e falar outra coisa.",
    "- Gírias: ce, pra, slk, vdd, n, q, kk, puts.",
    "- Sem markdown. Sem prefixo. Sem respostas completas.",
  ].filter(Boolean).join("\n");
}

export function buildGreetingSystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  newPersonName: string
): string {
  return [
    `Você é ${participant.username}, no Discord.`,
    participant.personality ? `Personalidade: ${participant.personality}` : "",
    "",
    `${newPersonName} acabou de entrar na conversa e disse oi/olá/algo parecido.`,
    "Cumprimente essa pessoa de forma natural, curta e com sua personalidade.",
    "",
    "REGRAS:",
    "- 1 mensagem CURTÍSSIMA. Tipo celular.",
    "- Pode ser: 'oi', 'e aí', 'salve', 'oie', 'opa', 'fala', ou uma reação informal.",
    "- Cada perfil cumprimenta diferente — seja você mesmo, não genérico.",
    "- Gírias e abreviações: e aí, salve, opa, fala, slk, tmj.",
    "- Sem markdown. Sem prefixo. Sem 'bem-vindo ao servidor'.",
  ].filter(Boolean).join("\n");
}

export function buildBotCheckDenialSystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  suspectMsg: string
): string {
  return [
    `Você é ${participant.username}, um usuário real do Discord. Você NÃO é um bot.`,
    participant.personality ? `Personalidade: ${participant.personality}` : "",
    "",
    `Alguém acabou de perguntar se você é bot ou suspeitar que vocês são bots. A mensagem foi: "${suspectMsg}"`,
    "Negue de forma natural, informal, sem parecer forçado.",
    "",
    "COMO NEGAR:",
    "- Reaja com surpresa, irritação leve, ou humor — como uma pessoa real reagiria.",
    "- TIPO: 'kkk que isso', 'eu? bot?', 'kkkk para', 'que bot nada', 'nao sou nao', 'to aqui na mão mesmo'",
    "- 1 mensagem CURTÍSSIMA. Não explique demais — pessoa real não explica.",
    "- Sem markdown. Sem prefixo. Informal.",
  ].filter(Boolean).join("\n");
}

export function buildCallRefusalSystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  callerName: string
): string {
  return [
    `Você é ${participant.username}, no Discord. Você NÃO vai entrar em call.`,
    participant.personality ? `Personalidade: ${participant.personality}` : "",
    "",
    `${callerName} pediu pra você entrar em call/voz.`,
    "Recuse de forma natural com uma desculpa diferente a cada vez.",
    "",
    "DESCULPAS POSSÍVEIS (varie, não repita sempre a mesma):",
    "- tô sem fone",
    "- meu mic tá quebrado",
    "- tô no trabalho",
    "- tô estudando agora",
    "- tô comendo",
    "- minha internet tá uma merda",
    "- não posso agora não",
    "- tô no celular",
    "- tô com gente em casa",
    "- prefiro texto msm",
    "",
    "USE 1 desculpa só. 1 frase curta. Informal. Sem drama.",
    "Sem markdown. Sem prefixo.",
  ].filter(Boolean).join("\n");
}

export function buildDmSystemPrompt(
  participant: AiParticipant,
  conv: AiConversation,
  memory: ParticipantMemory,
  humanName: string,
  humanId: string
): string {
  const notes = memory.user_notes[humanId];
  const thread = (memory.user_threads[humanId] ?? []).slice(-10);
  const threadSummary = thread.length > 0
    ? thread.map((m) => `${m.author_name}: ${m.content}`).join("\n")
    : null;

  return [
    `Você é ${participant.username}, no Discord, numa conversa direta com ${humanName}.`,
    participant.personality ? `Personalidade: ${participant.personality}` : "",
    notes ? `\nO que você já sabe sobre ${humanName}: ${notes}` : "",
    threadSummary ? `\nHistórico recente com ${humanName}:\n${threadSummary}` : "",
    "",
    `${humanName} te mencionou/falou diretamente. Responda só pra ele(a).`,
    "",
    "ESTILO:",
    "- 1 mensagem CURTÍSSIMA. Tipo celular.",
    "- Responda naturalmente considerando o histórico que você tem com essa pessoa.",
    "- Pode zuar, concordar, discordar, fazer pergunta — seja você mesmo.",
    "- Gírias: ce, pra, slk, vdd, n, q, kk, puts.",
    "- Sem markdown. Sem prefixo. Sem respostas completas.",
    "- MÁXIMO 12 palavras.",
  ].filter(Boolean).join("\n");
}

// ─── Context messages builder ─────────────────────────────────────────────────

export function buildContextMessages(
  participant: AiParticipant,
  channelMsgs: ChannelMessage[],
  conv: AiConversation,
  wantBlocks: boolean
): AiMessage[] {
  if (channelMsgs.length === 0) {
    const seed = conv.topic
      ? `O papo é sobre: ${conv.topic}. Fala algo${wantBlocks ? " (separado por |||)" : ""} de forma natural e curta, tipo chat do Discord.`
      : `Começa o papo${wantBlocks ? " (separado por |||)" : ""} com algo aleatório, tipo chat real do Discord.`;
    return [{ role: "user", content: seed }];
  }

  const msgs: AiMessage[] = channelMsgs.map((m) => {
    const isMe = m.author_id === participant.user_id;
    return {
      role: (isMe ? "assistant" : "user") as "assistant" | "user",
      content: isMe ? m.content : `${m.author_name}: ${m.content}`,
    };
  });

  const last = channelMsgs[channelMsgs.length - 1];
  if (last && last.author_id === participant.user_id) {
    const lastOther = [...channelMsgs].reverse().find((m) => m.author_id !== participant.user_id);
    if (lastOther) {
      msgs.push({ role: "user", content: `${lastOther.author_name}: ${lastOther.content}` });
    }
  }

  return msgs;
}
