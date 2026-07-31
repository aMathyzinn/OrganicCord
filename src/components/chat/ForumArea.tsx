import { useEffect, useState, useCallback } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useAccountStore } from "@/stores/accountStore";
import {
  MessagesSquare, MessageCircle, Search, ArrowUpDown, ChevronDown,
  X, Plus, Tag, Loader2, CheckCircle, AlertCircle
} from "lucide-react";
import type { DiscordThread, DiscordForumTag } from "@/types";
import { createForumPost } from "@/lib/tauri";

interface Props {
  channelId: string;
  guildId: string;
  accountId: string;
}

function formatForumDate(timestamp?: string) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInMin = Math.floor(diffInMs / (1000 * 60));

  if (diffInDays > 30) return `Há ${Math.floor(diffInDays / 30)}m`;
  if (diffInDays >= 7) return `Há ${Math.floor(diffInDays / 7)}sem`;
  if (diffInDays > 0) return `Há ${diffInDays}d`;
  if (diffInHours > 0) return `Há ${diffInHours}h`;
  if (diffInMin > 0) return `Há ${diffInMin}min`;
  return "Agora";
}

// Renderiza o emoji de reação — custom ou unicode
function ReactionEmoji({ emoji }: { emoji: { id?: string | null; name?: string | null; animated?: boolean } }) {
  if (emoji.id) {
    const ext = emoji.animated ? "gif" : "png";
    return (
      <img
        src={`https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?quality=lossless`}
        alt={emoji.name || "emoji"}
        style={{ width: 16, height: 16, objectFit: "contain", verticalAlign: "middle", display: "inline-block" }}
      />
    );
  }
  return <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji.name || "👍"}</span>;
}

// Extrai a melhor URL de imagem do thread (attachment ou embed)
function getThreadImage(thread: any): string | null {
  const msg = thread.message;
  if (!msg) return null;

  // Prioridade 1: attachment de imagem
  if (msg.attachments?.length) {
    for (const att of msg.attachments) {
      if (att.content_type?.startsWith("image/") || att.url?.match(/\.(png|jpg|jpeg|gif|webp)/i)) {
        return att.proxy_url || att.url;
      }
    }
  }

  // Prioridade 2: embed com thumbnail ou image
  if (msg.embeds?.length) {
    for (const embed of msg.embeds) {
      if (embed.thumbnail?.proxy_url || embed.thumbnail?.url) {
        return embed.thumbnail.proxy_url || embed.thumbnail.url;
      }
      if (embed.image?.proxy_url || embed.image?.url) {
        return embed.image.proxy_url || embed.image.url;
      }
    }
  }

  return null;
}

// Tag Badge com cor opcional
function TagBadge({ tag }: { tag: DiscordForumTag }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      color: "var(--text-muted)",
      background: "var(--bg-primary)",
      padding: "2px 8px",
      borderRadius: 4,
      border: "1px solid var(--border-subtle)",
      whiteSpace: "nowrap",
    }}>
      {tag.emoji_name && <span style={{ fontSize: 12 }}>{tag.emoji_name}</span>}
      {tag.name}
    </span>
  );
}

