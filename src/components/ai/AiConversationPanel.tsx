import { useEffect, useRef, useState } from "react";
import {
  useAiConversationStore,
  type AiConversation,
  type ConvLogEntry,
  type ConvRuntimeInfo,
} from "@/stores/aiConversationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { Play, Pause, Square, X } from "lucide-react";

interface Props {
  channelId: string;
}

export function AiConversationPanel({ channelId }: Props) {
  const { conversations, runtimeStatus, runtimeInfo, runtimeRounds, log,
    startConversation, pauseConversation, stopConversation } = useAiConversationStore();

  // Only show conversations for this channel
  const convs = conversations.filter((c) => c.channel_id === channelId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first running conversation
  useEffect(() => {
    const running = convs.find((c) => runtimeStatus[c.id] === "running");
    if (running && !selectedId) setSelectedId(running.id);
    if (!selectedId && convs.length > 0) setSelectedId(convs[0].id);
  }, [convs.length]);

  const selected = convs.find((c) => c.id === selectedId) ?? convs[0] ?? null;
  const info: ConvRuntimeInfo | null = selected ? (runtimeInfo[selected.id] ?? null) : null;
  const status = selected ? (runtimeStatus[selected.id] ?? "idle") : "idle";
  const rounds = selected ? (runtimeRounds[selected.id] ?? 0) : 0;
  const convLog = log.filter((e) => e.conv_id === selected?.id).slice(-60);

  if (convs.length === 0) return null;

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div style={{
        padding: "10px 12px 8px",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
          Conversas IA — {channelId.slice(0, 8)}
        </div>

        {/* Conv selector tabs */}
        {convs.length > 1 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {convs.map((c) => {
              const s = runtimeStatus[c.id] ?? "idle";
              const isActive = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    fontSize: 11, padding: "2px 8px",
                    borderRadius: 99,
                    border: `1px solid ${isActive ? statusColor(s) : "var(--border-subtle)"}`,
                    background: isActive ? `${statusColor(s)}22` : "transparent",
                    color: isActive ? statusColor(s) : "var(--text-muted)",
                    cursor: "pointer",
                    fontWeight: isActive ? 700 : 400,
                  }}
                >
                  {c.label.slice(0, 12)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && info && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Status bar */}
          <StatusBar conv={selected} info={info} status={status} rounds={rounds}
            onStart={() => startConversation(selected.id)}
            onPause={() => pauseConversation(selected.id)}
            onStop={() => stopConversation(selected.id)}
          />

          {/* Participants queue */}
          <ParticipantsQueue conv={selected} info={info} status={status} />

          {/* Generating indicator or countdown bar */}
          {status === "running" && info.is_generating ? (
            <GeneratingBar
              name={info.generating_participant_name ?? "?"}
              color={info.generating_participant_color ?? "#5865f2"}
            />
          ) : status === "running" && info.countdown_ms != null && info.countdown_total_ms != null ? (
            <CountdownBar
              ms={info.countdown_ms}
              totalMs={info.countdown_total_ms}
              color={info.next_participant_color ?? "#5865f2"}
              label={info.burst_lock_name
                ? `${info.burst_lock_name} digitando...`
                : `${info.next_participant_name ?? "?"} vai falar em`}
            />
          ) : null}

          {/* Log */}
          <ConversationLog entries={convLog} conv={selected} />
        </div>
      )}
    </div>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function StatusBar({ conv, info, status, rounds, onStart, onPause, onStop }: {
  conv: AiConversation;
  info: ConvRuntimeInfo;
  status: string;
  rounds: number;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const canStart = conv.participants.length >= 2 && conv.channel_id;
  const isRunning = status === "running" || status === "generating";
  const isPaused = status === "paused";
  const isError = status === "error";

  return (
    <div style={{
      padding: "8px 12px",
      borderBottom: "1px solid var(--border-subtle)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: statusColor(status),
            boxShadow: isRunning ? `0 0 5px ${statusColor(status)}` : "none",
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: statusColor(status) }}>
            {statusLabel(status)}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>· {rounds} turnos</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {!isRunning && (
            <IconBtn
              title="Iniciar" disabled={!canStart}
              color="var(--status-online)" bg="rgba(59,165,93,0.15)"
              onClick={onStart}
            ><Play size={10} /></IconBtn>
          )}
          {isRunning && (
            <IconBtn title="Pausar" color="#faa61a" bg="rgba(250,166,26,0.15)" onClick={onPause}><Pause size={10} /></IconBtn>
          )}
          {(isRunning || isPaused) && (
            <IconBtn title="Parar" color="var(--text-danger)" bg="rgba(237,66,69,0.1)" onClick={onStop}><Square size={10} /></IconBtn>
          )}
        </div>
      </div>
      {isError && info.error && (
        <div style={{ fontSize: 11, color: "var(--text-danger)", wordBreak: "break-word" }}>
          {info.error.slice(0, 100)}
        </div>
      )}
    </div>
  );
}

// ─── Participants queue ───────────────────────────────────────────────────────

function ParticipantsQueue({ conv, info, status }: {
  conv: AiConversation;
  info: ConvRuntimeInfo;
  status: string;
}) {
  const isRunning = status === "running";

  return (
    <div style={{
      padding: "8px 12px",
      borderBottom: "1px solid var(--border-subtle)",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 2 }}>
        Participantes
      </div>
      {conv.participants.map((p) => {
        const isGenerating = info.is_generating && info.generating_participant_name === p.username;
        const isBursting = info.burst_lock_id === p.id;
        const isNext = info.next_participant_id === p.id && isRunning && !info.burst_lock_id && !info.is_generating;
        const isActive = isNext || isBursting || isGenerating;

        return (
          <div
            key={p.id}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
              background: isActive ? `${p.color}20` : "transparent",
              border: `1px solid ${isActive ? p.color + "44" : "transparent"}`,
              transition: "all 200ms",
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: p.color, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "#fff",
              boxShadow: isActive ? `0 0 8px ${p.color}88` : "none",
              transition: "box-shadow 200ms",
            }}>
              {p.username.slice(0, 1).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: isActive ? 700 : 400,
                color: isActive ? p.color : "var(--text-normal)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {p.username}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {p.config.model.split("/").pop()?.slice(0, 18)}
              </div>
            </div>

            {/* State badge */}
            {isBursting ? (
              <TypingDots color={p.color} />
            ) : isGenerating ? (
              <div style={{ fontSize: 10, color: p.color, fontWeight: 700, flexShrink: 0 }}>
                gerando
              </div>
            ) : isNext ? (
              <div style={{ fontSize: 10, color: p.color, fontWeight: 700, flexShrink: 0 }}>
                próximo
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── Generating bar ───────────────────────────────────────────────────────────

function GeneratingBar({ name, color }: { name: string; color: string }) {
  return (
    <div style={{ padding: "6px 12px", flexShrink: 0, borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{name} gerando resposta...</span>
        <TypingDots color={color} />
      </div>
      <div style={{ height: 3, background: "var(--bg-accent)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: "200%",
          backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animation: "shimmer 1.5s linear infinite",
          borderRadius: 2,
        }} />
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

// ─── Countdown bar ────────────────────────────────────────────────────────────

function CountdownBar({ ms, totalMs, color, label }: {
  ms: number; totalMs: number; color: string; label: string;
}) {
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (ms / totalMs) * 100)) : 0;
  const secs = (ms / 1000).toFixed(1);

  return (
    <div style={{ padding: "6px 12px", flexShrink: 0, borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{secs}s</span>
      </div>
      <div style={{ height: 3, background: "var(--bg-accent)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: "100%",
          background: color,
          borderRadius: 2,
          transform: `scaleX(${pct / 100})`,
          transformOrigin: "left",
          transition: "transform 100ms linear",
        }} />
      </div>
    </div>
  );
}

// ─── Conversation log ─────────────────────────────────────────────────────────

function ConversationLog({ entries, conv }: { entries: ConvLogEntry[]; conv: AiConversation }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, autoScroll]);

  return (
    <div
      style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0" }}
      onScroll={(e) => {
        const el = e.currentTarget;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setAutoScroll(atBottom);
      }}
    >
      {entries.length === 0 ? (
        <div style={{ padding: "12px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Log vazio — inicie a conversa
        </div>
      ) : (
        entries.map((entry, i) => <LogRow key={i} entry={entry} conv={conv} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function LogRow({ entry, conv }: { entry: ConvLogEntry; conv: AiConversation }) {
  const time = new Date(entry.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const color = entry.participant_color;

  if (entry.type === "sent") {
    const blockLabel = entry.block_total && entry.block_total > 1
      ? ` [${entry.block_index}/${entry.block_total}]`
      : "";
    return (
      <div style={{ padding: "3px 12px", display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{time}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color }}>{entry.participant_name}{blockLabel}</span>
        </div>
        <div style={{
          fontSize: 12, color: "var(--text-normal)",
          background: `${color}10`,
          border: `1px solid ${color}30`,
          borderRadius: "var(--radius-sm)",
          padding: "4px 8px",
          wordBreak: "break-word",
          lineHeight: 1.4,
        }}>
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.type === "burst_start") {
    return (
      <div style={{ padding: "1px 12px" }}>
        <span style={{ fontSize: 10, color }}>● {entry.participant_name} iniciou burst ({entry.block_total} msgs)</span>
      </div>
    );
  }

  if (entry.type === "burst_end") {
    return (
      <div style={{ padding: "1px 12px" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>✓ {entry.participant_name} terminou burst</span>
      </div>
    );
  }

  if (entry.type === "skipped") {
    return (
      <div style={{ padding: "1px 12px" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>⟳ {entry.participant_name} — sem novidade, próximo</span>
      </div>
    );
  }

  if (entry.type === "waiting") {
    return (
      <div style={{ padding: "1px 12px" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>⏳ {entry.participant_name} aguardando burst</span>
      </div>
    );
  }

  if (entry.type === "generating") {
    return (
      <div style={{ padding: "1px 12px" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>⟳ {entry.participant_name} gerando...</span>
      </div>
    );
  }

  if (entry.type === "loop_break") {
    return (
      <div style={{ padding: "2px 12px" }}>
        <span style={{ fontSize: 10, color: "#f0a500" }}>↺ Orquestrador: {entry.text}</span>
      </div>
    );
  }

  if (entry.type === "rate_limit") {
    return (
      <div style={{ padding: "2px 12px" }}>
        <span style={{ fontSize: 10, color: "#faa61a" }}>⚠ Rate limit — conversa pausada</span>
      </div>
    );
  }

  if (entry.type === "error") {
    return (
      <div style={{ padding: "2px 12px" }}>
        <span style={{ fontSize: 10, color: "var(--text-danger)" }}><X size={10} style={{ verticalAlign: "middle" }} /> Erro: {entry.text?.slice(0, 60)}</span>
      </div>
    );
  }

  return null;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function TypingDots({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 4, height: 4, borderRadius: "50%", background: color,
            animation: `typingDot 1.2s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

function IconBtn({ children, title, onClick, color, bg, disabled = false }: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  color: string;
  bg: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: bg, border: "none",
        borderRadius: "var(--radius-sm)",
        padding: "3px 8px", fontSize: 11,
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "var(--text-muted)" : color,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function statusColor(s: string): string {
  if (s === "running" || s === "generating") return "var(--status-online)";
  if (s === "paused") return "#faa61a";
  if (s === "error") return "var(--text-danger)";
  return "var(--text-muted)";
}

function statusLabel(s: string): string {
  if (s === "running") return "Rodando";
  if (s === "generating") return "Gerando";
  if (s === "paused") return "Pausada";
  if (s === "error") return "Erro";
  return "Parada";
}
