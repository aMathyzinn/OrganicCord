import { useState } from "react";
import type { DiscordMessage, DiscordChannel } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { formatTimestamp, getDisplayName } from "@/lib/utils";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { MessageContent } from "./MessageContent";
import { EmbedRenderer } from "./EmbedRenderer";
import { PollRenderer } from "./PollRenderer";
import { MessageComponentsRenderer } from "./MessageComponentsRenderer";
import { MessageContextMenu } from "@/components/ui/MessageContextMenu";
import { Reply, Paperclip, X, SmilePlus, Phone, Pin, BarChart3, Check } from "lucide-react";
import EmojiPicker, { Theme, EmojiClickData, Categories } from "emoji-picker-react";
import * as Popover from "@radix-ui/react-popover";
import { useMemo } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { OrganicMark } from "@/components/ui/OrganicMark";
import { UserProfilePopover } from "@/components/profile/UserProfilePopover";
import { DiscordEmojiPicker } from "./DiscordEmojiPicker";

interface Props {
  message: DiscordMessage;
  isGrouped?: boolean;
  isOwn?: boolean;
  onReply: () => void;
  onDelete?: () => void;
  channels?: DiscordChannel[];
}

export function MessageItem({ message, isGrouped, isOwn, onReply, onDelete, channels = [] }: Props) {
  const [hovered, setHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const { activeAccountId, activeChannelId } = useNavigationStore();
  const { addReaction, removeReaction, pinMessage, unpinMessage } = useDiscordStore();
  
  const guildEmojisRaw = useDiscordStore((s) => activeAccountId ? s.cache.guildEmojis[activeAccountId] : null);

  const customEmojis = useMemo(() => {
    if (!guildEmojisRaw) return [];
    return Object.values(guildEmojisRaw).flat();
  }, [guildEmojisRaw]);

  const author = message.author;
  const displayName = getDisplayName(author);

  const handleEmojiReact = async (emojiData: EmojiClickData) => {
    let emojiStr = emojiData.emoji;
    if (emojiData.isCustom) {
      const customEmoji = emojiData as any;
      emojiStr = `${emojiData.names[0]}:${emojiData.unified || customEmoji.id}`;
    }
    if (activeAccountId && activeChannelId) {
      await addReaction(activeAccountId, activeChannelId, message.id, emojiStr);
    }
    setReactionPickerOpen(false);
  };

  const handleToggleReaction = async (emoji: string, me: boolean) => {
    if (activeAccountId && activeChannelId) {
      if (me) {
        await removeReaction(activeAccountId, activeChannelId, message.id, emoji);
      } else {
        await addReaction(activeAccountId, activeChannelId, message.id, emoji);
      }
    }
  };

  const handlePin = () => {
    if (activeAccountId && activeChannelId) {
      pinMessage(activeAccountId, activeChannelId, message.id);
    }
  };

  const handleUnpin = () => {
    if (activeAccountId && activeChannelId) {
      unpinMessage(activeAccountId, activeChannelId, message.id);
    }
  };

  const isSystemMessage = message.type !== 0 && message.type !== 19 && message.type !== undefined;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      style={{
        display: "flex",
        padding: isGrouped && !isSystemMessage ? "1px 16px 1px 72px" : "8px 16px",
        gap: 16,
        position: "relative",
        background: hovered ? "var(--bg-message-hover)" : "transparent",
        transition: "background 80ms",
      }}
    >
      {/* Avatar ou timestamp (para mensagens agrupadas) */}
      {isGrouped && !isSystemMessage ? (
        hovered && (
          <div
            className="selectable"
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              width: 40,
              textAlign: "center",
              fontSize: 11,
              color: "var(--text-muted)",
              userSelect: "none",
            }}
          >
            {formatTimestamp(message.timestamp)}
          </div>
        )
      ) : isSystemMessage ? (
        <div style={{ flexShrink: 0, marginTop: 2, width: 40, display: "flex", justifyContent: "center" }}>
          {message.type === 6 ? (
            <Pin size={20} style={{ color: "var(--text-positive)" }} />
          ) : message.type === 24 ? (
            <BarChart3 size={20} style={{ color: "var(--text-muted)" }} />
          ) : message.type === 3 ? (
            <Phone size={20} style={{ color: "var(--text-positive)" }} />
          ) : (
            <div style={{ width: 20, height: 20, background: "var(--text-muted)", borderRadius: "50%" }} />
          )}
        </div>
      ) : (
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <UserProfilePopover userId={author.id}>
            <button style={{ background: "transparent", border: "none", padding: 0, outline: "none", cursor: "pointer" }}>
              <div>
                <Avatar
                  userId={author.id}
                  avatarHash={author.avatar}
                  avatarDecoration={author.avatar_decoration_data}
                  username={author.username}
                  size={40}
                />
              </div>
            </button>
          </UserProfilePopover>
        </div>
      )}

      {/* Conteúdo da mensagem */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {!isGrouped && !isSystemMessage && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 2,
            }}
          >
            <UserProfilePopover userId={author.id}>
              <button style={{ background: "transparent", border: "none", padding: 0, outline: "none" }}>
                <span
                  className="hover-underline"
                  style={{
                    fontWeight: 500,
                    color: isOwn ? "var(--brand-500)" : "var(--text-normal)",
                    fontSize: 15,
                    cursor: "pointer",
                    transition: "text-decoration 120ms",
                  }}
                >
                  {displayName}
                </span>
              </button>
            </UserProfilePopover>
            {author.bot && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: "var(--brand-500)",
                  color: "#fff",
                  padding: "1px 5px",
                  borderRadius: "var(--radius-xs)",
                  textTransform: "uppercase",
                }}
              >
                BOT
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
        )}

        {/* Mensagem referenciada (reply) */}
        {message.referenced_message && (
          <ReplyPreview message={message.referenced_message} channels={channels} />
        )}

        {/* Conteúdo de texto */}
        <div
          className="selectable"
          style={{
            fontSize: 15,
            color: message.content ? "var(--text-normal)" : "var(--text-muted)",
            lineHeight: 1.375,
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {message.content ? (
            <MessageContent content={message.content} channels={channels} />
          ) : message.type === 3 ? (
            <span style={{ fontSize: 15, fontWeight: 500 }}>
              {isOwn ? "Você iniciou uma chamada." : `Você perdeu uma chamada de `}
              <span style={{ fontWeight: 600, color: "var(--text-normal)" }}>{displayName}</span>.
            </span>
          ) : message.type === 6 ? (
            <span style={{ fontSize: 15, color: "var(--text-muted)", display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontWeight: 600, color: "var(--text-normal)" }}>{displayName}</span>
              fixou uma mensagem neste canal.
            </span>
          ) : message.type === 24 ? (
            (() => {
              const pollEmbed = message.embeds?.find(e => e.fields?.some(f => f.name === "pollquestiontext"));
              const getField = (name: string) => pollEmbed?.fields?.find(f => f.name === name)?.value;
              const question = getField("pollquestiontext");
              const answerText = getField("victoranswertext");
              const votes = parseInt(getField("victoranswervotes") || "0", 10);
              const totalVotes = parseInt(getField("total_votes") || "0", 10);
              const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 15, color: "var(--text-muted)", lineHeight: 1.4 }}>
                    A pesquisa <strong style={{ color: "var(--text-normal)" }}>{question}</strong> de <strong style={{ color: "var(--text-normal)" }}>{displayName}</strong> foi encerrada.
                  </span>
                  
                  {answerText && (
                    <div style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: "12px 16px",
                      maxWidth: "400px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text-normal)" }}>
                          {answerText}
                          <div style={{ background: "var(--text-positive)", color: "white", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16 }}>
                            <Check size={10} strokeWidth={3} />
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
                          Resposta vitoriosa • {percentage}%
                        </div>
                      </div>
                      <button style={{
                        background: "var(--bg-modifier-hover)",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        padding: "6px 12px",
                        color: "var(--text-normal)",
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer"
                      }}>
                        Ver Enquete
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (message.embeds && message.embeds.length > 0) || message.poll || (message.components && message.components.length > 0) || (message.attachments && message.attachments.length > 0) ? null : (
            <em style={{ fontSize: 14, color: "var(--text-muted)" }}>
              [mensagem vazia]
            </em>
          )}
        </div>

        {/* Poll */}
        {message.poll && <PollRenderer poll={message.poll} />}

        {/* Anexos */}
        {message.attachments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <AttachmentList attachments={message.attachments} />
            {(!message.content || message.content.trim().length === 0) && (
              <em style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.7 }}>
                [{message.attachments.length} anexo(s)]
              </em>
            )}
          </div>
        )}

        {/* Embeds de bot */}
        {message.embeds && message.embeds.length > 0 && (
          <EmbedRenderer 
            embeds={message.embeds.filter(e => !message.poll || !e.fields?.some(f => f.name === "pollquestiontext"))} 
          />
        )}

        {/* Componentes (Botões, Select Menus, etc) */}
        {message.components && message.components.length > 0 && (
          <MessageComponentsRenderer components={message.components} message={message} />
        )}

        {/* Reações */}
        {message.reactions && message.reactions.length > 0 && (
          <ReactionList reactions={message.reactions} onToggle={handleToggleReaction} />
        )}
      </div>

      {/* Action bar ao hover */}
      {(hovered || reactionPickerOpen) && (
        <div
          style={{
            position: "absolute",
            top: -16,
            right: 16,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            gap: 2,
            padding: "2px 4px",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <ActionButton onClick={onReply} label="Responder">
                <Reply size={16} />
              </ActionButton>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="top" sideOffset={5} style={{ background: "var(--bg-floating)", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500, color: "var(--text-normal)", boxShadow: "0 4px 6px rgba(0,0,0,0.2)" }}>
                Responder
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root>
            {activeAccountId ? (
              <DiscordEmojiPicker 
                accountId={activeAccountId}
                onSelect={(emojiStr) => {
                  const match = emojiStr.match(/<a?:.+:(\d+)>/);
                  if (match) {
                    const id = match[1];
                    const name = emojiStr.split(":")[1];
                    if (activeAccountId && activeChannelId) {
                      addReaction(activeAccountId, activeChannelId, message.id, `${name}:${id}`);
                    }
                  }
                }}
              >
                <Tooltip.Trigger asChild>
                  <ActionButton onClick={() => {}} label="Emojis de Servidor">
                    <OrganicMark size={16} />
                  </ActionButton>
                </Tooltip.Trigger>
              </DiscordEmojiPicker>
            ) : (
              <div />
            )}
            <Tooltip.Portal>
              <Tooltip.Content side="top" sideOffset={5} style={{ background: "var(--bg-floating)", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500, color: "var(--text-normal)", boxShadow: "0 4px 6px rgba(0,0,0,0.2)" }}>
                Emojis de Servidor
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Popover.Root open={reactionPickerOpen} onOpenChange={setReactionPickerOpen}>
            <Popover.Trigger asChild>
              <div>
                <ActionButton onClick={() => {}} label="Adicionar Reação">
                  <SmilePlus size={16} />
                </ActionButton>
              </div>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="top" align="end" sideOffset={10} style={{ zIndex: 100 }}>
                <EmojiPicker
                  onEmojiClick={handleEmojiReact}
                  theme={Theme.DARK}
                  lazyLoadEmojis={true}
                  searchPlaceHolder="Pesquisar emoji..."
                  customEmojis={customEmojis}
                  categoryIcons={{
                    [Categories.CUSTOM]: <OrganicMark size={16} />
                  }}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <ActionButton onClick={onReply} label="Responder">
            <Reply size={16} />
          </ActionButton>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          messageId={message.id}
          content={message.content || ""}
          isOwn={!!isOwn}
          onReply={onReply}
          onDelete={onDelete}
          isPinned={message.pinned}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function ReplyPreview({ message, channels }: { message: DiscordMessage; channels: DiscordChannel[] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 4,
        paddingLeft: 8,
        borderLeft: "2px solid var(--interactive-muted)",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      <Avatar
        userId={message.author.id}
        avatarHash={message.author.avatar}
        avatarDecoration={message.author.avatar_decoration_data}
        username={message.author.username}
        size={16}
      />
      <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>
        {getDisplayName(message.author)}
      </span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 300,
        }}
      >
        {message.content ? (
          <MessageContent content={message.content} channels={channels} />
        ) : "[anexo]"}
      </span>
    </div>
  );
}

function AttachmentList({
  attachments,
}: {
  attachments: import("@/types").Attachment[];
}) {
  const { setFocusedImage } = useNavigationStore();

  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
      {attachments.map((att) => {
        const isImage = att.content_type?.startsWith("image/");
        return isImage ? (
          <img
            key={att.id}
            src={att.url}
            alt={att.filename}
            style={{
              maxWidth: 400,
              maxHeight: 300,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
            }}
            onClick={() => setFocusedImage(att.url)}
          />
        ) : (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 12px",
              color: "var(--text-link)",
              fontSize: 14,
            }}
          >
            <Paperclip size={14} style={{ flexShrink: 0 }} /> {att.filename}
          </a>
        );
      })}
    </div>
  );
}

