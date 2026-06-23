import { useState, useRef, useCallback, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: "right" | "top" | "bottom" | "left";
  delay?: number;
}

export function Tooltip({
  content,
  children,
  position = "right",
  delay = 500,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  const positionStyle: Record<string, React.CSSProperties> = {
    right: { left: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" },
    left:  { right: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)" },
    top:   { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    bottom:{ top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  };

  return (
    <div
      style={{ position: "relative", display: "contents" }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          style={{
            position: "fixed",
            zIndex: 9999,
            background: "#111214",
            color: "var(--text-normal)",
            fontSize: 13,
            fontWeight: 600,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-md)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            animation: "fadeIn 100ms ease-out",
            ...positionStyle[position],
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
