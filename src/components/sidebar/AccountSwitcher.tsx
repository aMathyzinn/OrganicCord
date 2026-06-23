import { useState, useRef, useEffect } from "react";
import { useAccountStore, type PresenceStatus, type CustomStatus } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import type { SessionStatus, StoredAccount } from "@/types";
import { X } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useProfileStore } from "@/stores/profileStore";

interface Props {
  onAddAccount: () => void;
}

function sessionToDisplayStatus(
  sessionStatus: SessionStatus,
  presence: PresenceStatus | undefined
): "online" | "idle" | "dnd" | "invisible" | "offline" | "connecting" | "error" {
  if (sessionStatus === "Connecting") return "connecting";
  if (typeof sessionStatus === "object" && "Error" in sessionStatus) return "error";
  if (sessionStatus !== "Connected") return "offline";
  // Connected — show the desired presence
  return presence ?? "online";
}

const PRESENCE_OPTIONS: { value: PresenceStatus; label: string; color: string }[] = [
  { value: "online",    label: "Online",        color: "var(--status-online)" },
  { value: "idle",      label: "Ausente",       color: "var(--status-idle)" },
  { value: "dnd",       label: "Não perturbe",  color: "var(--status-dnd)" },
  { value: "invisible", label: "Invisível",     color: "var(--status-offline)" },
];

function statusColor(s: ReturnType<typeof sessionToDisplayStatus>): string {
  switch (s) {
    case "online":     return "var(--status-online)";
    case "idle":       return "var(--status-idle)";
    case "dnd":        return "var(--status-dnd)";
    case "invisible":  return "var(--status-offline)";
    case "connecting": return "var(--status-idle)";
    case "error":      return "var(--status-dnd)";
    default:           return "var(--status-offline)";
  }
}

function statusLabel(s: ReturnType<typeof sessionToDisplayStatus>): string {
  switch (s) {
    case "online":     return "Online";
    case "idle":       return "Ausente";
    case "dnd":        return "Não perturbe";
    case "invisible":  return "Invisível";
    case "connecting": return "Conectando...";
    case "error":      return "Erro de conexão";
    default:           return "Offline";
  }
}

// Maps our display status to Avatar's status prop
function toAvatarStatus(s: ReturnType<typeof sessionToDisplayStatus>): "online" | "idle" | "dnd" | "offline" {
  if (s === "online") return "online";
  if (s === "idle" || s === "connecting") return "idle";
  if (s === "dnd" || s === "error") return "dnd";
  return "offline";
}

