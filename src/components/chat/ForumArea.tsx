import { useEffect, useState } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useAccountStore } from "@/stores/accountStore";
import { MessagesSquare, MessageCircle, Pin, Hash, Search, ArrowUpDown, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { DiscordThread, DiscordForumTag } from "@/types";

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
  
  if (diffInDays > 30) return "Há +30d";
  if (diffInDays > 0) return `Há ${diffInDays}d`;
  if (diffInHours > 0) return `Há ${diffInHours}h`;
  return "Agora";
}

export function ForumArea({ channelId, guildId, accountId }: Props) {
  const { cache, loading, fetchForumThreads } = useDiscordStore();
  const { setActiveChannel } = useNavigationStore();
  const { accounts } = useAccountStore();
  const [searchQuery, setSearchQuery] = useState("");

  const account = accounts.find(a => a.id === accountId);
  const activeChannel = cache.channels[guildId]?.find(c => c.id === channelId);

  useEffect(() => {
    fetchForumThreads(accountId, channelId, guildId);
  }, [channelId, guildId, accountId, fetchForumThreads]);

  const channelThreads = cache.threads[channelId] || [];
  const guildThreads = cache.threads[guildId] || [];
  
  // Combina as threads
  const allThreadsMap = new Map();
  for (const t of channelThreads) allThreadsMap.set(t.id, t);
  for (const t of guildThreads) {
    if (t.parent_id === channelId) allThreadsMap.set(t.id, t);
  }

  const forumThreads = Array.from(allThreadsMap.values());
  const isLoading = loading.threads[channelId];
  
  // Sorting: Pinned first, then by latest message (or id)
  const sortedThreads = [...forumThreads].sort((a: any, b: any) => {
    // Basic sort by ID descending (newer first)
    return BigInt(b.id) > BigInt(a.id) ? 1 : -1;
  });

  const availableTags: DiscordForumTag[] = activeChannel?.available_tags || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
      {/* Header do Fórum (padrão de canais) */}
      <div style={{
        height: 48, padding: "0 16px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid var(--border-subtle)", flexShrink: 0, background: "var(--bg-primary)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)", zIndex: 10
      }}>
        <span style={{ color: "var(--channel-icon)", display: "flex", alignItems: "center" }}>
          <MessagesSquare size={24} />
        </span>
        <span style={{ fontWeight: 700, color: "var(--text-normal)", fontSize: 16 }}>
          {activeChannel?.name || "Fórum"}
        </span>
        {activeChannel?.topic && (
          <>
            <div style={{ width: 1, height: 20, background: "var(--interactive-muted)", margin: "0 4px" }} />
            <span style={{ fontSize: 14, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300 }}>
              {activeChannel.topic}
            </span>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Forum Controls: Search & New Post */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, background: "var(--bg-secondary)", padding: 16, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="text"
                  placeholder="Buscar ou criar postagem..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%", background: "var(--bg-tertiary)", color: "var(--text-normal)",
                    padding: "8px 12px 8px 36px", borderRadius: 4, outline: "none", border: "none", fontSize: 14,
                    boxSizing: "border-box"
                  }}
                />
                <Search size={18} style={{ position: "absolute", left: 10, top: 9, color: "var(--interactive-normal)" }} />
              </div>
              <button style={{
                background: "var(--brand-experiment)", color: "#fff", fontWeight: 500, padding: "8px 16px",
                borderRadius: 4, border: "none", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8
              }}>
                <MessagesSquare size={16} />
                Nova postagem
              </button>
            </div>
          </div>

          {/* Filters & Tags */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, color: "var(--interactive-normal)",
              background: "var(--bg-secondary)", padding: "6px 12px", borderRadius: 4, fontSize: 14, fontWeight: 500,
              border: "none", cursor: "pointer", flexShrink: 0
            }}>
              <ArrowUpDown size={16} />
              Ordenar e ver
              <ChevronDown size={16} />
            </button>
            
            <div style={{ width: 1, height: 24, background: "var(--background-modifier-accent)", margin: "0 4px", flexShrink: 0 }} />

            {availableTags.slice(0, 8).map(tag => (
              <button key={tag.id} style={{
                background: "var(--bg-secondary)", color: "var(--interactive-normal)",
                padding: "6px 12px", borderRadius: 4, fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer", flexShrink: 0
              }}>
                {tag.name}
              </button>
            ))}
            {availableTags.length > 8 && (
              <button style={{
                background: "var(--bg-secondary)", color: "var(--interactive-normal)", padding: "6px 12px", borderRadius: 4,
                fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4
              }}>
                Todos <ChevronDown size={16} />
              </button>
            )}
          </div>

          {/* Posts List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {isLoading && forumThreads.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", marginTop: 16 }}>Carregando posts do fórum...</div>
            ) : forumThreads.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", marginTop: 16 }}>Nenhum post ativo neste fórum.</div>
            ) : (
              sortedThreads.map((thread: DiscordThread) => {
                const author = thread.message?.author;
                const postTags = thread.applied_tags?.map(id => availableTags.find(t => t.id === id)).filter(Boolean) || [];
                const attachment = thread.message?.attachments?.[0];
                const reactions = thread.message?.reactions || [];
                
                const firstReaction = reactions[0];
                const reactionCount = reactions.reduce((acc, r) => acc + r.count, 0);

                return (
                  <div
                    key={thread.id}
                    onClick={() => setActiveChannel(thread.id)}
                    style={{
                      background: "var(--bg-secondary)", borderRadius: 8, padding: 16, display: "flex",
                      justifyContent: "space-between", gap: 16, cursor: "pointer", border: "1px solid transparent",
                      transition: "background 150ms, border-color 150ms"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--background-modifier-hover)";
                      e.currentTarget.style.borderColor = "var(--border-subtle)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--bg-secondary)";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    {/* Left Content */}
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                      {/* Top row: Tags */}
                      {postTags.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, overflow: "hidden", flexWrap: "wrap" }}>
                          {postTags.map(tag => (
                            <span key={tag?.id} style={{
                              fontSize: 12, fontWeight: 600, color: "var(--interactive-normal)",
                              background: "var(--bg-primary)", padding: "2px 8px", borderRadius: 4,
                              border: "1px solid var(--border-subtle)"
                            }}>
                              {tag?.name}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Title */}
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-normal)", margin: "0 0 4px 0" }}>
                        {thread.name}
                      </h3>
                      
                      {/* Content Preview */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        {author && (
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#F1C40F" }}>
                            {author.global_name || author.username}:
                          </span>
                        )}
                        <span style={{ fontSize: 14, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "80%" }}>
                          {thread.message?.content ? thread.message.content : "Clique para ver o conteúdo do post..."}
                        </span>
                      </div>

                      {/* Bottom Row: Interactions */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto", paddingTop: 8 }}>
                        {/* Reactions Badge */}
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6, color: "var(--interactive-normal)",
                          background: "var(--bg-primary)", padding: "4px 8px", borderRadius: 4,
                          border: "1px solid var(--border-subtle)", fontSize: 13, fontWeight: 500
                        }}>
                          <span>
                            {firstReaction?.emoji?.id ? (
                              <img src={`https://cdn.discordapp.com/emojis/${firstReaction.emoji.id}.png`} style={{ width: 16, height: 16, objectFit: "contain", verticalAlign: "middle" }} alt="" />
                            ) : firstReaction?.emoji?.name ? (
                              firstReaction.emoji.name
                            ) : "👍"}
                          </span>
                          <span>{reactionCount || 1}</span>
                        </div>
                        
                        {/* Message Count */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 12, fontWeight: 500 }}>
                          <MessageCircle size={14} />
                          {thread.message_count}
                        </div>
                        
                        {/* Time */}
                        <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 500 }}>
                          {formatForumDate(thread.message?.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Right Content: Thumbnail */}
                    {attachment && attachment.content_type?.startsWith("image/") && (
                      <div style={{
                        flexShrink: 0, width: 80, height: 80, background: "var(--bg-tertiary)",
                        borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                        border: "1px solid var(--border-subtle)"
                      }}>
                        <img 
                          src={attachment.proxy_url || attachment.url} 
                          alt="thumbnail" 
                          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = "0.9"}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
