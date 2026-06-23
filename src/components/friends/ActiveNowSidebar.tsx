import { useMemo } from "react";
import { Users } from "lucide-react";
import { useDiscordStore } from "@/stores/discordStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { getAvatarUrl } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
export function ActiveNowSidebar() {
  const { activeAccountId } = useNavigationStore();
  const presences = useDiscordStore((s) => activeAccountId ? s.cache.presences[activeAccountId] : {});
  const relationships = useDiscordStore((s) => activeAccountId ? s.cache.relationships[activeAccountId] : []);

  const activeFriends = useMemo(() => {
    if (!presences || !relationships) return [];
    
    const active = [];
    for (const rel of relationships) {
      if (rel.relationship_type === 1) { // Apenas amigos
        const presence = presences[rel.user.id];
        if (presence && presence.activities && presence.activities.length > 0) {
          active.push({ user: rel.user, presence });
        }
      }
    }
    return active;
  }, [presences, relationships]);

  return (
    <div
      style={{
        width: 320,
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        overflowY: "auto",
        flexShrink: 0,
      }}
      className="hide-scrollbar"
    >
      <h3
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: "var(--text-normal)",
          marginBottom: 16,
        }}
      >
        Ativo agora
      </h3>

      {/* Lista real de atividades */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {activeFriends.map(({ user, presence }) => {
          const activity = presence.activities[0];
          let description = activity.state || activity.details || "Em atividade";
          if (activity.type === 0) description = `Jogando ${activity.name}`;
          else if (activity.type === 1) description = `Transmitindo ${activity.name}`;
          else if (activity.type === 2) description = `Ouvindo ${activity.name}`;
          else if (activity.type === 3) description = `Assistindo ${activity.name}`;
          else if (activity.type === 4) description = activity.state || activity.name;

          return (
            <ActiveCard 
              key={user.id}
              username={user.global_name || user.username} 
              description={description}
              userId={user.id}
              avatarHash={user.avatar}
              status={presence.status}
            />
          );
        })}
      </div>

      {activeFriends.length === 0 && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            textAlign: "center",
            color: "var(--text-muted)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Users size={32} opacity={0.3} />
          <p style={{ fontSize: 13 }}>
            Por enquanto é só. Quando seus amigos estiverem em atividades, elas aparecerão aqui!
          </p>
        </div>
      )}
    </div>
  );
}

function ActiveCard({ username, description, userId, avatarHash, status }: { username: string; description: string; userId: string; avatarHash: string | null; status: string }) {
  return (
    <div
      style={{
        background: "var(--bg-tertiary)",
        borderRadius: "var(--radius-md)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        cursor: "pointer",
        border: "1px solid transparent",
        transition: "all 150ms",
      }}
      className="hover-bg-modifier"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-subtle)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Avatar
            userId={userId}
            avatarHash={avatarHash}
            username={username}
            size={32}
            showStatus={true}
            status={status as any}
            style={{ background: "var(--bg-tertiary)" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-normal)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {username}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {description}
          </span>
        </div>
      </div>
    </div>
  );
}
