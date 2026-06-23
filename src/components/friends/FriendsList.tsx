import { useMemo } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { MessageSquare, MoreVertical, Compass } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { UserContextMenu } from "@/components/ui/UserContextMenu";

interface Props {
  tab: "online" | "all" | "pending" | "blocked";
  searchQuery: string;
}

export function FriendsList({ tab, searchQuery }: Props) {
  const { activeAccountId, setActiveChannel } = useNavigationStore();
  const relationships = useDiscordStore((s) => activeAccountId ? s.cache.relationships[activeAccountId] : []);
  const presences = useDiscordStore((s) => activeAccountId ? s.cache.presences[activeAccountId] : {});
  const openDM = useDiscordStore((s) => s.openDM);

  const handleOpenDM = async (userId: string) => {
    if (!activeAccountId) return;
    try {
      const dmChannelId = await openDM(activeAccountId, userId);
      setActiveChannel(dmChannelId);
    } catch (e) {
      console.error("Failed to open DM:", e);
    }
  };

  const filteredList = useMemo(() => {
    if (!relationships) return [];
    
    let filtered = relationships;
    
    // Filtro por tab (Tipo de relacionamento)
    // 1 = friend, 2 = blocked, 3 = incoming, 4 = outgoing
    switch (tab) {
      case "online":
        filtered = filtered.filter(r => r.relationship_type === 1 && presences?.[r.user.id] && presences[r.user.id].status !== "offline");
        break;
      case "all":
        filtered = filtered.filter(r => r.relationship_type === 1);
        break;
      case "pending":
        filtered = filtered.filter(r => r.relationship_type === 3 || r.relationship_type === 4);
        break;
      case "blocked":
        filtered = filtered.filter(r => r.relationship_type === 2);
        break;
    }

    // Filtro por busca
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => {
        const name = r.nickname || r.user.global_name || r.user.username;
        return name.toLowerCase().includes(q) || r.user.username.toLowerCase().includes(q);
      });
    }

    // Ordenar alfabeticamente
    filtered.sort((a, b) => {
      const nameA = a.nickname || a.user.global_name || a.user.username;
      const nameB = b.nickname || b.user.global_name || b.user.username;
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }, [relationships, tab, searchQuery, presences]);

  if (!relationships || filteredList.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        <Compass size={64} style={{ opacity: 0.2, marginBottom: 24 }} />
        <p style={{ fontSize: 15 }}>
          {tab === "online" && "Ninguém por perto para brincar com o Wumpus."}
          {tab === "all" && "Você não tem nenhum amigo adicionado."}
          {tab === "pending" && "Não há pedidos de amizade pendentes."}
          {tab === "blocked" && "Você não tem ninguém bloqueado."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 16 }}>
        {tab === "online" && `Online — ${filteredList.length}`}
        {tab === "all" && `Todos os Amigos — ${filteredList.length}`}
        {tab === "pending" && `Pendente — ${filteredList.length}`}
        {tab === "blocked" && `Bloqueado — ${filteredList.length}`}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {filteredList.map((rel) => {
          const user = rel.user;
          const displayName = rel.nickname || user.global_name || user.username;
          const status = (presences?.[user.id]?.status as any) || "offline";

          return (
            <UserContextMenu key={rel.id} userId={user.id}>
              <div
                onClick={() => handleOpenDM(user.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  borderTop: "1px solid var(--border-subtle)",
                  transition: "background 100ms",
                }}
                className="hover-bg-accent group"
              >
              <div style={{ position: "relative", marginRight: 12 }}>
                <Avatar
                  userId={rel.user.id}
                  avatarHash={rel.user.avatar}
                  avatarDecoration={rel.user.avatar_decoration_data}
                  username={rel.user.username}
                  size={32}
                  showStatus={tab === "online" || tab === "all"}
                  status={status}
                  style={{ background: "var(--bg-primary)" }}
                />
              </div>
              
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)" }}>
                    {displayName}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", display: "none" }} className="group-hover-show">
                    {user.username}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {rel.relationship_type === 3 && "Pedido de Amizade Recebido"}
                  {rel.relationship_type === 4 && "Pedido de Amizade Enviado"}
                  {rel.relationship_type === 1 && (
                    status === "online" ? "Disponível" :
                    status === "idle" ? "Ausente" :
                    status === "dnd" ? "Ocupado" : "Offline"
                  )}
                  {rel.relationship_type === 2 && "Bloqueado"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {(rel.relationship_type === 1) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenDM(user.id); }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--bg-tertiary)",
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      cursor: "pointer",
                    }}
                    className="hover-color-normal"
                  >
                    <MessageSquare size={20} />
                  </button>
                )}
                <button
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    cursor: "pointer",
                  }}
                  className="hover-color-normal"
                >
                  <MoreVertical size={20} />
                </button>
                </div>
              </div>
            </UserContextMenu>
          );
        })}
      </div>
    </div>
  );
}
