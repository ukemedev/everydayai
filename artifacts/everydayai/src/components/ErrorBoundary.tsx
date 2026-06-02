import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "", errorStack: "" };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true, errorMessage: "", errorStack: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ errorMessage: error.message, errorStack: error.stack ?? "" });
    fetch("/api/devbot/capture-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageUrl: window.location.href,
        errorMessage: error.message,
        errorStack: error.stack,
        component: info.componentStack?.trim().split("\n")[0]?.trim() ?? "ErrorBoundary",
        severity: "critical",
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      const { errorMessage, errorStack } = this.state;
      return (
        <div
          style={{
            minHeight: "100vh",
            backgroundColor: "#0a0f1e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Inter, sans-serif",
            padding: "24px",
          }}
        >
          <div
            style={{
              textAlign: "center",
              padding: "40px 32px",
              maxWidth: "520px",
              width: "100%",
              borderRadius: "16px",
              backgroundColor: "#0d1117",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
              Something went wrong
            </h2>
            {errorMessage && (
              <p style={{
                color: "#f87171",
                fontSize: "13px",
                fontFamily: "monospace",
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: "8px",
                padding: "10px 14px",
                marginBottom: "12px",
                textAlign: "left",
                wordBreak: "break-word",
              }}>
                {errorMessage}
              </p>
            )}
            {errorStack && (
              <pre style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: "11px",
                fontFamily: "monospace",
                backgroundColor: "rgba(255,255,255,0.03)",
                borderRadius: "8px",
                padding: "10px 14px",
                marginBottom: "24px",
                textAlign: "left",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "160px",
                overflowY: "auto",
              }}>
                {errorStack}
              </pre>
            )}
            {!errorMessage && (
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "14px", lineHeight: "1.6", marginBottom: "24px" }}>
                An unexpected error occurred. Our team has been notified.
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "#3b5bfc",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
