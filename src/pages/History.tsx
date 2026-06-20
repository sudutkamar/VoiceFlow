import React, { useState, useEffect } from 'react';

interface HistoryProps {
  onSuccess: (message: string) => void;
}

interface HistoryItem {
  id: string;
  raw_text: string;
  final_text: string;
  duration_ms: number;
  audio_duration_ms: number;
  word_count: number;
  char_count: number;
  created_at: string;
}

function History({ onSuccess }: HistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const items = await window.electronAPI.getHistory(200);
      setHistory(items);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      loadHistory();
      return;
    }
    try {
      const items = await window.electronAPI.searchHistory(query);
      setHistory(items);
    } catch (error) {
      console.error('Failed to search history:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.deleteHistoryItem(id);
      setHistory(history.filter(item => item.id !== id));
      onSuccess('Item deleted');
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Yakin ingin menghapus semua history?')) {
      try {
        await window.electronAPI.clearHistory();
        setHistory([]);
        onSuccess('History cleared');
      } catch (error) {
        console.error('Failed to clear history:', error);
      }
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    onSuccess('Copied to clipboard');
  };

  const handleExport = async () => {
    try {
      const result = await window.electronAPI.exportHistory();
      if (result.success) {
        onSuccess(`History exported to: ${result.path}`);
      } else if (result.error !== 'Export cancelled') {
        alert(result.error);
      }
    } catch (error) {
      console.error('Failed to export history:', error);
    }
  };

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      } else if (days === 1) {
        return 'Kemarin';
      } else if (days < 7) {
        return `${days} hari lalu`;
      } else {
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      }
    } catch {
      return dateStr;
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const getStats = () => {
    const totalWords = history.reduce((sum, item) => sum + (item.word_count || 0), 0);
    const totalDuration = history.reduce((sum, item) => sum + (item.audio_duration_ms || 0), 0);
    return {
      totalDictations: history.length,
      totalWords,
      totalDuration: formatDuration(totalDuration),
    };
  };

  const stats = getStats();

  if (loading) {
    return (
      <div className="history-page">
        <div className="empty-state">
          <p>Memuat history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="page-header">
        <h2>History</h2>
        <div className="page-actions">
          <button className="action-btn" onClick={handleExport} title="Export">
            📥 Export
          </button>
          {history.length > 0 && (
            <button className="action-btn danger" onClick={handleClearAll}>
              🗑️ Clear All
            </button>
          )}
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search history..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button 
            className="search-clear"
            onClick={() => {
              setSearchQuery('');
              loadHistory();
            }}
          >
            ✕
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="history-stats">
          <div className="stat">
            <span className="stat-value">{stats.totalDictations}</span>
            <span className="stat-label">Dictations</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.totalWords}</span>
            <span className="stat-label">Words</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.totalDuration}</span>
            <span className="stat-label">Audio</span>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>{searchQuery ? 'Tidak ada hasil' : 'Belum ada history'}</p>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>
            {searchQuery ? 'Coba kata kunci lain' : 'History akan muncul setelah Anda menggunakan VoiceFlow'}
          </p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((item) => (
            <div 
              key={item.id} 
              className={`history-item ${selectedItem === item.id ? 'expanded' : ''}`}
            >
              <div 
                className="history-item-header"
                onClick={() => setSelectedItem(selectedItem === item.id ? null : item.id)}
              >
                <div className="history-text">
                  {item.final_text.length > 80 
                    ? item.final_text.substring(0, 80) + '...' 
                    : item.final_text}
                </div>
                <div className="history-meta">
                  <span>{formatDate(item.created_at)}</span>
                  <span>•</span>
                  <span>{item.word_count || 0} kata</span>
                  <span>•</span>
                  <span>{formatDuration(item.audio_duration_ms || item.duration_ms)}</span>
                </div>
              </div>
              
              {selectedItem === item.id && (
                <div className="history-item-expanded">
                  <div className="history-full-text">{item.final_text}</div>
                  {item.raw_text !== item.final_text && (
                    <details className="history-raw">
                      <summary>Original</summary>
                      <div>{item.raw_text}</div>
                    </details>
                  )}
                  <div className="history-item-actions">
                    <button
                      className="action-btn small"
                      onClick={() => handleCopy(item.final_text)}
                    >
                      📋 Copy
                    </button>
                    <button
                      className="action-btn small danger"
                      onClick={() => handleDelete(item.id)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default History;
