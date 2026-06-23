import { Bot, MessageSquareDashed as Conversations, Settings } from "lucide-react";
import { useAiStore, makeDefaultConfig } from "@/stores/aiStore";
import { useAiConversationStore } from "@/stores/aiConversationStore";

interface ChatAiButtonsProps {
  accountId: string;
  channelId: string;
  activeGuildId: string | null;
  onOpenAi: () => void;
  onOpenConversations: () => void;
}

export function ChatAiButtons({ accountId, channelId, activeGuildId, onOpenAi, onOpenConversations }: ChatAiButtonsProps) {
  const { rules, addRule, toggleRule } = useAiStore();
  const { conversations, runtimeStatus } = useAiConversationStore();

  const runningConvsInChannel = conversations.filter(
    (c: any) => c.channel_id === channelId && runtimeStatus[c.id] === "running"
  ).length;

  const activeRule = rules.find(
    (r: any) => r.account_id === accountId && r.channel_id === channelId && r.enabled
  );
  const anyRule = rules.find(
    (r: any) => r.account_id === accountId && r.channel_id === channelId
  );

  const handleQuickToggleAi = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!anyRule) {
      const globalConfig = useAiStore.getState().globalConfig;
      addRule({
        id: crypto.randomUUID(),
        account_id: accountId,
        channel_id: channelId,
        guild_id: activeGuildId ?? null,
        enabled: true,
        config: globalConfig ?? makeDefaultConfig("openrouter"),
        trigger_prefix: null,
        reply_delay_ms: 1500,
      });
    } else {
      toggleRule(anyRule.id);
    }
  };

  return (
    <>
      {/* AI quick-toggle button */}
      <button
        onClick={handleQuickToggleAi}
        title={activeRule ? "IA ativa neste canal — clique para pausar" : "Ativar IA neste canal"}
        style={{
          background: activeRule ? "rgba(88,101,242,0.2)" : "transparent",
          border: `1px solid ${activeRule ? "var(--brand-500)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 13,
          color: activeRule ? "var(--brand-500)" : "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontWeight: activeRule ? 600 : 400,
          transition: "all 120ms",
        }}
      >
        <Bot size={14} />
        <span>{activeRule ? "IA ativa" : "IA"}</span>
      </button>

      {/* AI conversations button */}
      <button
        onClick={onOpenConversations}
        title="Conversas entre IAs"
        style={{
          background: runningConvsInChannel > 0 ? "rgba(59,165,93,0.15)" : "transparent",
          border: `1px solid ${runningConvsInChannel > 0 ? "var(--status-online)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 13,
          color: runningConvsInChannel > 0 ? "var(--status-online)" : "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontWeight: runningConvsInChannel > 0 ? 600 : 400,
          transition: "all 120ms",
        }}
      >
        <Conversations size={14} />
        <span>{runningConvsInChannel > 0 ? `${runningConvsInChannel} conversa${runningConvsInChannel > 1 ? "s" : ""}` : "Conversas"}</span>
      </button>

      {/* AI settings button */}
      <button
        onClick={onOpenAi}
        title="Configurações de IA"
        className="hover-border-muted hover-color-normal"
        style={{
          background: "transparent",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 8px",
          cursor: "pointer",
          fontSize: 14,
          color: "var(--text-muted)",
          transition: "all 120ms",
        }}
      >
        <Settings size={14} />
      </button>
    </>
  );
}
