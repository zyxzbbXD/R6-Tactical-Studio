import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("❌ [ErrorBoundary] Render crash caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "#0e0e10",
            color: "#f4f4f5",
            fontFamily: "sans-serif",
            padding: 32,
            zIndex: 99999,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: "#e85d2a" }}>
            Something went wrong
          </div>
          <pre
            style={{
              fontSize: 12,
              color: "#71717a",
              maxWidth: 700,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#131316",
              border: "1px solid #27272a",
              borderRadius: 8,
              padding: 16,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "8px 20px",
              background: "#e85d2a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Try to recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
