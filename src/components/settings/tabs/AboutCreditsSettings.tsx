import { Code2, ExternalLink, Github, HeartHandshake, MonitorSmartphone, Sparkles } from "lucide-react";
import { useExternalLinkStore } from "@/stores/externalLinkStore";

const links = {
  portfolio: "https://damodara.xyz",
  repository: "https://github.com/aMathyzinn/OrganicCord",
  github: "https://github.com/aMathyzinn",
} as const;

const primaryButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 38,
  border: 0,
  borderRadius: "var(--radius-sm)",
  background: "var(--brand-500)",
  color: "#fff",
  padding: "9px 13px",
  fontSize: 14,
  fontWeight: 650,
  cursor: "pointer",
  transition: "background 150ms ease, transform 150ms ease",
} as const;

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "var(--bg-accent)",
  color: "var(--text-normal)",
  border: "1px solid var(--border-subtle)",
} as const;

export function AboutCreditsSettings() {
  const openExternalLink = useExternalLinkStore((state) => state.openExternalLink);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 26, animation: "fadeIn 200ms ease" }} aria-labelledby="about-credits-title">
      <header style={{ maxWidth: 650 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand-500)", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          <Sparkles size={17} aria-hidden />
          OrganicCord
        </div>
        <h2 id="about-credits-title" style={{ margin: 0, color: "var(--text-normal)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Sobre e créditos
        </h2>
        <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 14, lineHeight: 1.55 }}>
          Um cliente desktop de Discord mais leve, direto e pensado para respeitar o seu espaço no PC.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, maxWidth: 680 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 18, background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
          <div style={{ width: 38, height: 38, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: "var(--radius-md)", color: "var(--brand-500)", background: "color-mix(in srgb, var(--brand-500) 14%, transparent)" }}>
            <HeartHandshake size={20} aria-hidden />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, color: "var(--text-normal)", fontSize: 16, fontWeight: 700 }}>Feito por aMathyzinn</h3>
            <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
              Projeto criado e mantido por aMathyzinn. Conheça outros trabalhos no portfólio.
            </p>
            <button type="button" onClick={() => openExternalLink(links.portfolio)} style={{ ...primaryButtonStyle, marginTop: 14 }}>
              Visitar damodara.xyz <ExternalLink size={15} aria-hidden />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 18, background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
          <div style={{ width: 38, height: 38, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: "var(--radius-md)", color: "var(--text-link)", background: "color-mix(in srgb, var(--text-link) 12%, transparent)" }}>
            <Code2 size={20} aria-hidden />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, color: "var(--text-normal)", fontSize: 16, fontWeight: 700 }}>Código aberto, evolução aberta</h3>
            <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
              Consulte o código-fonte, acompanhe o desenvolvimento e contribua com o OrganicCord no GitHub.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => openExternalLink(links.repository)} style={primaryButtonStyle}>
                <Github size={16} aria-hidden /> Abrir repositório
              </button>
              <button type="button" onClick={() => openExternalLink(links.github)} style={secondaryButtonStyle}>
                Perfil no GitHub <ExternalLink size={15} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 680, display: "flex", gap: 10, alignItems: "flex-start", paddingTop: 2, color: "var(--text-muted)" }}>
        <MonitorSmartphone size={18} style={{ marginTop: 1, flexShrink: 0 }} aria-hidden />
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          OrganicCord 0.2.0-beta.1 é um cliente não oficial para Discord. A compatibilidade pode variar conforme mudanças no serviço.
        </p>
      </div>
    </section>
  );
}
