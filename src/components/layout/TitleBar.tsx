import { minimizeWindow, maximizeWindow, closeWindow } from "@/lib/tauri";
import { OrganicMark } from "@/components/ui/OrganicMark";

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      style={{
        height: 32,
        background: "var(--bg-float)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px 0 16px",
        flexShrink: 0,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <OrganicMark size={14} color="var(--status-online)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>
          OrganicCord
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 2,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties}
      >
        <TitleBarButton
          onClick={minimizeWindow}
          label="Minimizar"
          hoverColor="#404249"
        >
          <MinimizeIcon />
        </TitleBarButton>
        <TitleBarButton
          onClick={maximizeWindow}
          label="Maximizar"
          hoverColor="#404249"
        >
          <MaximizeIcon />
        </TitleBarButton>
        <TitleBarButton
          onClick={closeWindow}
          label="Fechar"
          hoverColor="#f23f43"
        >
          <CloseIcon />
        </TitleBarButton>
      </div>
    </div>
  );
}

function TitleBarButton({
  onClick,
  label,
  hoverColor,
  children,
}: {
  onClick: () => void;
  label: string;
  hoverColor: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="titlebar-btn"
      style={{
        width: 32,
        height: 24,
        background: "transparent",
        border: "none",
        borderRadius: "var(--radius-xs)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        "--hover-bg": hoverColor,
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = hoverColor;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

const MinimizeIcon = () => (
  <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
    <rect width="10" height="1" rx="0.5" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
    <line x1="0" y1="0" x2="10" y2="10" />
    <line x1="10" y1="0" x2="0" y2="10" />
  </svg>
);
