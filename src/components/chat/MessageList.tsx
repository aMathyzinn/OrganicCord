import { useRef, useCallback, useState } from "react";
import type { DiscordMessage, DiscordChannel } from "@/types";
import { MessageItem } from "./MessageItem";
import { formatMessageDate } from "@/lib/utils";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { MessageSquare, Ban } from "lucide-react";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";

interface Props {
  messages: DiscordMessage[];
  isLoading?: boolean;
  currentUserId: string;
  onLoadMore: () => void;
  onReply: (message: DiscordMessage) => void;
  onDelete?: (messageId: string) => void;
  channels?: DiscordChannel[];
}

export function MessageList({
  messages,
  isLoading,
  currentUserId,
  onLoadMore,
  onReply,
  onDelete,
  channels = [],
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [revealedBlockedIds, setRevealedBlockedIds] = useState<Set<string>>(new Set());

  const activeAccountId = useNavigationStore((s) => s.activeAccountId);
  const relationships = useDiscordStore((s) => activeAccountId ? s.cache.relationships[activeAccountId] : null);

  const blockedUserIds = new Set(
    (relationships || [])
      .filter((r) => r.relationship_type === 2)
      .map((r) => r.user.id)
  );

  // Detecta scroll no topo para carregar mais mensagens (mensagens chegam invertidas)
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      // Como a lista é invertida via flex-direction: column-reverse, "topo" é na verdade o fundo do scroll
      if (el.scrollHeight + el.scrollTop - el.clientHeight < 100) {
        onLoadMore();
      }
    },
    [onLoadMore]
  );

  if (isLoading && messages.length === 0) {
    return <LoadingScreen message="Carregando mensagens..." />;
  }

  if (messages.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "var(--text-muted)",
          animation: "fadeIn 200ms ease-out",
        }}
      >
        <MessageSquare size={40} style={{ opacity: 0.4 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>
          Nenhuma mensagem ainda
        </div>
        <div style={{ fontSize: 13, maxWidth: 280, textAlign: "center", lineHeight: 1.5 }}>
          Seja o primeiro a enviar uma mensagem neste canal!
        </div>
      </div>
    );
  }

  // Ordena estritamente por ID (mais novos primeiro) para evitar qualquer embaralhamento
  const isNumericId = (id: string) => /^\d+$/.test(id);
  const sortedMessages = [...messages].sort((a, b) => {
    // IDs não-numéricos (local-, clyde-, etc.) ficam no topo comparados via timestamp
    const isNonNumericA = !isNumericId(a.id);
    const isNonNumericB = !isNumericId(b.id);

    if (isNonNumericA && !isNonNumericB) return -1;
    if (!isNonNumericA && isNonNumericB) return 1;
    if (isNonNumericA && isNonNumericB) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }

    try {
      const idA = BigInt(a.id);
      const idB = BigInt(b.id);
      if (idB > idA) return 1;
      if (idB < idA) return -1;
      return 0;
    } catch {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
  });

  // Agrupa mensagens por data para separadores
  const grouped = groupMessagesByDate(sortedMessages);

  return (
    <div
      onScroll={handleScroll}
      style={{
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column-reverse", // Mostra as mais recentes no fundo
        padding: "16px 0",
      }}
    >
      {/* Marcador do fim para auto-scroll */}
      <div ref={bottomRef} />

      {grouped.map((group) => (
        <div key={group.date} style={{ display: "flex", flexDirection: "column-reverse" }}>
          {group.messages.map((msg, idx) => {
            const prevMsg = group.messages[idx + 1]; // invertido
            const isSystemMessage = msg.type !== 0 && msg.type !== 19 && msg.type !== undefined;
            const prevIsSystemMessage = prevMsg && (prevMsg.type !== 0 && prevMsg.type !== 19 && prevMsg.type !== undefined);

            const isGrouped =
              !isSystemMessage &&
              !prevIsSystemMessage &&
              prevMsg &&
              prevMsg.author.id === msg.author.id &&
              new Date(msg.timestamp).getTime() -
                new Date(prevMsg.timestamp).getTime() <
                5 * 60 * 1000 &&
              new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() >= 0;

            const isBlockedAuthor = blockedUserIds.has(msg.author.id);
            const isRevealed = revealedBlockedIds.has(msg.id);

            if (isBlockedAuthor && !isRevealed) {
              return (
                <div
                  key={msg.id}
                  style={{
                    background: "rgba(242, 63, 67, 0.05)",
                    border: "1px solid rgba(242, 63, 67, 0.15)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    margin: "4px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 13,
                    color: "var(--text-muted)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Ban size={14} color="var(--status-dnd)" />
                    <span>Mensagem de usuário bloqueado</span>
                  </div>
                  <button
                    onClick={() => {
                      setRevealedBlockedIds((prev) => {
                        const next = new Set(prev);
                        next.add(msg.id);
                        return next;
                      });
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-link)",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                    className="hover-underline"
                  >
                    Mostrar mensagem
                  </button>
                </div>
              );
            }

            return (
              <MessageItem
                key={msg.id}
                message={msg}
                isGrouped={!!isGrouped}
                isOwn={msg.author.id === currentUserId}
                onReply={() => onReply(msg)}
                onDelete={onDelete ? () => onDelete(msg.id) : undefined}
                channels={channels}
              />
            );
          })}

          {/* Separador de data */}
          <DateSeparator date={group.date} />
        </div>
      ))}
    </div>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "16px 16px 4px",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {date}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
    </div>
  );
}

function groupMessagesByDate(
  messages: DiscordMessage[]
): { date: string; messages: DiscordMessage[] }[] {
  const groups: Map<string, DiscordMessage[]> = new Map();

  for (const msg of messages) {
    const date = formatMessageDate(msg.timestamp);
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(msg);
  }

  return Array.from(groups.entries()).map(([date, msgs]) => ({ date, messages: msgs }));
}