// Modal de criação de postagem
function CreatePostModal({
  channelId,
  accountId,
  availableTags,
  onClose,
  onCreated,
}: {
  channelId: string;
  accountId: string;
  availableTags: DiscordForumTag[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  };

  const canPublish = title.trim().length > 0 && selectedTags.length > 0;

  const handlePublish = async () => {
    if (!canPublish || loading) return;
    setLoading(true);
    try {
      await createForumPost(accountId, channelId, title.trim(), content.trim(), selectedTags);
      setFeedback({ type: "success", msg: "Postagem criada com sucesso!" });
      onCreated();
      setTimeout(onClose, 1200);
    } catch (e: any) {
      console.error("Erro ao criar postagem:", e);
      setFeedback({ type: "error", msg: "Erro ao criar postagem. Verifique as permissões." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--bg-secondary)",
        borderRadius: 8,
        width: 640,
        maxWidth: "90vw",
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-normal)" }}>Nova postagem</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--interactive-normal)", cursor: "pointer", padding: 4, borderRadius: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Título */}
          <div>
            <input
              type="text"
              placeholder="Título da postagem"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
              style={{
                width: "100%",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                padding: "10px 14px",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-normal)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>
              {title.length}/100
            </div>
          </div>

          {/* Conteúdo */}
          <textarea
            placeholder="Escreva o conteúdo da postagem (opcional)..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 4,
              padding: "10px 14px",
              fontSize: 14,
              color: "var(--text-normal)",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />

          {/* Tags */}
          {availableTags.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Tag size={14} color="var(--text-muted)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Tags
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {availableTags.map(tag => {
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "5px 12px",
                        borderRadius: 4,
                        fontSize: 13,
                        fontWeight: 500,
                        border: "1px solid",
                        cursor: "pointer",
                        transition: "all 150ms",
                        background: isSelected ? "var(--brand-500)" : "var(--bg-primary)",
                        borderColor: isSelected ? "var(--brand-500)" : "var(--border-subtle)",
                        color: isSelected ? "#ffffff" : "var(--text-normal)",
                      }}
                    >
                      {tag.emoji_name && <span>{tag.emoji_name}</span>}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              {selectedTags.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--status-dnd)", marginTop: 6 }}>
                  Escolha uma tag para criar uma postagem neste canal
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "var(--bg-secondary)",
        }}>
          {/* Feedback message */}
          {feedback ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              color: feedback.type === "success" ? "var(--status-positive)" : "var(--status-dnd)",
              fontSize: 13, fontWeight: 500,
            }}>
              {feedback.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {feedback.msg}
            </div>
          ) : (
            <div />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                padding: "8px 16px",
                borderRadius: 4,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handlePublish}
              disabled={!canPublish || loading}
              style={{
                background: canPublish ? "var(--brand-500)" : "var(--interactive-muted)",
                color: canPublish ? "#ffffff" : "var(--text-muted)",
                border: "none",
                borderRadius: 4,
                padding: "8px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: canPublish && !loading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "background 150ms",
              }}
            >
              {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
              Publicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Card de thread de fórum
function ForumThreadCard({
  thread,
  availableTags,
  onClick,
}: {
  thread: DiscordThread;
  availableTags: DiscordForumTag[];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const postTags = (thread.applied_tags || [])
    .map(id => availableTags.find(t => t.id === id))
    .filter(Boolean) as DiscordForumTag[];

  const author = thread.message?.author;
  const previewText = thread.message?.content || "";
  const reactions = thread.message?.reactions || [];
  const imageUrl = getThreadImage(thread);

  // Agrupa reações iguais (por nome ou id)
  const reactionMap = new Map<string, { emoji: any; count: number }>();
  for (const r of reactions) {
    const key = r.emoji?.id || r.emoji?.name || "?";
    if (!reactionMap.has(key)) {
      reactionMap.set(key, { emoji: r.emoji, count: r.count });
    } else {
      reactionMap.get(key)!.count += r.count;
    }
  }
  const groupedReactions = Array.from(reactionMap.values()).slice(0, 5);

  const totalReactions = groupedReactions.reduce((s, r) => s + r.count, 0);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--background-modifier-hover)" : "var(--bg-secondary)",
        border: `1px solid ${hovered ? "var(--border-subtle)" : "transparent"}`,
        borderRadius: 8,
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        cursor: "pointer",
        transition: "background 100ms, border-color 100ms",
      }}
    >
      {/* Left: info */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {/* Tags */}
        {postTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {postTags.map(tag => <TagBadge key={tag.id} tag={tag} />)}
          </div>
        )}

        {/* Title */}
        <h3 style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-normal)",
          margin: "0 0 5px 0",
          lineHeight: 1.3,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {thread.name}
        </h3>

        {/* Preview content */}
        {(author || previewText) && (
          <div style={{
            fontSize: 13,
            color: "var(--text-muted)",
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            overflow: "hidden",
            lineHeight: 1.4,
          }}>
            {author && (
              <span style={{ color: "var(--brand-400)", fontWeight: 600, flexShrink: 0 }}>
                {author.global_name || author.username}:
              </span>
            )}
            <span style={{
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              flex: 1,
              minWidth: 0,
            }}>
              {previewText || "Clique para ver o conteúdo do post..."}
            </span>
          </div>
        )}

        {/* Bottom row: reactions, messages, date */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
          flexWrap: "wrap",
        }}>
          {/* Reactions (individuais como no Discord) */}
          {groupedReactions.map((r, i) => (
            <div key={i} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "var(--bg-primary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--interactive-normal)",
              userSelect: "none",
            }}>
              <ReactionEmoji emoji={r.emoji} />
              <span>{r.count}</span>
            </div>
          ))}

          {/* Message count */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "var(--text-muted)",
            fontSize: 13,
            fontWeight: 500,
          }}>
            <MessageCircle size={14} />
            <span>{thread.message_count ?? 0}</span>
          </div>

          {/* Date */}
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
            {formatForumDate(
              thread.message?.timestamp ||
              thread.thread_metadata?.archive_timestamp ||
              thread.thread_metadata?.create_timestamp || undefined
            )}
          </span>
        </div>
      </div>

      {/* Right: image thumbnail */}
      {imageUrl && (
        <div style={{
          flexShrink: 0,
          width: 88,
          height: 88,
          borderRadius: 6,
          overflow: "hidden",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-subtle)",
          alignSelf: "flex-start",
        }}>
          <img
            src={imageUrl}
            alt="thumbnail"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
    </div>
  );
}

