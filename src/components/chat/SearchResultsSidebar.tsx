import { useEffect, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import * as api from "@/lib/tauri";
import type { DiscordMessage } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { EmbedRenderer } from "./EmbedRenderer";
import { MessageContent } from "./MessageContent";

interface Props {
  accountId: string;
  guildId?: string;
  channelId?: string;
  query: string;
  onClose: () => void;
  onSearch: (q: string) => void;
}

export function SearchResultsSidebar({ accountId, guildId, channelId, query, onClose, onSearch }: Props) {
  const [results, setResults] = useState<DiscordMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(query);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setInputValue(query);
    
    let isMounted = true;
    const fetchResults = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.searchMessages(accountId, query, guildId, channelId);
        if (!isMounted) return;
        
        if (res && res.messages) {
          // Discord returns an array of message groups
          const matchedMessages: DiscordMessage[] = res.messages.map((group: any[]) => {
            // Find the actual matched message (hit: true) or fallback to the first
            return group.find(m => m.hit) || group[0];
          }).filter(Boolean);
          
          setResults(matchedMessages);
        } else {
          setResults([]);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.toString());
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchResults();
    
    return () => { isMounted = false; };
  }, [accountId, guildId, channelId, query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      onSearch(inputValue.trim());
    }
  };

  return (
    <div
      style={{
        width: 380,
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 48,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          zIndex: 2,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-normal)" }}>Resultados da Pesquisa</span>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
          }}
          className="hover-color-normal"
        >
          <X size={18} />
        </button>
      </div>

      {/* Search Input Area */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--bg-tertiary)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 10px",
            gap: 8,
          }}
        >
          <Search size={16} color="var(--text-muted)" />
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar mensagens..."
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-normal)",
              outline: "none",
              width: "100%",
              fontSize: 14,
            }}
          />
        </div>
      </div>

      {/* Results List */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 100, gap: 12 }}>
            <Loader2 size={24} color="var(--text-muted)" className="spin" />
            <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Buscando...</span>
          </div>
        ) : error ? (
          <div style={{ color: "var(--status-danger)", fontSize: 13, textAlign: "center", padding: 20 }}>
            {error}
          </div>
        ) : results.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: 40 }}>
            <Search size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <p style={{ margin: 0 }}>Nenhum resultado encontrado.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>
              {results.length} resultados
            </div>
            
            {results.map((msg) => (
              <div
                key={msg.id}
                style={{
                  background: "var(--bg-primary)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                  transition: "box-shadow 0.2s",
                  cursor: "pointer",
                }}
                className="hover-bg-modifier-hover"
              >
                <div style={{ display: "flex", gap: 10 }}>
                  <Avatar
                    userId={msg.author.id}
                    avatarHash={msg.author.avatar}
                    username={msg.author.username}
                    size={32}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-normal)" }}>
                        {msg.author.global_name || msg.author.username}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text-normal)", wordBreak: "break-word" }}>
                      <MessageContent content={msg.content} />
                      {msg.embeds && msg.embeds.length > 0 && (
                        <EmbedRenderer embeds={msg.embeds} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
