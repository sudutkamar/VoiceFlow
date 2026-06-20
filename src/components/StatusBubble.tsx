import React from 'react';

interface StatusBubbleProps {
  state: string;
  message?: string;
}

function StatusBubble({ state, message }: StatusBubbleProps) {
  const getStatusColor = (): string => {
    switch (state) {
      case 'recording': return 'var(--error)';
      case 'converting':
      case 'transcribing':
      case 'cleaning':
      case 'pasting': return 'var(--accent)';
      case 'done': return 'var(--success)';
      case 'error': return 'var(--error)';
      default: return 'var(--text-muted)';
    }
  };

  const getStatusText = (): string => {
    if (message) return message;
    switch (state) {
      case 'idle': return 'Siap';
      case 'recording': return 'Merekam';
      case 'converting': return 'Mengkonversi';
      case 'transcribing': return 'Transcribing';
      case 'cleaning': return 'Cleaning';
      case 'pasting': return 'Pasting';
      case 'done': return 'Selesai';
      case 'error': return 'Error';
      default: return state;
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${getStatusColor()}`,
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: getStatusColor(),
        animation: state === 'recording' ? 'pulse 1s infinite' : 'none',
      }} />
      <span style={{ fontSize: '13px', color: getStatusColor() }}>
        {getStatusText()}
      </span>
    </div>
  );
}

export default StatusBubble;
