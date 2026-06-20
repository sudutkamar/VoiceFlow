import React from 'react';

interface HistoryItem {
  id: string;
  raw_text: string;
  final_text: string;
  duration_ms: number;
  created_at: string;
}

interface HistoryListProps {
  items: HistoryItem[];
  onDelete: (id: string) => void;
  onCopy: (text: string) => void;
}

function HistoryList({ items, onDelete, onCopy }: HistoryListProps) {
  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="history-list">
      {items.map((item) => (
        <div key={item.id} className="history-item">
          <div className="history-text">{item.final_text}</div>
          <div className="history-meta">
            <span>{formatDate(item.created_at)} • {formatDuration(item.duration_ms)}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="history-delete"
                onClick={() => onCopy(item.final_text)}
                title="Copy"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </button>
              <button
                className="history-delete"
                onClick={() => onDelete(item.id)}
                title="Hapus"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default HistoryList;
