import { useEffect, useRef } from "react";
import { Copy, Reply, Trash2, Pin, User } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { useProfileStore } from "@/stores/profileStore";

interface MessageContextMenuProps {
  x: number;
  y: number;
  messageId: string;
  content: string;
  isOwn: boolean;
  authorId?: string;
  onReply: () => void;
  onDelete?: () => void;
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  onClose: () => void;
}

export function MessageContextMenu({
  x,
  y,
  messageId,
  content,
  isOwn,
  authorId,
  onReply,
  onDelete,
  isPinned,
  onPin,
  onUnpin,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { openProfile } = useProfileStore();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Delay to avoid the same right-click closing immediately
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Mensagem copiada");
    } catch {
      // Fallback for environments without clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Mensagem copiada");
    }
    onClose();
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(messageId).catch(() => {});
    toast.success("ID da mensagem copiado");
    onClose();
  };

  const handleReply = () => {
    onReply();
    onClose();
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose();
    }
  };

  const handlePin = () => {
    if (isPinned && onUnpin) onUnpin();
    else if (!isPinned && onPin) onPin();
    onClose();
  };

  const handleViewProfile = () => {
    if (authorId) openProfile(authorId);
    onClose();
  };

  // Keep menu within viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(y, window.innerHeight - 280),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 9999,
    background: "var(--bg-float)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow-lg)",
    minWidth: 180,
    padding: "4px 0",
    userSelect: "none",
    animation: "fadeIn 80ms ease-out",
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      <ContextMenuItem
        icon={<Reply size={14} />}
        label="Responder"
        onClick={handleReply}
      />
      {authorId && (
        <ContextMenuItem
          icon={<User size={14} />}
          label="Ver Perfil"
          onClick={handleViewProfile}
        />
      )}
      <ContextMenuItem
        icon={<Copy size={14} />}
        label="Copiar texto"
        onClick={handleCopy}
      />
      <ContextMenuItem
        icon={<Copy size={14} />}
        label="Copiar ID da mensagem"
        onClick={handleCopyId}
      />

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />

      {(onPin || onUnpin) && (
        <ContextMenuItem
          icon={<Pin size={14} />}
          label={isPinned ? "Desfixar Mensagem" : "Fixar Mensagem"}
          onClick={handlePin}
        />
      )}

      {isOwn && onDelete && (
        <ContextMenuItem
          icon={<Trash2 size={14} />}
          label="Excluir mensagem"
          danger
          onClick={handleDelete}
        />
      )}
    </div>
  );
}

function ContextMenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
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
        fontSize: 13,
        color: danger ? "var(--text-danger)" : "var(--text-normal)",
        cursor: "pointer",
        transition: "background 80ms",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ flexShrink: 0, display: "flex", color: danger ? "var(--text-danger)" : "var(--text-muted)" }}>
        {icon}
      </span>
      {label}
    </button>
  );
}
