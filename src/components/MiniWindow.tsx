import React, { useState, useEffect } from 'react';

interface MiniWindowProps {
  data: any;
  state: string;
}

function MiniWindow({ data, state }: MiniWindowProps) {
  const [text, setText] = useState('');
  const [wpm, setWpm] = useState(0);

  useEffect(() => {
    if (data?.text) {
      setText(data.text);
    }
  }, [data]);

  useEffect(() => {
    const unsubWpm = window.electronAPI.onWpmUpdate((newWpm) => {
      setWpm(newWpm);
    });

    return () => {
      unsubWpm();
    };
  }, []);

  const getStatusIcon = (): string => {
    switch (state) {
      case 'recording': return '🔴';
      case 'converting': return '🔄';
      case 'transcribing': return '✍️';
      case 'cleaning': return '🧹';
      case 'pasting': return '📋';
      case 'done': return '✅';
      case 'error': return '❌';
      default: return '🎤';
    }
  };

  const getStatusText = (): string => {
    switch (state) {
      case 'recording': return 'Recording...';
      case 'converting': return 'Converting...';
      case 'transcribing': return 'Transcribing...';
      case 'cleaning': return 'Cleaning...';
      case 'pasting': return 'Pasting...';
      case 'done': return 'Done!';
      case 'error': return 'Error';
      default: return 'Ready';
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mini-window">
      <div className="mini-header">
        <span className="mini-status-icon">{getStatusIcon()}</span>
        <span className="mini-status-text">{getStatusText()}</span>
        {state === 'recording' && wpm > 0 && (
          <span className="mini-wpm">{wpm} WPM</span>
        )}
      </div>
      
      <div className="mini-content">
        {text ? (
          <div className="mini-text">
            {text.length > 100 ? text.substring(0, 100) + '...' : text}
          </div>
        ) : (
          <div className="mini-placeholder">
            {state === 'recording' ? 'Listening...' : 'Press hotkey to start'}
          </div>
        )}
      </div>

      {state === 'done' && text && (
        <div className="mini-actions">
          <button 
            className="mini-btn"
            onClick={() => {
              navigator.clipboard.writeText(text);
            }}
          >
            Copy
          </button>
          <button 
            className="mini-btn"
            onClick={() => {
              window.electronAPI.hideMiniWindow();
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export default MiniWindow;
