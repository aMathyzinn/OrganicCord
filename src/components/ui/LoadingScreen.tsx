interface Props {
  message?: string;
}

export function LoadingScreen({ message = "Carregando..." }: Props) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "var(--text-muted)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: "3px solid var(--bg-accent)",
          borderTopColor: "var(--brand-500)",
          borderRadius: "50%",
          animation: "spin 800ms linear infinite",
        }}
      />
      <span style={{ fontSize: 14 }}>{message}</span>
    </div>
  );
}
