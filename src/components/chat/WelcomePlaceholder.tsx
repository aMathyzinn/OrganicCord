import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { Hash, Home, Mail } from "lucide-react";

export function WelcomePlaceholder() {
  const { activeGuildId, activeAccountId, view } = useNavigationStore();
  const { cache } = useDiscordStore();

  const guilds = activeAccountId ? (cache.guilds[activeAccountId] ?? []) : [];
  const activeGuild = guilds.find((g) => g.id === activeGuildId);

  let title = "Selecione um canal";
  let subtitle = "Escolha um canal na barra lateral para começar a conversar.";
  let icon: React.ReactNode = <Hash size={56} />;

  if (!activeGuildId && view === "guilds") {
    title = "Selecione um servidor";
    subtitle = "Escolha um servidor na barra lateral para ver seus canais.";
    icon = <Home size={56} />;
  }

  if (view === "dms" && !activeGuildId) {
    title = "Suas Mensagens Diretas";
    subtitle = "Selecione uma conversa para começar.";
    icon = <Mail size={56} />;
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--text-muted)",
        animation: "fadeIn 200ms ease-out",
      }}
    >
      {activeGuild?.icon ? (
        <img
          src={`https://cdn.discordapp.com/icons/${activeGuild.id}/${activeGuild.icon}.webp?size=128`}
          alt={activeGuild.name}
          style={{
            width: 72,
            height: 72,
            borderRadius: "var(--radius-lg)",
            marginBottom: 8,
          }}
        />
      ) : (
        <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>{icon}</div>
      )}

      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--text-normal)",
        }}
      >
        {activeGuild?.name ?? title}
      </h2>
      <p style={{ fontSize: 14, maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>
        {subtitle}
      </p>
    </div>
  );
}
