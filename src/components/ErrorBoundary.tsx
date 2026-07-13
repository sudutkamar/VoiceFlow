/**
 * ErrorBoundary — catches rendering errors and displays fallback UI.
 */
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[VoiceFlow] ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40,
          background: '#0a0a12',
          color: '#f1f5f9',
          fontFamily: 'monospace',
          height: '100vh',
        }}>
          <h2 style={{ color: '#ef4444' }}>❌ Error</h2>
          <pre style={{
            marginTop: 16,
            padding: 16,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 8,
            overflow: 'auto',
          }}>
            {this.state.error.message}\n{this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
