import * as ContextMenu from "@radix-ui/react-context-menu";
import { BellOff, Bell, Copy, ChevronRight } from "lucide-react";
import { useNotificationStore, MUTE_DURATIONS } from "@/stores/notificationStore";

interface ChannelContextMenuProps {
  children: React.ReactNode;
  channelId: string;
}

export function ChannelContextMenu({ children, channelId }: ChannelContextMenuProps) {
  const { isChannelMuted, muteChannel, unmuteChannel } = useNotificationStore();
  const isMuted = isChannelMuted(channelId);

  const handleCopyId = () => {
    navigator.clipboard.writeText(channelId);
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          style={{
            minWidth: 200,
            backgroundColor: "var(--bg-floating)",
            borderRadius: "var(--radius-sm)",
            padding: 8,
            boxShadow: "var(--elevation-high)",
            border: "1px solid var(--border-subtle)",
            zIndex: 100,
          }}
        >
          {isMuted ? (
            <ContextMenu.Item
              className="hover-bg-brand"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--interactive-normal)",
                fontSize: 14,
                fontWeight: 500,
                outline: "none",
              }}
              onClick={() => unmuteChannel(channelId)}
            >
              <Bell size={16} />
              Dessilenciar Canal
            </ContextMenu.Item>
          ) : (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger
                className="hover-bg-brand"
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "var(--interactive-normal)",
                  fontSize: 14,
                  fontWeight: 500,
                  outline: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <BellOff size={16} />
                  Silenciar Canal
                </div>
                <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent
                  style={{
                    minWidth: 170,
                    backgroundColor: "var(--bg-floating)",
                    borderRadius: "var(--radius-sm)",
                    padding: 8,
                    boxShadow: "var(--elevation-high)",
                    border: "1px solid var(--border-subtle)",
                    zIndex: 101,
                  }}
                >
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteChannel(channelId, MUTE_DURATIONS.FIFTEEN_MINS)}
                  >
                    Por 15 minutos
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteChannel(channelId, MUTE_DURATIONS.ONE_HOUR)}
                  >
                    Por 1 hora
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteChannel(channelId, MUTE_DURATIONS.EIGHT_HOURS)}
                  >
                    Por 8 horas
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteChannel(channelId, MUTE_DURATIONS.TWENTY_FOUR_HOURS)}
                  >
                    Por 24 horas
                  </ContextMenu.Item>
                  <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />
                  <ContextMenu.Item
                    className="hover-bg-brand"
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 14, outline: "none" }}
                    onClick={() => muteChannel(channelId, MUTE_DURATIONS.PERMANENT)}
                  >
                    Até que eu reative
                  </ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}

          <ContextMenu.Separator style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />

          <ContextMenu.Item
            className="hover-bg-brand"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--interactive-normal)",
              fontSize: 14,
              fontWeight: 500,
              outline: "none",
            }}
            onClick={handleCopyId}
          >
            <Copy size={16} />
            Copiar ID do Canal
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
