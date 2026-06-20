import React, { useState, useEffect } from 'react';

interface SettingsProps {
  onSuccess: (message: string) => void;
}

interface DictionaryEntry {
  id: string;
  phrase: string;
  replacement: string;
  created_at: string;
}

interface SnippetEntry {
  id: string;
  trigger_phrase: string;
  output_text: string;
  created_at: string;
}

function Settings({ onSuccess }: SettingsProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
  const [snippets, setSnippets] = useState<SnippetEntry[]>([]);
  const [newPhrase, setNewPhrase] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [newSnippetTrigger, setNewSnippetTrigger] = useState('');
  const [newSnippetOutput, setNewSnippetOutput] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'dictionary' | 'snippets' | 'hotkey'>('general');
  const [editingDict, setEditingDict] = useState<string | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');

  useEffect(() => {
    loadData();
    loadAudioDevices();
  }, []);

  const loadAudioDevices = async () => {
    try {
      // Request permission first to get full device labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(mics);
      
      // Load saved mic preference
      const savedMic = settings.selected_mic || '';
      setSelectedMic(savedMic);
    } catch (error) {
      console.error('Failed to load audio devices:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsData, dictData, snippetData] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getDictionary(),
        window.electronAPI.getSnippets(),
      ]);
      setSettings(settingsData);
      setDictionary(dictData);
      setSnippets(snippetData);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    try {
      await window.electronAPI.updateSetting(key, value);
      setSettings({ ...settings, [key]: value });
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  const handleToggle = async (key: string) => {
    const currentValue = settings[key] !== 'false';
    await updateSetting(key, (!currentValue).toString());
  };

  const handleAddDictionary = async () => {
    if (!newPhrase.trim() || !newReplacement.trim()) return;

    try {
      const result = await window.electronAPI.addDictionaryEntry(newPhrase.trim(), newReplacement.trim());
      if (result.success) {
        setNewPhrase('');
        setNewReplacement('');
        const dictData = await window.electronAPI.getDictionary();
        setDictionary(dictData);
        onSuccess('Dictionary entry added');
      }
    } catch (error) {
      console.error('Failed to add dictionary entry:', error);
    }
  };

  const handleDeleteDictionary = async (id: string) => {
    try {
      await window.electronAPI.deleteDictionaryEntry(id);
      setDictionary(dictionary.filter(entry => entry.id !== id));
      onSuccess('Dictionary entry deleted');
    } catch (error) {
      console.error('Failed to delete dictionary entry:', error);
    }
  };

  const handleAddSnippet = async () => {
    if (!newSnippetTrigger.trim() || !newSnippetOutput.trim()) return;

    try {
      const result = await window.electronAPI.addSnippet(newSnippetTrigger.trim(), newSnippetOutput.trim());
      if (result.success) {
        setNewSnippetTrigger('');
        setNewSnippetOutput('');
        const snippetData = await window.electronAPI.getSnippets();
        setSnippets(snippetData);
        onSuccess('Snippet added');
      }
    } catch (error) {
      console.error('Failed to add snippet:', error);
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    try {
      await window.electronAPI.deleteSnippet(id);
      setSnippets(snippets.filter(s => s.id !== id));
      onSuccess('Snippet deleted');
    } catch (error) {
      console.error('Failed to delete snippet:', error);
    }
  };

  const handleAutoStart = async () => {
    const newValue = settings.auto_start !== 'true';
    await updateSetting('auto_start', newValue.toString());
    await window.electronAPI.setAutoStart(newValue);
    onSuccess(newValue ? 'Auto-start enabled' : 'Auto-start disabled');
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="empty-state">
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-tabs">
        <button 
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          ⚙️ General
        </button>
        <button 
          className={`tab ${activeTab === 'dictionary' ? 'active' : ''}`}
          onClick={() => setActiveTab('dictionary')}
        >
          📖 Dictionary
        </button>
        <button 
          className={`tab ${activeTab === 'snippets' ? 'active' : ''}`}
          onClick={() => setActiveTab('snippets')}
        >
          ✨ Snippets
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="settings-content">
          <div className="settings-section">
            <h3>🎤 Recording</h3>
            
            <div className="setting-item">
              <div className="setting-label">
                <span>Microphone</span>
                <span>Pilih microphone yang akan digunakan</span>
              </div>
              <div className="setting-control">
                <select
                  value={selectedMic}
                  onChange={(e) => {
                    setSelectedMic(e.target.value);
                    updateSetting('selected_mic', e.target.value);
                    onSuccess('Microphone changed');
                  }}
                >
                  <option value="">Default Microphone</option>
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <button 
                  className="btn-refresh"
                  onClick={loadAudioDevices}
                  title="Refresh microphone list"
                >
                  🔄
                </button>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Whisper Model</span>
                <span>Model yang digunakan untuk transkripsi</span>
              </div>
              <div className="setting-control">
                <select
                  value={settings.model || 'ggml-base.bin'}
                  onChange={(e) => {
                    updateSetting('model', e.target.value);
                    onSuccess(`Model changed to ${e.target.value}`);
                  }}
                >
                  <option value="ggml-tiny.bin">⚡ Tiny (Tercepat ~1 detik)</option>
                  <option value="ggml-base.bin">⚖️ Base (Seimbang ~2-3 detik)</option>
                  <option value="ggml-small.bin">🎯 Small (Akurat ~5-7 detik)</option>
                  <option value="ggml-medium.bin">💎 Medium (Sangat akurat ~10-15 detik)</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Language</span>
                <span>Bahasa untuk transkripsi</span>
              </div>
              <div className="setting-control">
                <select
                  value={settings.language || 'auto'}
                  onChange={(e) => updateSetting('language', e.target.value)}
                >
                  <option value="auto">Auto Detect</option>
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                  <option value="ko">한국어</option>
                  <option value="zh">中文</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Auto Paste</span>
                <span>Otomatis tempel teks ke aplikasi aktif</span>
              </div>
              <div
                className={`toggle ${settings.auto_paste !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('auto_paste')}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>✨ Text Processing</h3>

            <div className="setting-item">
              <div className="setting-label">
                <span>Text Cleanup</span>
                <span>Bersihkan filler words dan punctuation</span>
              </div>
              <div
                className={`toggle ${settings.cleanup_enabled !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('cleanup_enabled')}
              />
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Remove Fillers</span>
                <span>Hapus kata-kata filler (eh, anu, hmm)</span>
              </div>
              <div
                className={`toggle ${settings.remove_fillers !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('remove_fillers')}
              />
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Capitalize First</span>
                <span>Kapitalisasi huruf pertama</span>
              </div>
              <div
                className={`toggle ${settings.capitalize_first !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('capitalize_first')}
              />
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Capitalize Sentences</span>
                <span>Kapitalisasi setelah titik</span>
              </div>
              <div
                className={`toggle ${settings.capitalize_sentences !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('capitalize_sentences')}
              />
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Voice Commands</span>
                <span>Gunakan voice commands (new paragraph, bold, dll)</span>
              </div>
              <div
                className={`toggle ${settings.voice_commands !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('voice_commands')}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>🔒 Privacy</h3>

            <div className="setting-item">
              <div className="setting-label">
                <span>Save History</span>
                <span>Simpan history transkripsi lokal</span>
              </div>
              <div
                className={`toggle ${settings.save_history !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('save_history')}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>🖥️ System</h3>

            <div className="setting-item">
              <div className="setting-label">
                <span>Start on Boot</span>
                <span>Otomatis jalankan saat Windows startup</span>
              </div>
              <div
                className={`toggle ${settings.auto_start === 'true' ? 'active' : ''}`}
                onClick={handleAutoStart}
              />
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <span>Minimize to Tray</span>
                <span>Sembunyikan ke system tray saat close</span>
              </div>
              <div
                className={`toggle ${settings.minimize_to_tray !== 'false' ? 'active' : ''}`}
                onClick={() => handleToggle('minimize_to_tray')}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dictionary' && (
        <div className="settings-content">
          <div className="dictionary-section">
            <p className="section-description">
              Kata-kata yang akan diganti otomatis saat transkripsi.
              Berguna untuk nama, istilah teknis, atau singkatan.
            </p>

            <div className="dictionary-form">
              <input
                type="text"
                placeholder="Kata/Frasa"
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
              />
              <input
                type="text"
                placeholder="Pengganti"
                value={newReplacement}
                onChange={(e) => setNewReplacement(e.target.value)}
              />
              <button onClick={handleAddDictionary}>Tambah</button>
            </div>

            {dictionary.length > 0 ? (
              <div className="dictionary-list">
                {dictionary.map((entry) => (
                  <div key={entry.id} className="dictionary-item">
                    <span className="dictionary-phrase">{entry.phrase}</span>
                    <span className="dictionary-arrow">→</span>
                    <span className="dictionary-replacement">{entry.replacement}</span>
                    <button
                      className="dictionary-delete"
                      onClick={() => handleDeleteDictionary(entry.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-list">
                Belum ada kata dalam dictionary
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'snippets' && (
        <div className="settings-content">
          <div className="snippets-section">
            <p className="section-description">
              Snippets adalah shortcut untuk teks yang sering diketik.
              Cukup ucapkan trigger phrase dan akan diganti otomatis.
            </p>

            <div className="snippet-form">
              <input
                type="text"
                placeholder="Trigger phrase"
                value={newSnippetTrigger}
                onChange={(e) => setNewSnippetTrigger(e.target.value)}
              />
              <input
                type="text"
                placeholder="Output text"
                value={newSnippetOutput}
                onChange={(e) => setNewSnippetOutput(e.target.value)}
              />
              <button onClick={handleAddSnippet}>Tambah</button>
            </div>

            {snippets.length > 0 ? (
              <div className="snippet-list">
                {snippets.map((snippet) => (
                  <div key={snippet.id} className="snippet-item">
                    <div className="snippet-header">
                      <span className="snippet-trigger">{snippet.trigger_phrase}</span>
                      <button
                        className="snippet-delete"
                        onClick={() => handleDeleteSnippet(snippet.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="snippet-output">{snippet.output_text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-list">
                Belum ada snippets
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
