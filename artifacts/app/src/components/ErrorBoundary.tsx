import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 16 }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ color: "#fff", margin: 0 }}>An unexpected error occurred</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", margin: 0 }}>
            {this.state.error?.message || "Please refresh the page and try again."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#fbbf24", color: "#000", border: "none", padding: "12px 24px", borderRadius: 12, fontWeight: 700, marginTop: 8 }}
          >
            Refresh
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