export function ForumArea({ channelId, guildId, accountId }: Props) {
  const { cache, loading, fetchForumThreads } = useDiscordStore();
  const { setActiveChannel } = useNavigationStore();
  const { accounts } = useAccountStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const account = accounts.find(a => a.id === accountId);
  const activeChannel = cache.channels[guildId]?.find(c => c.id === channelId);
  const availableTags: DiscordForumTag[] = (activeChannel as any)?.available_tags || [];

  const loadThreads = useCallback(() => {
    fetchForumThreads(accountId, channelId, guildId);
  }, [accountId, channelId, guildId, fetchForumThreads]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const channelThreads: DiscordThread[] = cache.threads[channelId] || [];
  const guildThreads: DiscordThread[] = cache.threads[guildId] || [];

  const allThreadsMap = new Map<string, DiscordThread>();
  for (const t of channelThreads) allThreadsMap.set(t.id, t);
  for (const t of guildThreads) {
    if ((t as any).parent_id === channelId) allThreadsMap.set(t.id, t);
  }

  let forumThreads = Array.from(allThreadsMap.values());

  // Sort: mais recentes primeiro por ID
  forumThreads.sort((a: any, b: any) => {
    try {
      return BigInt(b.id) > BigInt(a.id) ? 1 : -1;
    } catch {
      return 0;
    }
  });

  // Filter by search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    forumThreads = forumThreads.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.message?.content?.toLowerCase().includes(q)
    );
  }

  // Filter by active tag
  if (activeTagFilter) {
    forumThreads = forumThreads.filter(t =>
      (t.applied_tags || []).includes(activeTagFilter)
    );
  }

  const isLoading = loading.threads[channelId];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
      {/* Header */}
      <div style={{
        height: 48, padding: "0 16px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid var(--border-subtle)", flexShrink: 0,
        background: "var(--bg-primary)", zIndex: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }}>
        <MessagesSquare size={22} color="var(--channel-icon)" />
        <span style={{ fontWeight: 700, color: "var(--text-normal)", fontSize: 16 }}>
          {activeChannel?.name || "Fórum"}
        </span>
        {(activeChannel as any)?.topic && (
          <>
            <div style={{ width: 1, height: 20, background: "var(--interactive-muted)", margin: "0 2px" }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
              {(activeChannel as any).topic}
            </span>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Search + Nova Postagem */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--interactive-normal)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder="Buscar ou criar postagem..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-secondary)",
                  color: "var(--text-normal)",
                  padding: "9px 12px 9px 38px",
                  borderRadius: 4,
                  border: "1px solid var(--border-subtle)",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 150ms",
                }}
                onFocus={e => e.target.style.borderColor = "var(--brand-500)"}
                onBlur={e => e.target.style.borderColor = "var(--border-subtle)"}
              />
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                background: "var(--brand-500)",
                color: "#ffffff",
                fontWeight: 600,
                padding: "9px 18px",
                borderRadius: 4,
                border: "none",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
                transition: "opacity 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <MessagesSquare size={16} />
              Nova postagem
            </button>
          </div>

          {/* Sorting & Tag filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              color: "var(--interactive-normal)", background: "var(--bg-secondary)",
              padding: "6px 12px", borderRadius: 4, fontSize: 13, fontWeight: 500,
              border: "1px solid var(--border-subtle)", cursor: "pointer", flexShrink: 0,
            }}>
              <ArrowUpDown size={14} />
              Ordenar e ver
              <ChevronDown size={14} />
            </button>

            <div style={{ width: 1, height: 22, background: "var(--border-subtle)", margin: "0 2px", flexShrink: 0 }} />

            {availableTags.map(tag => {
              const isActive = activeTagFilter === tag.id;
              return (
                <button
                  key={tag.id}
                  onClick={() => setActiveTagFilter(isActive ? null : tag.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 12px",
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 500,
                    border: "1px solid",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "all 150ms",
                    background: isActive ? "var(--brand-500)" : "var(--bg-secondary)",
                    borderColor: isActive ? "var(--brand-500)" : "var(--border-subtle)",
                    color: isActive ? "#ffffff" : "var(--interactive-normal)",
                  }}
                >
                  {tag.emoji_name && <span>{tag.emoji_name}</span>}
                  {tag.name}
                </button>
              );
            })}
          </div>

          {/* Thread list */}
          {isLoading && forumThreads.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: 48, gap: 16, color: "var(--text-muted)",
            }}>
              <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 14 }}>Carregando postagens...</span>
            </div>
          ) : forumThreads.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: 64, gap: 16, color: "var(--text-muted)",
            }}>
              <MessagesSquare size={48} opacity={0.3} />
              <span style={{ fontSize: 15, fontWeight: 500 }}>
                {searchQuery || activeTagFilter ? "Nenhuma postagem encontrada" : "Nenhuma postagem neste fórum ainda"}
              </span>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  background: "var(--brand-500)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "9px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Plus size={16} />
                Criar primeira postagem
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {forumThreads.map((thread) => (
                <ForumThreadCard
                  key={thread.id}
                  thread={thread}
                  availableTags={availableTags}
                  onClick={() => setActiveChannel(thread.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create post modal */}
      {showCreateModal && (
        <CreatePostModal
          channelId={channelId}
          accountId={accountId}
          availableTags={availableTags}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadThreads}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
