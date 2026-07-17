/**
 * ErrorBoundary — catches rendering errors and displays actionable fallback UI.
 */
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[VoiceFlow] ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.hash = '';
    window.location.reload();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const errorText = [
      'VoiceFlow Error Report',
      '========================',
      `Time: ${new Date().toISOString()}`,
      `Message: ${error?.message}`,
      `Stack: ${error?.stack}`,
      '',
      'Component Stack:',
      errorInfo?.componentStack || 'N/A',
    ].join('\n');
    navigator.clipboard.writeText(errorText).catch(() => {});
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40,
          background: 'linear-gradient(135deg, #0a0a12 0%, #1a1a2e 100%)',
          color: '#f1f5f9',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
          <h2 style={{
            color: '#ef4444',
            fontSize: 24,
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Something went wrong
          </h2>
          <p style={{
            color: '#94a3b8',
            fontSize: 14,
            marginBottom: 24,
            maxWidth: 400,
          }}>
            VoiceFlow encountered an unexpected error. You can try reloading or go back to the main window.
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '12px 24px',
                background: '#4a9eff',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#6bb3ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#4a9eff')}
            >
              🔄 Reload App
            </button>
            <button
              onClick={this.handleGoHome}
              style={{
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.1)',
                color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            >
              🏠 Go to Main Window
            </button>
          </div>

          <button
            onClick={this.handleCopyError}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: '#64748b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 24,
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            📋 Copy Error Report
          </button>

          <details style={{
            width: '100%',
            maxWidth: 600,
            textAlign: 'left',
          }}>
            <summary style={{
              color: '#64748b',
              fontSize: 12,
              cursor: 'pointer',
              padding: '8px 0',
            }}>
              Technical Details
            </summary>
            <pre style={{
              marginTop: 8,
              padding: 16,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#94a3b8',
              maxHeight: 200,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              {this.state.error.message}\n\n{this.state.error.stack}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
