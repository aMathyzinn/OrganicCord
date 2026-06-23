import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigationStore } from "@/stores/navigationStore";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "@/components/ui/Toast";

import type { DiscordMessage } from "@/types";
import { useDiscordStore } from "@/stores/discordStore";
import { sendInteraction } from "@/lib/tauri";

interface ComponentProps {
  components: any[];
  message: DiscordMessage;
}

export function MessageComponentsRenderer({ components, message }: ComponentProps) {
  if (!components || components.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {components.map((row, i) => (
        row.type === 1 ? (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {row.components?.map((comp: any, j: number) => (
              <MessageComponentItem key={j} comp={comp} message={message} />
            ))}
          </div>
        ) : null
      ))}
    </div>
  );
}

function MessageComponentItem({ comp, message }: { comp: any; message: DiscordMessage }) {
  const [hovered, setHovered] = useState(false);

  if (comp.type === 2) {
    // Button
    const isLink = comp.style === 5;
    const isPrimary = comp.style === 1;
    const isSuccess = comp.style === 3;
    const isDanger = comp.style === 4;
    
    const baseBg = isPrimary ? "#5865f2" : isSuccess ? "#248046" : isDanger ? "#da373c" : "#4e5058";
    const hoverBg = isPrimary ? "#4752c4" : isSuccess ? "#1a6334" : isDanger ? "#a12828" : "#6d6f78";

    // Detect internal Discord links
    let isInternalLink = false;
    let internalChannelId = "";
    if (isLink && comp.url) {
      const match = comp.url.match(/discord\.com\/channels\/(\d+|@me)\/(\d+)/);
      if (match) {
        isInternalLink = true;
        internalChannelId = match[2];
      }
    }

    const content = (
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: hovered && (!comp.disabled || isLink) ? hoverBg : baseBg,
          color: "white",
          border: "none",
          borderRadius: "var(--radius-sm)",
          padding: "6px 16px",
          fontSize: 14,
          fontWeight: 500,
          cursor: (isLink || !comp.disabled) ? "pointer" : "not-allowed",
          opacity: comp.disabled && !isLink ? 0.5 : 1,
          textDecoration: "none",
          fontFamily: "inherit",
          minHeight: 32,
          transition: "background 0.1s ease-in-out",
        }}
        onClick={async (e) => {
          if (isInternalLink) {
            e.preventDefault();
            useNavigationStore.getState().setActiveChannel(internalChannelId);
          } else if (!isLink) {
            e.preventDefault();
            const activeAccount = useNavigationStore.getState().activeAccountId;
            const activeChannel = useNavigationStore.getState().activeChannelId;
            const activeGuild = useNavigationStore.getState().activeGuildId;
            
            if (!activeAccount || !activeChannel) return;
            const sessionId = useDiscordStore.getState().cache.session_ids[activeAccount];
            if (!sessionId) {
              toast.error("Erro: Sessão não encontrada. Tente reconectar.");
              return;
            }
            try {
              await sendInteraction(
                activeAccount,
                message.author.id, // application_id is usually author id
                activeChannel,
                activeGuild ?? undefined,
                message.id,
                sessionId,
                comp.custom_id,
                2, // component_type: button
              );
              toast.success("Interação enviada com sucesso!");
            } catch (err: any) {
              toast.error(err.toString());
            }
          }
        }}
        disabled={comp.disabled && !isLink}
      >
        {comp.emoji && (
          <img
            src={`https://cdn.discordapp.com/emojis/${comp.emoji.id}.${comp.emoji.animated ? "gif" : "webp"}?size=16`}
            alt={comp.emoji.name}
            style={{ width: 16, height: 16, objectFit: "contain" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        {comp.label && <span>{comp.label}</span>}
        {isLink && !isInternalLink && <ExternalLink size={14} style={{ opacity: 0.8 }} />}
      </button>
    );

    if (isLink && comp.url && !isInternalLink) {
      return (
        <a href={comp.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          {content}
        </a>
      );
    }

    return content;
  }

  if (comp.type === 3 || comp.type === 5 || comp.type === 6 || comp.type === 7 || comp.type === 8) {
    // Select Menu
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={comp.disabled}>
          <button
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              background: "var(--bg-tertiary)",
              border: `1px solid ${hovered && !comp.disabled ? "var(--interactive-hover)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "8px 12px",
              color: "var(--text-normal)",
              fontSize: 14,
              cursor: comp.disabled ? "not-allowed" : "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              maxWidth: 400,
              opacity: comp.disabled ? 0.5 : 1,
              transition: "border-color 0.1s",
              outline: "none",
            }}
          >
            <span style={{ color: comp.placeholder ? "var(--text-muted)" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {comp.placeholder || "Escolha uma opção..."}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 8 }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            style={{
              minWidth: 300,
              maxWidth: 400,
              background: "var(--bg-float)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: 6,
              boxShadow: "var(--shadow-lg)",
              zIndex: 1000,
              maxHeight: 300,
              overflowY: "auto",
            }}
          >
            {comp.options?.map((opt: any, i: number) => (
              <DropdownMenu.Item
                key={i}
                onSelect={async () => {
                  const activeAccount = useNavigationStore.getState().activeAccountId;
                  const activeChannel = useNavigationStore.getState().activeChannelId;
                  const activeGuild = useNavigationStore.getState().activeGuildId;
                  
                  if (!activeAccount || !activeChannel) return;
                  const sessionId = useDiscordStore.getState().cache.session_ids[activeAccount];
                  if (!sessionId) {
                    toast.error("Erro: Sessão não encontrada. Tente reconectar.");
                    return;
                  }
                  try {
                    await sendInteraction(
                      activeAccount,
                      message.author.id, // application_id is usually author id
                      activeChannel,
                      activeGuild ?? undefined,
                      message.id,
                      sessionId,
                      comp.custom_id,
                      comp.type, // usually 3 for String Select
                      [opt.value]
                    );
                    toast.success("Opção enviada com sucesso!");
                  } catch (err: any) {
                    toast.error(err.toString());
                  }
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  color: "var(--text-normal)",
                  outline: "none",
                }}
                className="hover-bg-modifier-selected"
              >
                {opt.emoji && (
                  <img
                    src={opt.emoji.id ? `https://cdn.discordapp.com/emojis/${opt.emoji.id}.${opt.emoji.animated ? "gif" : "webp"}?size=16` : undefined}
                    alt={opt.emoji.name}
                    style={{ width: 16, height: 16, objectFit: "contain" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 500 }}>{opt.label}</span>
                  {opt.description && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{opt.description}</span>
                  )}
                </div>
              </DropdownMenu.Item>
            ))}
            
            {(!comp.options || comp.options.length === 0) && (
              <div style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
                Opções não renderizadas (Select Dinâmico)
              </div>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  return null;
}
