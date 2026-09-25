import { FormEvent, useEffect, useState } from "react";
import { Cable, CheckCircle2, Gamepad2, Loader2, Monitor, Plus, Save, Trash2 } from "lucide-react";
import { useGameActivityStore } from "@/stores/gameActivityStore";
import { useExternalLinkStore } from "@/stores/externalLinkStore";

export function RegisteredGamesSettings() {
  const {
    settings,
    detectedGame,
    loading,
    error,
    rpcSettings,
    rpcStatus,
    loadSettings,
    loadRpcSettings,
    saveRpcSettings,
    testDiscordRpc,
    setDetectionEnabled,
    saveGame,
    removeGame,
    refreshAndSync,
  } = useGameActivityStore();
  const [name, setName] = useState("");
  const [executable, setExecutable] = useState("");
  const [saving, setSaving] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [rpcEnabled, setRpcEnabled] = useState(true);

  useEffect(() => {
    if (!settings && !loading) void loadSettings();
  }, [settings, loading, loadSettings]);

  useEffect(() => {
    if (!rpcSettings) void loadRpcSettings();
  }, [rpcSettings, loadRpcSettings]);

  useEffect(() => {
    if (!rpcSettings) return;
    setApplicationId(rpcSettings.applicationId);
    setRpcEnabled(rpcSettings.enabled);
  }, [rpcSettings]);

  useEffect(() => {
    void refreshAndSync();
  }, [refreshAndSync]);

  const addGame = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !executable.trim()) return;
    setSaving(true);
    try {
      await saveGame({ id: "", name: name.trim(), executable: executable.trim(), enabled: true });
      setName("");
      setExecutable("");
      await refreshAndSync();
    } catch {
      // The store exposes the actionable error in this screen.
    } finally {
      setSaving(false);
    }
  };

  const saveAndTestRpc = async () => {
    setSaving(true);
    try {
      await saveRpcSettings({ enabled: rpcEnabled, applicationId });
      if (rpcEnabled && applicationId.trim()) await testDiscordRpc();
    } catch {
      // The store exposes the actionable error in this screen.
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return <div style={{ display: "grid", minHeight: 180, placeItems: "center", color: "var(--text-muted)" }}><Loader2 className="spin" size={24} /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 180ms ease-out" }}>
      <header>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)" }}>Jogos Registrados</h2>
        <p style={{ marginTop: 6, maxWidth: 640, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.45 }}>
          Detecte jogos em execução e compartilhe “Jogando” com a conta aberta no Discord Desktop. O tempo começa quando o processo é confirmado.
        </p>
      </header>

      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 16, background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: "var(--radius-md)", color: "var(--brand-500)", background: "rgba(88, 101, 242, 0.13)" }}><Monitor size={19} /></div>
          <div>
            <div style={{ color: "var(--text-normal)", fontWeight: 600 }}>Detectar jogos em execução</div>
            <div style={{ marginTop: 3, color: "var(--text-muted)", fontSize: 13 }}>Você pode desativar cada jogo individualmente abaixo.</div>
          </div>
        </div>
        <label aria-label="Ativar detecção de jogos" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={settings?.enabled ?? false} onChange={(event) => void setDetectionEnabled(event.target.checked).then(() => refreshAndSync()).catch(() => undefined)} style={{ width: 21, height: 21, accentColor: "var(--brand-500)" }} />
        </label>
      </section>

      <section aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 20, color: detectedGame ? "var(--status-online)" : "var(--text-muted)", fontSize: 13 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: detectedGame ? "var(--status-online)" : "var(--text-muted)" }} />
        {detectedGame ? <>Detectado agora: <strong style={{ color: "var(--text-normal)" }}>{detectedGame.name}</strong></> : "Nenhum jogo registrado em execução"}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: "var(--radius-md)", color: "var(--brand-500)", background: "rgba(88, 101, 242, 0.13)" }}><Cable size={18} /></div>
            <div>
              <h3 style={{ color: "var(--text-normal)", fontSize: 16, fontWeight: 650 }}>Publicar para amigos</h3>
              <p style={{ marginTop: 3, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.4 }}>Usa o RPC oficial do Discord Desktop. O Discord original precisa estar aberto.</p>
            </div>
          </div>
          <label aria-label="Ativar publicação pelo Discord Desktop" style={{ display: "inline-flex", cursor: "pointer", padding: 4 }}>
            <input type="checkbox" checked={rpcEnabled} onChange={(event) => setRpcEnabled(event.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--brand-500)" }} />
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>
          Application ID do OrganicCord no Discord Developer Portal
          <input value={applicationId} onChange={(event) => setApplicationId(event.target.value.replace(/\s/g, ""))} placeholder="Ex.: 123456789012345678" inputMode="numeric" aria-label="Application ID do Discord" maxLength={20} style={inputStyle} />
        </label>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
          Crie uma aplicação e copie o <strong style={{ color: "var(--text-normal)" }}>Application ID</strong> em General Information. Nunca use o Client Secret. <button type="button" onClick={() => useExternalLinkStore.getState().openExternalLink("https://discord.com/developers/applications")} className="link-button">Abrir Developer Portal</button>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={() => void saveAndTestRpc()} disabled={saving} className="brand-btn" style={{ display: "inline-flex", alignItems: "center", gap: 7, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Salvar e testar conexão
          </button>
          {rpcStatus?.connected && <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--status-online)", fontSize: 13 }}><CheckCircle2 size={15} /> {rpcStatus.message}</span>}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h3 style={{ color: "var(--text-normal)", fontSize: 16, fontWeight: 650 }}>Adicionar manualmente</h3>
          <p style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 13 }}>Use o nome do arquivo executável, por exemplo, <code>meu-jogo.exe</code>.</p>
        </div>
        <form onSubmit={addGame} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 8 }}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome exibido" aria-label="Nome exibido do jogo" maxLength={128} style={inputStyle} />
          <input value={executable} onChange={(event) => setExecutable(event.target.value)} placeholder="executavel.exe" aria-label="Executável do jogo" maxLength={260} style={inputStyle} />
          <button type="submit" disabled={saving || !name.trim() || !executable.trim()} className="brand-btn" style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 className="spin" size={15} /> : <Plus size={16} />} Adicionar
          </button>
        </form>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ color: "var(--text-normal)", fontSize: 16, fontWeight: 650 }}>Seus jogos</h3>
        {settings?.games.length ? settings.games.map((game) => (
          <div key={game.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: "var(--radius-sm)", color: game.enabled ? "var(--status-online)" : "var(--text-muted)", background: "var(--bg-tertiary)" }}><Gamepad2 size={18} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="truncate" style={{ color: "var(--text-normal)", fontWeight: 600 }}>{game.name}</div>
              <div className="truncate" style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 12 }}>{game.executable}</div>
            </div>
            <label aria-label={`Detectar ${game.name}`} style={{ display: "inline-flex", cursor: "pointer", padding: 6 }}>
              <input type="checkbox" checked={game.enabled} onChange={(event) => void saveGame({ ...game, enabled: event.target.checked }).then(() => refreshAndSync()).catch(() => undefined)} style={{ width: 18, height: 18, accentColor: "var(--brand-500)" }} />
            </label>
            <button type="button" onClick={() => void removeGame(game.id).then(() => refreshAndSync()).catch(() => undefined)} aria-label={`Remover ${game.name}`} className="icon-btn hover-danger-bg"><Trash2 size={17} /></button>
          </div>
        )) : <div style={{ padding: "24px 0", color: "var(--text-muted)", fontSize: 14 }}>Adicione um executável para começar.</div>}
      </section>

      {error && <p role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>{error}</p>}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  minWidth: 0,
  padding: "9px 10px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-tertiary)",
  color: "var(--text-normal)",
} as const;
