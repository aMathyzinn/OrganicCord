import React, { useState, useEffect } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { getAuthSessions, revokeAuthSession } from "@/lib/tauri";
import { Avatar } from "@/components/ui/Avatar";
import { Monitor, Smartphone, Globe, Loader2, X } from "lucide-react";

export function MyAccountSettings() {
  const { accounts, logoutAccount } = useAccountStore();
  const { activeAccountId } = useNavigationStore();
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  const currentAccount = accounts.find(a => a.id === activeAccountId);

  useEffect(() => {
    if (activeAccountId && currentAccount) {
      setLoadingSessions(true);
      getAuthSessions(activeAccountId)
        .then((data: any) => {
           if (data && Array.isArray(data.user_sessions)) {
             setSessions(data.user_sessions);
           } else if (Array.isArray(data)) {
             setSessions(data);
           }
        })
        .catch(console.error)
        .finally(() => setLoadingSessions(false));
    }
  }, [activeAccountId, currentAccount]);

  const handleRevokeSession = async (sessionIdHash: string) => {
    if (!activeAccountId) return;
    try {
      await revokeAuthSession(activeAccountId, sessionIdHash);
      setSessions(prev => prev.filter(s => s.id_hash !== sessionIdHash));
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentAccount) {
    return <div style={{ color: "var(--text-muted)" }}>Nenhuma conta ativa selecionada.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 200ms ease" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Minha Conta</h2>
      
      <div style={{ 
        background: "var(--bg-secondary)", 
        borderRadius: "var(--radius-md)", 
        overflow: "hidden",
        position: "relative"
      }}>
        <div style={{ height: 100, background: currentAccount.color || "var(--brand-500)" }} />
        
        <div style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          <div style={{ 
            position: "absolute", 
            top: -40, 
            left: 16, 
            borderRadius: "50%", 
            border: "6px solid var(--bg-secondary)",
            background: "var(--bg-secondary)"
          }}>
            <Avatar
              userId={currentAccount.user_id}
              avatarHash={currentAccount.avatar}
              username={currentAccount.username}
              size={80}
            />
          </div>
          
          <div style={{ marginTop: 40 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)" }}>
              {currentAccount.global_name ?? currentAccount.username}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-normal)" }}>
              {currentAccount.username}
            </div>
          </div>
          
          <button style={{
            background: "var(--brand-500)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "8px 16px",
            fontWeight: 500,
            cursor: "pointer",
            marginTop: 8
          }}>
            Editar Perfil de Usuário
          </button>
        </div>
        
        <div style={{ padding: "16px", background: "var(--bg-tertiary)", margin: 16, borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Nome de Exibição</div>
              <div style={{ fontSize: 16, color: "var(--text-normal)" }}>{currentAccount.global_name ?? currentAccount.username}</div>
            </div>
            <button className="hover-bg-modifier" style={{ background: "var(--bg-secondary)", color: "var(--text-normal)", border: "none", padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>Editar</button>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Nome de Usuário</div>
              <div style={{ fontSize: 16, color: "var(--text-normal)" }}>{currentAccount.username}</div>
            </div>
            <button className="hover-bg-modifier" style={{ background: "var(--bg-secondary)", color: "var(--text-normal)", border: "none", padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>Editar</button>
          </div>
        </div>
      </div>
      
      <div style={{ height: 1, background: "var(--border-subtle)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Sessões Ativas (Dispositivos)</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
          Aqui estão todos os dispositivos atualmente conectados na sua conta. Você pode deslogar de qualquer um deles remotamente.
        </p>

        {loadingSessions ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
            <Loader2 className="spin" size={24} color="var(--brand-500)" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.map((s, idx) => {
              const Icon = s.client_info?.os === "iOS" || s.client_info?.os === "Android" ? Smartphone : Monitor;
              const os = s.client_info?.os || "Desconhecido";
              const loc = s.client_info?.location || "Localização desconhecida";
              const browser = s.client_info?.client || "Client App";
              const isCurrent = idx === 0; // The first session is usually current, or we'd check session_id but we don't have our own session_id from auth/sessions easily mapped. Discord usually returns the active one as current: true if they use it, let's assume if it has `current_session: true`
              
              return (
                <div key={s.id_hash || idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-secondary)", padding: "16px", borderRadius: "var(--radius-md)" }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <div style={{ background: "var(--bg-tertiary)", padding: 12, borderRadius: "50%", color: s.current_session ? "var(--brand-500)" : "var(--text-normal)" }}>
                      <Icon size={24} />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 8 }}>
                        {os} · {browser}
                        {s.current_session && (
                          <span style={{ fontSize: 10, background: "var(--brand-500)", color: "white", padding: "2px 6px", borderRadius: 12, textTransform: "uppercase", fontWeight: 700 }}>Atual</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                        {loc} · {new Date(s.approx_last_used_time).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  {!s.current_session && (
                    <button 
                      className="hover-bg-modifier"
                      onClick={() => handleRevokeSession(s.id_hash)}
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 8, borderRadius: "50%", display: "flex" }}
                      title="Sair (Remover dispositivo)"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              );
            })}
            {sessions.length === 0 && !loadingSessions && (
              <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Nenhuma sessão adicional encontrada.</div>
            )}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)" }} />
      
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: 0 }}>Remoção de Conta</h3>
        <p style={{ fontSize: 14, color: "var(--text-normal)", margin: 0 }}>Desativar sua conta fará com que você precise fazer login novamente no OrganicCord.</p>
        <div>
          <button 
            onClick={() => {
              if (activeAccountId) logoutAccount(activeAccountId);
            }}
            style={{
              background: "transparent",
              color: "var(--status-danger)",
              border: "1px solid var(--status-danger)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Sair (Logout)
          </button>
        </div>
      </div>
    </div>
  );
}
