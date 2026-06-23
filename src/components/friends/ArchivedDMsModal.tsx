import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ArchiveRestore } from "lucide-react";
import { useArchiveStore } from "@/stores/archiveStore";
import { useDiscordStore } from "@/stores/discordStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { Avatar } from "@/components/ui/Avatar";
import type { DiscordDM } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

export function ArchivedDMsModal({ isOpen, onClose, accountId }: Props) {
  const archivedDMsIds = useArchiveStore(state => state.archivedDMs[accountId] || []);
  const unarchiveDM = useArchiveStore(state => state.unarchiveDM);
  const { cache } = useDiscordStore();
  const { setActiveChannel } = useNavigationStore();

  const allDMs = cache.dms[accountId] || [];
  const archivedDMs = allDMs.filter(dm => archivedDMsIds.includes(dm.id));

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 440,
            maxHeight: "80vh",
            background: "var(--bg-primary)",
            borderRadius: 12,
            boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            zIndex: 10000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            outline: "none",
            animation: "popIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <Dialog.Title style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: 0 }}>
            Conversas Arquivadas
          </Dialog.Title>

          <div style={{ padding: "24px 24px 0", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Conversas Arquivadas</h2>
            <button 
              onClick={onClose}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 4 }}
              className="hover-color-normal"
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: "0 16px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {archivedDMs.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 15 }}>
                Você não possui nenhuma conversa arquivada no momento.
              </div>
            ) : (
              archivedDMs.map((dm: DiscordDM) => {
                const recipient = dm.recipients[0];
                if (!recipient) return null;
                
                return (
                  <div 
                    key={dm.id}
                    onClick={() => {
                      unarchiveDM(accountId, dm.id);
                      setActiveChannel(dm.id);
                      onClose();
                    }}
                    className="hover-bg-modifier"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px",
                      borderRadius: 8,
                      gap: 12,
                      cursor: "pointer",
                      background: "var(--bg-secondary)"
                    }}
                  >
                    <Avatar
                      userId={recipient.id}
                      avatarHash={recipient.avatar}
                      username={recipient.username}
                      size={40}
                      showStatus={false}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-normal)", fontSize: 15 }} className="truncate">
                        {recipient.global_name ?? recipient.username}
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: 13 }} className="truncate">
                        @{recipient.username}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unarchiveDM(accountId, dm.id);
                      }}
                      title="Desarquivar"
                      className="hover-bg-accent hover-color-normal"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        padding: 8,
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ArchiveRestore size={18} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
