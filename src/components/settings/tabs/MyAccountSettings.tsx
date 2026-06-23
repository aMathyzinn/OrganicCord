import React from "react";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { Avatar } from "@/components/ui/Avatar";

export function MyAccountSettings() {
  const { accounts } = useAccountStore();
  const { activeAccountId } = useNavigationStore();
  
  const currentAccount = accounts.find(a => a.id === activeAccountId);

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
      
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: 0 }}>Remoção de Conta</h3>
        <p style={{ fontSize: 14, color: "var(--text-normal)", margin: 0 }}>Desativar sua conta fará com que você precise fazer login novamente no OrganicCord.</p>
        <div>
          <button style={{
            background: "transparent",
            color: "var(--status-danger)",
            border: "1px solid var(--status-danger)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 16px",
            fontWeight: 500,
            cursor: "pointer",
          }}>
            Desconectar Conta
          </button>
        </div>
      </div>
    </div>
  );
}
