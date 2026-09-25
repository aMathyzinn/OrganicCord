import { useEffect, useRef } from "react";
import { useVoiceStore } from "@/stores/voiceStore";
import { Pin, Lock, ShieldAlert } from "lucide-react";

interface Props {
  onClose: () => void;
}

export function VoiceConnectionPopover({ onClose }: Props) {
  const {
    endpoint,
    ping,
    pingHistory = [],
    packetLoss,
    isEncrypted,
    activeOutputDeviceName,
    outputStatus,
    outputFallback,
    outputError,
    audioReceiveStage,
  } = useVoiceStore();

  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Nome formatado do servidor de voz (ex: c-gru08-9f26d965)
  const serverEndpointName = endpoint
    ? endpoint.replace(/^wss?:\/\//, "").replace(/:.*$/, "").replace(/\.discord\.gg$/, "")
    : "Aguardando servidor...";

  // Cálculo do ping médio
  const avgPing = pingHistory.length > 0
    ? Math.round(pingHistory.reduce((acc, curr) => acc + curr.value, 0) / pingHistory.length)
    : ping;

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: 124,
        left: 8,
        width: 320,
        background: "#18191c",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        padding: 16,
        color: "#dcddde",
        fontSize: 13,
        zIndex: 9999,
        animation: "hubPopIn 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        userSelect: "none",
      }}
    >
      {/* Header com Tab underline e Pin */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          paddingBottom: 4,
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
            Conexão
          </span>
          {/* Active Tab Indicator Bar */}
          <div style={{ width: 44, height: 2, borderRadius: 2, background: "var(--brand-500)" }} />
        </div>

        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--interactive-normal)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          className="hover-color-normal"
          title="Fechar"
        >
          <Pin size={16} />
        </button>
      </div>

      {/* Gráfico de Ping (Canvas / SVG Line Chart) */}
      <div
        style={{
          background: "#111214",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.05)",
          padding: "10px 12px 6px",
          marginBottom: 14,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", height: 80, width: "100%", position: "relative" }}>
          {/* Y Axis Labels */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              fontSize: 10,
              color: "rgba(255, 255, 255, 0.4)",
              marginRight: 8,
              paddingBottom: 12,
              textAlign: "right",
              width: 16,
            }}
          >
            <span>20</span>
            <span>10</span>
            <span>0</span>
          </div>

          {/* Canvas SVG Line */}
          <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>
            <svg
              width="100%"
              height="60"
              viewBox="0 0 200 60"
              preserveAspectRatio="none"
              style={{ overflow: "visible" }}
            >
              {/* Horizontal Grid lines */}
              <line x1="0" y1="0" x2="200" y2="0" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="0" y1="30" x2="200" y2="30" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="200" y2="60" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

              {/* Ping line path */}
              {(() => {
                if (!pingHistory || pingHistory.length === 0) {
                  return <line x1="0" y1="30" x2="200" y2="30" stroke="#5865F2" strokeWidth="2" />;
                }
                const points = pingHistory.map((pt, i) => {
                  const x = (i / Math.max(1, pingHistory.length - 1)) * 200;
                  // Scale 0ms to 20ms onto 60px height (0ms -> y=60, 20ms -> y=0)
                  const clampedVal = Math.min(20, Math.max(0, pt.value));
                  const y = 60 - (clampedVal / 20) * 60;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ");

                return (
                  <>
                    <polyline
                      fill="none"
                      stroke="#5865F2"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />
                    {/* Subtle Gradient area below line */}
                    <polygon
                      fill="rgba(88, 101, 242, 0.15)"
                      points={`0,60 ${points} 200,60`}
                    />
                  </>
                );
              })()}
            </svg>

            {/* X Axis Timestamps */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "rgba(255, 255, 255, 0.4)",
                marginTop: 4,
              }}
            >
              {pingHistory.length >= 5 ? (
                <>
                  <span>{pingHistory[0]?.time}</span>
                  <span>{pingHistory[Math.floor(pingHistory.length / 2)]?.time}</span>
                  <span>{pingHistory[pingHistory.length - 1]?.time}</span>
                </>
              ) : (
                <>
                  <span>12:50</span>
                  <span>12:52</span>
                  <span>12:54</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Nome do Endpoint / Servidor */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#ffffff",
          marginBottom: 10,
          letterSpacing: "-0.01em",
          wordBreak: "break-all",
        }}
      >
        {serverEndpointName}
      </div>

      {/* Estatísticas de Ping e Pacotes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, fontSize: 13 }}>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Ping médio: </span>
          <strong style={{ color: "#ffffff", fontWeight: 700 }}>{avgPing == null ? "Indisponível" : `${avgPing} ms`}</strong>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Recepção: </span>
          <strong style={{ color: audioReceiveStage === "pcm_consumed" ? "var(--status-online)" : "#ffffff", fontWeight: 700 }}>
            {audioReceiveStage === "pcm_consumed"
              ? "Áudio reproduzido"
              : audioReceiveStage === "opus_decoded"
                ? "Opus decodificado"
                : audioReceiveStage === "dave_decrypted"
                  ? "DAVE descriptografado"
                  : audioReceiveStage === "transport_decrypted"
                    ? "Transporte descriptografado"
                    : audioReceiveStage === "udp_packet_received"
                      ? "Pacote UDP recebido"
                      : "Aguardando fala"}
          </strong>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Último ping: </span>
          <strong style={{ color: "#ffffff", fontWeight: 700 }}>{ping == null ? "Indisponível" : `${ping} ms`}</strong>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Taxa de perda de pacotes enviados: </span>
          <strong style={{ color: "#ffffff", fontWeight: 700 }}>{packetLoss == null ? "Não medida" : `${packetLoss.toFixed(1)}%`}</strong>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Saída de áudio: </span>
          <strong
            title={outputError ?? undefined}
            style={{
              color: outputStatus === "error" ? "var(--status-danger)" : outputFallback ? "var(--status-idle)" : "#ffffff",
              fontWeight: 700,
            }}
          >
            {outputStatus === "switching"
              ? "Trocando..."
              : outputStatus === "error"
                ? "Falhou"
                : activeOutputDeviceName ?? "Preparando..."}
            {outputFallback ? " (alternativa)" : ""}
          </strong>
        </div>
      </div>

      {/* Texto explicativo */}
      <p
        style={{
          fontSize: 12,
          color: "rgba(255, 255, 255, 0.6)",
          lineHeight: 1.45,
          marginBottom: 14,
          marginTop: 0,
        }}
      >
        O ping exibido vem do heartbeat real do servidor de voz. A perda de pacotes permanece
        indisponível até existir medição RTP confiável.
      </p>

      {/* Badge de Segurança (Criptografado de ponta a ponta) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: isEncrypted ? "#23a55a" : "#f0b232",
          paddingTop: 4,
        }}
      >
        {isEncrypted ? <Lock size={15} /> : <ShieldAlert size={15} />}
        <span>{isEncrypted ? "Criptografado de ponta a ponta com DAVE" : "Criptografia em negociação"}</span>
      </div>
    </div>
  );
}
