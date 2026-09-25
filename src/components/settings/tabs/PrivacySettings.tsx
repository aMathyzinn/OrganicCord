import { ExternalLink, ShieldCheck } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { toast } from "@/components/ui/Toast";

export function PrivacySettings() {
  const openDiscord = async () => {
    try {
      await open("https://discord.com/channels/@me");
    } catch (error) {
      toast.error(`Não foi possível abrir o Discord: ${String(error)}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 200ms ease" }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", marginBottom: 6 }}>
          Privacidade e Segurança
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          O OrganicCord não simula configurações de conta que não consegue confirmar no Discord.
        </p>
      </div>

      <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 20, display: "flex", gap: 14 }}>
        <ShieldCheck size={24} color="var(--status-online)" style={{ flexShrink: 0 }} />
        <div>
          <div style={{ color: "var(--text-normal)", fontWeight: 700, marginBottom: 6 }}>
            Preferências controladas pela sua conta Discord
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
            Filtro de mídia explícita, mensagens diretas de servidores e quem pode enviar solicitações de amizade
            devem ser alterados no cliente oficial. Assim, a interface não mostra uma opção salva apenas localmente como
            se ela tivesse sido aplicada à sua conta.
          </div>
          <button
            onClick={openDiscord}
            style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: "var(--radius-sm)", background: "var(--brand-500)", color: "white", padding: "9px 14px", fontWeight: 650, cursor: "pointer" }}
          >
            Abrir Discord oficial <ExternalLink size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
