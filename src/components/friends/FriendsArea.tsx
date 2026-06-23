import { useState, useEffect } from "react";
import { Users, HelpCircle, Inbox } from "lucide-react";
import { FriendsList } from "./FriendsList";
import { ActiveNowSidebar } from "./ActiveNowSidebar";
import { ArchivedDMsModal } from "./ArchivedDMsModal";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";

type Tab = "online" | "all" | "pending" | "blocked" | "add";

export function FriendsArea() {
  const [activeTab, setActiveTab] = useState<Tab>("online");
  const [searchQuery, setSearchQuery] = useState("");
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  
  const { activeAccountId } = useNavigationStore();
  const { fetchRelationships } = useDiscordStore();

  useEffect(() => {
    if (activeAccountId) {
      fetchRelationships(activeAccountId);
    }
  }, [activeAccountId, fetchRelationships]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Top Bar */}
      <div
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-primary)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16 }}>
          <Users size={24} color="var(--text-muted)" />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)" }}>
            Amigos
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: "var(--border-subtle)", margin: "0 8px" }} />

        <div style={{ display: "flex", gap: 16, marginLeft: 8, flex: 1 }}>
          <TabButton active={activeTab === "online"} onClick={() => setActiveTab("online")}>
            Disponível
          </TabButton>
          <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
            Todos
          </TabButton>
          <TabButton active={activeTab === "pending"} onClick={() => setActiveTab("pending")}>
            Pendente
          </TabButton>
          <TabButton active={activeTab === "blocked"} onClick={() => setActiveTab("blocked")}>
            Bloqueado
          </TabButton>
          <button
            onClick={() => setActiveTab("add")}
            style={{
              padding: "2px 8px",
              background: activeTab === "add" ? "transparent" : "var(--status-online)",
              color: activeTab === "add" ? "var(--status-online)" : "#fff",
              border: "none",
              borderRadius: "4px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Adicionar amigo
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--text-muted)" }}>
          <button 
            onClick={() => setIsArchiveModalOpen(true)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }} 
            className="hover-color-normal"
            title="Caixa de Arquivados"
          >
            <Inbox size={20} />
          </button>
          <button style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }} className="hover-color-normal">
            <HelpCircle size={20} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Main Content Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
          {activeTab !== "add" ? (
            <>
              {/* Search Bar */}
              <div style={{ padding: "16px 20px 0" }}>
                <input
                  type="text"
                  placeholder="Buscar"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--bg-tertiary)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--text-normal)",
                    outline: "none",
                    fontSize: 14,
                  }}
                />
              </div>
              <FriendsList tab={activeTab} searchQuery={searchQuery} />
            </>
          ) : (
            <div style={{ padding: "20px 30px" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)", marginBottom: 8 }}>
                Adicionar amigo
              </h2>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
                Você pode adicionar um amigo com o nome de usuário dele. Lembre-se das letras maiúsculas e minúsculas!
              </p>
              <div style={{ display: "flex", gap: 16, background: "var(--bg-tertiary)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                <input
                  type="text"
                  placeholder="Você pode adicionar um amigo com o nome de usuário dele."
                  style={{ flex: 1, background: "transparent", border: "none", color: "var(--text-normal)", outline: "none", fontSize: 16 }}
                />
                <button
                  style={{
                    background: "var(--brand-500)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "8px 16px",
                    fontWeight: 500,
                    cursor: "pointer",
                    opacity: 0.5,
                  }}
                >
                  Enviar pedido de amizade
                </button>
              </div>
            </div>
          )}
        </div>

        <ActiveNowSidebar />
      </div>

      {activeAccountId && (
        <ArchivedDMsModal 
          isOpen={isArchiveModalOpen} 
          onClose={() => setIsArchiveModalOpen(false)} 
          accountId={activeAccountId} 
        />
      )}
    </div>
  );
}

function TabButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 8px",
        background: active ? "var(--bg-modifier-selected)" : "transparent",
        color: active ? "var(--text-normal)" : "var(--text-muted)",
        border: "none",
        borderRadius: "4px",
        fontSize: 15,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 150ms",
      }}
      className="hover-bg-modifier hover-color-normal"
    >
      {children}
    </button>
  );
}