export function AccountSwitcher({ onAddAccount }: Props) {
  const { accounts, sessions, presenceStatus, customStatus, removeAccount, setPresenceStatus, setCustomStatus, clearCustomStatus, stealthMode, hiddenAccountIds, toggleHideAccount } = useAccountStore();
  const { activeAccountId, setActiveAccount } = useNavigationStore();
  const [contextMenu, setContextMenu] = useState<{ account: StoredAccount; x: number; y: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<StoredAccount | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const handleRemove = async (accountId: string) => {
    setContextMenu(null);
    const account = useAccountStore.getState().accounts.find((a) => a.id === accountId);
    if (account) {
      setConfirmRemove(account);
    }
  };

  const confirmRemoveAccount = async () => {
    if (!confirmRemove) return;
    const accountId = confirmRemove.id;
    const navStore = useNavigationStore.getState();
    const wasActive = navStore.activeAccountId === accountId;
    const accountName = confirmRemove.username;
    setConfirmRemove(null);
    await removeAccount(accountId);
    toast.info(`Conta ${accountName} removida`);
    if (wasActive) {
      const remaining = useAccountStore.getState().accounts;
      if (remaining.length > 0) navStore.setActiveAccount(remaining[0].id);
    }
  };

  const handleSetPresence = async (accountId: string, status: PresenceStatus) => {
    setContextMenu(null);
    await setPresenceStatus(accountId, status);
    const labels: Record<PresenceStatus, string> = { online: "Online", idle: "Ausente", dnd: "Não perturbe", invisible: "Invisível" };
    toast.success(`Status alterado para ${labels[status]}`);
  };

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        gap: 4,
        flexShrink: 0,
      }}
    >
      {accounts.filter((a) => !stealthMode || !hiddenAccountIds.includes(a.id)).map((account) => {
        const session = sessions[account.id];
        const displayStatus = sessionToDisplayStatus(
          session?.status ?? "Disconnected",
          presenceStatus[account.id]
        );
        const isActive = activeAccountId === account.id;

        return (
          <div key={account.id} style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
            <Tooltip
              content={`${account.username} — ${statusLabel(displayStatus)}`}
              position="right"
            >
              <button
                onClick={() => setActiveAccount(account.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ account, x: e.clientX, y: e.clientY });
                }}
                className="account-pill"
                style={{
                  width: 48,
                  height: 48,
                  background: "transparent",
                  border: "none",
                  borderRadius: isActive ? "var(--radius-md)" : "50%",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Avatar
                  userId={account.user_id}
                  avatarHash={account.avatar}
                  username={account.username}
                  size={48}
                  color={account.color}
                  showStatus
                  status={toAvatarStatus(displayStatus)}
                />
              </button>
            </Tooltip>
          </div>
        );
      })}

      {accounts.length > 0 && (
        <div
          style={{
            width: 32,
            height: 2,
            background: "var(--bg-accent)",
            borderRadius: 1,
            margin: "4px 0",
          }}
        />
      )}

      <Tooltip content="Adicionar Conta" position="right">
        <button
          onClick={onAddAccount}
          className="add-account-btn"
          style={{
            width: 48,
            height: 48,
            background: "var(--bg-secondary)",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 300,
          }}
        >
          +
        </button>
      </Tooltip>

      {contextMenu && (
        <AccountContextMenu
          account={contextMenu.account}
          currentPresence={presenceStatus[contextMenu.account.id] ?? "online"}
          currentCustomStatus={customStatus[contextMenu.account.id] ?? null}
          x={contextMenu.x}
          y={contextMenu.y}
          isHidden={hiddenAccountIds.includes(contextMenu.account.id)}
          onClose={() => setContextMenu(null)}
          onRemove={handleRemove}
          onSetPresence={handleSetPresence}
          onSetCustomStatus={(id, status) => setCustomStatus(id, status)}
          onClearCustomStatus={(id) => clearCustomStatus(id)}
          onToggleHide={(id) => { toggleHideAccount(id); setContextMenu(null); }}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remover Conta"
          message={`Tem certeza que deseja remover a conta "${confirmRemove.username}"? A conta será desconectada e removida do OrganicCord. Esta ação não pode ser desfeita.`}
          confirmLabel="Remover"
          danger
          onConfirm={confirmRemoveAccount}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

function AccountContextMenu({
  account,
  currentPresence,
  currentCustomStatus,
  x,
  y,
  isHidden,
  onClose,
  onRemove,
  onSetPresence,
  onSetCustomStatus,
  onClearCustomStatus,
  onToggleHide,
}: {
  account: StoredAccount;
  currentPresence: PresenceStatus;
  currentCustomStatus: CustomStatus | null;
  x: number;
  y: number;
  isHidden: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onSetPresence: (id: string, status: PresenceStatus) => void;
  onSetCustomStatus: (id: string, status: CustomStatus) => void;
  onClearCustomStatus: (id: string) => void;
  onToggleHide: (id: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [customText, setCustomText] = useState(currentCustomStatus?.text ?? "");
  const [customEmoji, setCustomEmoji] = useState(currentCustomStatus?.emojiName ?? "");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const { openProfile } = useProfileStore();

  const handleSaveCustomStatus = () => {
    const trimmed = customText.trim();
    if (!trimmed) {
      onClearCustomStatus(account.id);
    } else {
      onSetCustomStatus(account.id, {
        text: trimmed,
        emojiName: customEmoji.trim() || undefined,
      });
    }
    setShowCustomInput(false);
  };

  const handleClearCustomStatus = () => {
    setCustomText("");
    setCustomEmoji("");
    onClearCustomStatus(account.id);
  };

  // Keep menu within viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(y, window.innerHeight - 380),
    left: Math.min(x, window.innerWidth - 220),
    zIndex: 9999,
    background: "var(--bg-float)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow-md)",
    minWidth: 220,
    padding: "4px 0",
    userSelect: "none",
  };

  return (
    <div ref={menuRef} onClick={(e) => e.stopPropagation()} style={menuStyle}>
      {/* Account info header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-subtle)",
          marginBottom: 4,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-normal)" }}>
          {account.username}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          ID: {account.user_id}
        </div>
      </div>

      {/* Status section */}
      <div style={{ padding: "2px 8px 4px", borderBottom: "1px solid var(--border-subtle)", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", padding: "4px 4px 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Status
        </div>
        {PRESENCE_OPTIONS.map((opt) => (
          <PresenceOption
            key={opt.value}
            label={opt.label}
            color={opt.color}
            active={currentPresence === opt.value}
            onClick={() => onSetPresence(account.id, opt.value)}
          />
        ))}
      </div>

      {/* Custom status section */}
      <div style={{ padding: "2px 8px 4px", borderBottom: "1px solid var(--border-subtle)", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", padding: "4px 4px 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Status personalizado
        </div>

        {currentCustomStatus && !showCustomInput && (
          <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-normal)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentCustomStatus.emojiName && <span style={{ marginRight: 4 }}>{currentCustomStatus.emojiName}</span>}
              {currentCustomStatus.text}
            </span>
            <button
              onClick={handleClearCustomStatus}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 14,
                padding: "2px 4px",
                lineHeight: 1,
              }}
              title="Limpar status"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {showCustomInput ? (
          <div style={{ padding: "4px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                placeholder="😀"
                style={{
                  width: 32,
                  padding: "4px",
                  fontSize: 14,
                  textAlign: "center",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-normal)",
                  outline: "none",
                }}
              />
              <input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveCustomStatus(); }}
                placeholder="No que está pensando?"
                maxLength={128}
                autoFocus
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  fontSize: 13,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-normal)",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowCustomInput(false); setCustomText(currentCustomStatus?.text ?? ""); setCustomEmoji(currentCustomStatus?.emojiName ?? ""); }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "3px 10px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCustomStatus}
                style={{
                  background: "var(--status-online)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "3px 10px",
                  fontSize: 12,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <ContextMenuItem
            label="Definir status personalizado"
            onClick={() => setShowCustomInput(true)}
          />
        )}
      </div>

      <ContextMenuItem
        label="Ver perfil"
        onClick={() => {
          openProfile(account.user_id);
          onClose();
        }}
      />

      <ContextMenuItem
        label={isHidden ? "Mostrar no modo furtivo" : "Ocultar no modo furtivo"}
        onClick={() => onToggleHide(account.id)}
      />

      <ContextMenuItem
        label="Remover conta"
        danger
        onClick={() => onRemove(account.id)}
      />
    </div>
  );
}

function PresenceOption({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={!active ? "hover-bg-accent" : undefined}
      style={{
        width: "100%",
        background: active ? "var(--bg-accent)" : "transparent",
        border: "none",
        padding: "5px 8px",
        textAlign: "left",
        fontSize: 13,
        color: "var(--text-normal)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 4,
        transition: "background 80ms",
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          boxShadow: active ? `0 0 0 2px var(--bg-float)` : "none",
          outline: active ? `2px solid ${color}` : "none",
        }}
      />
      <span>{label}</span>
      {active && (
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 11 }}>✓</span>
      )}
    </button>
  );
}

function ContextMenuItem({
  label,
  danger,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={danger ? "hover-danger-bg" : "hover-bg-accent"}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        padding: "6px 12px",
        textAlign: "left",
        fontSize: 14,
        color: danger ? "var(--text-danger)" : "var(--text-normal)",
        cursor: "pointer",
        transition: "background 80ms",
      }}
    >
      {label}
    </button>
  );
}
