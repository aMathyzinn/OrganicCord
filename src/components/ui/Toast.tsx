import { create } from "zustand";
import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, Info, X } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id }],
    }));
    // Auto-dismiss
    const duration = toast.duration ?? 3500;
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({
          toasts: s.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));

// ─── Convenience helpers ────────────────────────────────────────────────────

export const toast = {
  success: (message: string) => useToastStore.getState().addToast({ type: "success", message }),
  error: (message: string) => useToastStore.getState().addToast({ type: "error", message }),
  warning: (message: string) => useToastStore.getState().addToast({ type: "warning", message }),
  info: (message: string) => useToastStore.getState().addToast({ type: "info", message }),
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastToast key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function ToastToast({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Animate out before removal
    const duration = t.duration ?? 3500;
    const exitTime = 300;
    if (duration > 0) {
      const timer = setTimeout(() => setExiting(true), duration - exitTime);
      return () => clearTimeout(timer);
    }
  }, [t.duration]);

  const config = TOAST_CONFIG[t.type];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
        minWidth: 280,
        maxWidth: 420,
        boxShadow: "var(--shadow-lg)",
        animation: exiting ? "toastOut 250ms ease-in forwards" : "toastIn 200ms ease-out",
        pointerEvents: "auto",
      }}
    >
      <config.icon size={18} style={{ color: config.color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, color: "var(--text-normal)", lineHeight: 1.4 }}>
        {t.message}
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          padding: 2,
          display: "flex",
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Config ─────────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<ToastType, {
  icon: typeof CheckCircle;
  color: string;
  bg: string;
  border: string;
}> = {
  success: {
    icon: CheckCircle,
    color: "var(--status-online)",
    bg: "rgba(35, 165, 90, 0.1)",
    border: "rgba(35, 165, 90, 0.3)",
  },
  error: {
    icon: XCircle,
    color: "var(--text-danger)",
    bg: "rgba(237, 66, 69, 0.1)",
    border: "rgba(237, 66, 69, 0.3)",
  },
  warning: {
    icon: AlertTriangle,
    color: "var(--text-warning)",
    bg: "rgba(250, 166, 26, 0.1)",
    border: "rgba(250, 166, 26, 0.3)",
  },
  info: {
    icon: Info,
    color: "var(--text-link)",
    bg: "rgba(0, 168, 252, 0.1)",
    border: "rgba(0, 168, 252, 0.3)",
  },
};
