import React, { useState, useEffect, useMemo } from 'react';
import { Iconify } from '../utils/icons';
import { logError } from '../utils/errorHandler';

interface HistoryProps {
  onSuccess: (message: string) => void;
}

interface HistoryItem {
  id: string;
  raw_text: string;
  final_text: string;
  duration_ms: number;
  word_count: number;
  created_at: string;
}

interface DateGroup {
  label: string;
  items: HistoryItem[];
}

function getDateGroups(items: HistoryItem[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, HistoryItem[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Earlier': [],
  };

  for (const item of items) {
    const d = new Date(item.created_at);
    const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (itemDate.getTime() >= today.getTime()) {
      groups['Today'].push(item);
    } else if (itemDate.getTime() >= yesterday.getTime()) {
      groups['Yesterday'].push(item);
    } else if (itemDate.getTime() >= weekAgo.getTime()) {
      groups['This Week'].push(item);
    } else {
      groups['Earlier'].push(item);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function History({ onSuccess }: HistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const items = await window.electronAPI.getHistory(200);
      setHistory(items);
    } catch (error) {
      logError('History', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.deleteHistoryItem(id);
      setHistory(history.filter(item => item.id !== id));
      onSuccess('Deleted');
    } catch (error) {
      logError('History', error);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear all history? This cannot be undone.')) return;
    try {
      await window.electronAPI.clearHistory();
      setHistory([]);
      onSuccess('History cleared');
    } catch (error) {
      logError('History', error);
    }
  };

  const [playingId, setPlayingId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    try {
      await window.electronAPI.copyText(text);
      setCopiedId(id);
      onSuccess('Copied!');
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      logError('History', error);
    }
  };

  const handlePlayAudio = async (id: string) => {
    if (playingId === id) { setPlayingId(null); return; }
    try {
      const result = await window.electronAPI.playAudio(id);
      if (result.success && result.data) {
        setPlayingId(id);
        const binaryStr = window.atob(result.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: result.mimeType || 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
        audio.onerror = () => { setPlayingId(null); URL.revokeObjectURL(url); onSuccess('Audio unavailable'); };
        audio.play().catch(() => { setPlayingId(null); URL.revokeObjectURL(url); onSuccess('Playback failed'); });
      }
    } catch (error) {
      logError('History', error);
    }
  };

  const handleExport = async () => {
    try {
      const result = await window.electronAPI.exportHistory();
      if (result.success) {
        onSuccess('History exported!');
      } else if (result.error !== 'Export cancelled') {
        alert(result.error);
      }
    } catch (error) {
      logError('History', error);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return history;
    const q = search.toLowerCase();
    return history.filter(item =>
      item.final_text.toLowerCase().includes(q) ||
      item.raw_text.toLowerCase().includes(q)
    );
  }, [history, search]);

  const dateGroups = useMemo(() => getDateGroups(filtered), [filtered]);

  const timeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);

      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-loading">
          <div className="spinner-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>History</h1>
        <p className="page-subtitle">Your recent transcriptions</p>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <Iconify icon="search" size={18} className="search-icon" />
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {history.length > 0 && (
          <>
            <button className="btn btn-sm" onClick={handleExport}>
              <Iconify icon="export" size={14} /> Export CSV
            </button>
            <button className="btn btn-sm btn-danger" onClick={handleClear}>
              <Iconify icon="clear" size={14} /> Clear All
            </button>
          </>
        )}
      </div>

      {/* History List */}
      {dateGroups.length > 0 ? (
        <div className="history-groups">
          {dateGroups.map((group) => (
            <div key={group.label} className="history-group">
              <div className="history-group-label">{group.label}</div>
              <div className="card-list">
                {group.items.map((item) => (
                  <div key={item.id} className="card card-hover">
                    <div className="card-body-full">
                      <div
                        className="card-text history-clickable"
                        onClick={() => handleCopy(item.final_text || item.raw_text, item.id)}
                        title="Click to copy"
                      >
                        {item.final_text || item.raw_text}
                        {copiedId === item.id && <span className="history-copied-badge">Copied!</span>}
                      </div>
                      <div className="card-footer">
                        <div className="card-meta">
                          <span>{timeAgo(item.created_at)}</span>
                          {item.duration_ms > 0 && <span>{formatDuration(item.duration_ms)}</span>}
                          {item.word_count > 0 && <span>{item.word_count} words</span>}
                        </div>
                        <div className="card-actions">
                          <button className="btn btn-sm" onClick={() => handleCopy(item.final_text || item.raw_text, item.id)}>
                            <Iconify icon="copy" size={14} /> {copiedId === item.id ? 'Copied!' : 'Copy'}
                          </button>
                          <button className={`btn btn-sm ${playingId === item.id ? 'btn-active' : ''}`} onClick={() => handlePlayAudio(item.id)} title="Play recording">
                            <Iconify icon={playingId === item.id ? 'cancel' : 'speaker'} size={14} />
                          </button>
                          <button className="btn btn-sm btn-icon" onClick={() => handleDelete(item.id)} title="Delete">
                            <Iconify icon="delete" size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon"><Iconify icon="history" size={48} /></div>
          <h3>{search ? 'No Results' : 'No History'}</h3>
          <p>{search ? 'Try a different search' : 'Your transcriptions will appear here'}</p>
        </div>
      )}
    </div>
  );
}

export default History;
