import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  handleRestart = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-tertiary)",
            color: "var(--text-normal)",
            gap: 16,
            padding: 32,
          }}
        >
          <AlertTriangle size={48} style={{ color: "var(--text-warning)" }} />
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>
            Algo deu errado
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              maxWidth: 480,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            O OrganicCord encontrou um erro inesperado. Tente recarregar o app.
          </p>
          {this.state.error && (
            <details
              style={{
                maxWidth: 600,
                width: "100%",
                background: "var(--bg-primary)",
                borderRadius: "var(--radius-sm)",
                padding: 12,
                fontSize: 12,
                color: "var(--text-danger)",
                fontFamily: "monospace",
                wordBreak: "break-word",
                cursor: "pointer",
              }}
            >
              <summary style={{ marginBottom: 8, color: "var(--text-muted)" }}>
                Detalhes do erro
              </summary>
              {this.state.error.message}
              {this.state.error.stack && (
                <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 11 }}>
                  {this.state.error.stack}
                </pre>
              )}
            </details>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={this.handleReload}
              style={{
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 20px",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Tentar novamente
            </button>
            <button
              onClick={this.handleRestart}
              style={{
                background: "var(--brand-500)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "10px 20px",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Recarregar app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