function ReactionList({
  reactions,
  onToggle,
}: {
  reactions: import("@/types").Reaction[];
  onToggle: (emojiName: string, me: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {reactions.map((r, i) => (
        <div
          key={i}
          onClick={() => onToggle(r.emoji.name, !!r.me)}
          style={{
            background: r.me ? "rgba(88,101,242,0.15)" : "var(--bg-secondary)",
            border: `1px solid ${r.me ? "rgba(88,101,242,0.4)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-full)",
            padding: "2px 8px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {r.emoji.id ? (
            <img
              src={`https://cdn.discordapp.com/emojis/${r.emoji.id}.webp?size=20`}
              alt={r.emoji.name}
              style={{ width: 18, height: 18, verticalAlign: "middle" }}
            />
          ) : (
            <span>{r.emoji.name}</span>
          )}
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
            {r.count}
          </span>
        </div>
      ))}
    </div>
  );
}

import { forwardRef } from "react";

const ActionButton = forwardRef<HTMLButtonElement, {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}>(({ onClick, label, children }, ref) => {
  return (
    <button
      ref={ref}
      onClick={onClick}
      title={label}
      className="hover-bg-accent hover-color-normal"
      style={{
        background: "transparent",
        border: "none",
        borderRadius: "var(--radius-xs)",
        width: 28,
        height: 28,
        cursor: "pointer",
        color: "var(--interactive-normal)",
        fontSize: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 80ms, color 80ms",
      }}
    >
      {children}
    </button>
  );
});
ActionButton.displayName = "ActionButton";
