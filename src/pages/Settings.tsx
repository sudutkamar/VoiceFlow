import React, { useState, useEffect } from 'react';

interface SettingsProps {
  onSuccess: (message: string) => void;
}

interface DictEntry {
  id: string;
  phrase: string;
  replacement: string;
}

interface SnippetEntry {
  id: string;
  trigger_phrase: string;
  output_text: string;
}

function Settings({ onSuccess }: SettingsProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dict, setDict] = useState<DictEntry[]>([]);
  const [snippets, setSnippets] = useState<SnippetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'general' | 'recording' | 'processing' | 'dictionary' | 'snippets'>('general');
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [editingHotkey, setEditingHotkey] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [newOutput, setNewOutput] = useState('');

  useEffect(() => { loadData(); loadMics(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [s, d, sn] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getDictionary(),
        window.electronAPI.getSnippets(),
      ]);
      setSettings(s);
      setDict(d);
      setSnippets(sn);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMics = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(devices.filter(d => d.kind === 'audioinput'));
    } catch {}
  };

  const save = async (key: string, value: string) => {
    try {
      await window.electronAPI.updateSetting(key, value);
      setSettings({ ...settings, [key]: value });
      if (key === 'sound_effects') window.voiceflowSoundEnabled = value !== 'false';
    } catch (error) {
      console.error('Failed to save setting:', error);
    }
  };

  const toggle = async (key: string) => {
    const current = settings[key] !== 'false';
    await save(key, (!current).toString());
  };

  const handleHotkey = async (e: React.KeyboardEvent) => {
    e.preventDefault();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      parts.push(e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }
    if (parts.length >= 2) {
      const hotkey = parts.join('+').replace('Ctrl', 'CommandOrControl');
      try {
        const result = await window.electronAPI.updateHotkey(hotkey);
        if (result.success) {
          setSettings(prev => ({ ...prev, hotkey }));
          onSuccess('Hotkey updated');
        }
      } catch {}
      setEditingHotkey(false);
    }
  };

  const formatHotkey = (hk: string) => {
    return hk.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').split('+').map(k => k.trim()).join(' + ');
  };

  const addDict = async () => {
    if (!newPhrase.trim() || !newReplacement.trim()) return;
    try {
      await window.electronAPI.addDictionaryEntry(newPhrase.trim(), newReplacement.trim());
      setNewPhrase('');
      setNewReplacement('');
      const d = await window.electronAPI.getDictionary();
      setDict(d);
      onSuccess('Added');
    } catch {}
  };

  const deleteDict = async (id: string) => {
    try {
      await window.electronAPI.deleteDictionaryEntry(id);
      setDict(dict.filter(e => e.id !== id));
      onSuccess('Deleted');
    } catch {}
  };

  const addSnippet = async () => {
    if (!newTrigger.trim() || !newOutput.trim()) return;
    try {
      await window.electronAPI.addSnippet(newTrigger.trim(), newOutput.trim());
      setNewTrigger('');
      setNewOutput('');
      const s = await window.electronAPI.getSnippets();
      setSnippets(s);
      onSuccess('Added');
    } catch {}
  };

  const deleteSnippet = async (id: string) => {
    try {
      await window.electronAPI.deleteSnippet(id);
      setSnippets(snippets.filter(s => s.id !== id));
      onSuccess('Deleted');
    } catch {}
  };

  const langs = [
    { code: 'auto', name: 'Auto Detect', flag: '🌐' },
    { code: 'id', name: 'Indonesia', flag: '🇮🇩' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
  ];

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
        <h1>Settings</h1>
        <p className="page-subtitle">Configure VoiceFlow</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { id: 'general', label: 'General', icon: '⚙️' },
          { id: 'recording', label: 'Recording', icon: '🎤' },
          { id: 'processing', label: 'Processing', icon: '✨' },
          { id: 'dictionary', label: 'Dictionary', icon: '📖' },
          { id: 'snippets', label: 'Snippets', icon: '📝' },
        ].map(t => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id as any)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* General */}
      {tab === 'general' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Quick Settings</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Auto Paste</span>
                <span className="setting-hint">Auto paste text to active app</span>
              </div>
              <div className={`toggle ${settings.auto_paste !== 'false' ? 'on' : ''}`} onClick={() => toggle('auto_paste')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Sound Feedback</span>
                <span className="setting-hint">Play sound on record start/stop</span>
              </div>
              <div className={`toggle ${settings.sound_effects !== 'false' ? 'on' : ''}`} onClick={() => toggle('sound_effects')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Start on Boot</span>
                <span className="setting-hint">Launch on Windows startup</span>
              </div>
              <div className={`toggle ${settings.auto_start === 'true' ? 'on' : ''}`} onClick={async () => { const v = settings.auto_start !== 'true'; await save('auto_start', v.toString()); await window.electronAPI.setAutoStart(v); onSuccess(v ? 'Enabled' : 'Disabled'); }} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Floating UI</span>
                <span className="setting-hint">Show compact floating bar while dictating. Turn off for silent background paste.</span>
              </div>
              <div className={`toggle ${settings.show_mini_window !== 'false' ? 'on' : ''}`} onClick={async () => {
                const next = settings.show_mini_window === 'false' ? 'true' : 'false';
                await save('show_mini_window', next);
                if (next === 'false') {
                  await window.electronAPI.hideMiniWindow?.();
                } else {
                  await window.electronAPI.showMiniWindow?.();
                }
                onSuccess(next === 'false' ? 'Floating UI disabled' : 'Floating UI enabled');
              }} />
            </div>
          </div>

          <div className="section">
            <div className="section-header">Hotkey</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Push to Talk</span>
                <span className="setting-hint">Hold hotkey to record, release to stop</span>
              </div>
              <div className={`toggle ${settings.push_to_talk !== 'false' ? 'on' : ''}`} onClick={() => toggle('push_to_talk')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Recording Hotkey</span>
                <span className="setting-hint">Press key combination to change</span>
              </div>
              {editingHotkey ? (
                <div className="hotkey-input" tabIndex={0} onKeyDown={handleHotkey} onBlur={() => setEditingHotkey(false)} autoFocus>
                  Press keys...
                </div>
              ) : (
                <button className="hotkey-btn" onClick={() => setEditingHotkey(true)}>
                  {formatHotkey(settings.hotkey || 'Ctrl+Shift+F9')}
                  <span className="hotkey-edit">Edit</span>
                </button>
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-header">System</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Language</span>
                <span className="setting-hint">Transcription language</span>
              </div>
              <select value={settings.language || 'auto'} onChange={(e) => save('language', e.target.value)}>
                {langs.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
              </select>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Save History</span>
                <span className="setting-hint">Save transcription history locally</span>
              </div>
              <div className={`toggle ${settings.save_history !== 'false' ? 'on' : ''}`} onClick={() => toggle('save_history')} />
            </div>
          </div>
        </div>
      )}

      {/* Recording */}
      {tab === 'recording' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Microphone</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Input Device</span>
                <span className="setting-hint">Select microphone</span>
              </div>
              <div className="setting-control">
                <select value={settings.selected_mic || ''} onChange={(e) => { save('selected_mic', e.target.value); onSuccess('Mic changed'); }}>
                  <option value="">Default</option>
                  {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || `Mic ${m.deviceId.slice(0, 6)}`}</option>)}
                </select>
                <button className="btn btn-sm btn-icon" onClick={loadMics} title="Refresh">🔄</button>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-header">Whisper Model</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Model</span>
                <span className="setting-hint">Model for transcription</span>
              </div>
              <select value={settings.model || 'ggml-base.bin'} onChange={(e) => { save('model', e.target.value); onSuccess('Model changed'); }}>
                <option value="ggml-tiny.bin">⚡ Tiny - Fastest</option>
                <option value="ggml-base.bin">⚖️ Base - Balanced</option>
                <option value="ggml-small.bin">🎯 Small - Accurate</option>
                <option value="ggml-medium.bin">💎 Medium - Great</option>
                <option value="ggml-large-v3-turbo.bin">🏆 Large v3 Turbo - Excellent</option>
                <option value="ggml-large-v3.bin">👑 Large v3 - Best</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Processing */}
      {tab === 'processing' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Text Cleanup</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Enable Cleanup</span>
                <span className="setting-hint">Clean filler words and punctuation</span>
              </div>
              <div className={`toggle ${settings.cleanup_enabled !== 'false' ? 'on' : ''}`} onClick={() => toggle('cleanup_enabled')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Remove Fillers</span>
                <span className="setting-hint">Remove filler words (eh, anu, hmm)</span>
              </div>
              <div className={`toggle ${settings.remove_fillers !== 'false' ? 'on' : ''}`} onClick={() => toggle('remove_fillers')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Verbatim Mode</span>
                <span className="setting-hint">Most accurate for casual speech: do not rewrite, correct, or formalize words</span>
              </div>
              <div className={`toggle ${settings.verbatim_mode !== 'false' ? 'on' : ''}`} onClick={() => toggle('verbatim_mode')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Audio Preprocessing</span>
                <span className="setting-hint">Optional noise gate/normalization. Leave off if words sound cut or inaccurate.</span>
              </div>
              <div className={`toggle ${settings.audio_preprocess === 'true' ? 'on' : ''}`} onClick={() => toggle('audio_preprocess')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Fuzzy Auto-Correct</span>
                <span className="setting-hint">Use dictionary-like correction. Disabled in Verbatim Mode.</span>
              </div>
              <div className={`toggle ${settings.fuzzy_match === 'true' ? 'on' : ''}`} onClick={() => toggle('fuzzy_match')} />
            </div>
          </div>

          <div className="section">
            <div className="section-header">Capitalization</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Capitalize First</span>
                <span className="setting-hint">Capitalize first letter</span>
              </div>
              <div className={`toggle ${settings.capitalize_first !== 'false' ? 'on' : ''}`} onClick={() => toggle('capitalize_first')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Capitalize Sentences</span>
                <span className="setting-hint">Capitalize after period</span>
              </div>
              <div className={`toggle ${settings.capitalize_sentences !== 'false' ? 'on' : ''}`} onClick={() => toggle('capitalize_sentences')} />
            </div>
          </div>

          <div className="section">
            <div className="section-header">Voice Commands</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Enable Voice Commands</span>
                <span className="setting-hint">Use voice commands (new paragraph, bold, etc)</span>
              </div>
              <div className={`toggle ${settings.voice_commands !== 'false' ? 'on' : ''}`} onClick={() => toggle('voice_commands')} />
            </div>
          </div>
        </div>
      )}

      {/* Dictionary */}
      {tab === 'dictionary' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Custom Dictionary</div>
            <div className="section-body">
              <p className="section-hint">Words that will be auto-replaced during transcription.</p>
              <div className="form-row">
                <input type="text" placeholder="Original word" value={newPhrase} onChange={(e) => setNewPhrase(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDict()} />
                <input type="text" placeholder="Replacement" value={newReplacement} onChange={(e) => setNewReplacement(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDict()} />
                <button className="btn btn-primary" onClick={addDict}>Add</button>
              </div>
              {dict.length > 0 ? (
                <div className="list">
                  {dict.map((entry) => (
                    <div key={entry.id} className="list-item">
                      <span className="list-key">{entry.phrase}</span>
                      <span className="list-arrow">→</span>
                      <span className="list-value">{entry.replacement}</span>
                      <button className="btn btn-sm btn-icon" onClick={() => deleteDict(entry.id)}>✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hint">No dictionary entries yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Snippets */}
      {tab === 'snippets' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Text Snippets</div>
            <div className="section-body">
              <p className="section-hint">Shortcuts for frequently used text.</p>
              <div className="form-row">
                <input type="text" placeholder="Trigger phrase" value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSnippet()} />
                <input type="text" placeholder="Output text" value={newOutput} onChange={(e) => setNewOutput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSnippet()} />
                <button className="btn btn-primary" onClick={addSnippet}>Add</button>
              </div>
              {snippets.length > 0 ? (
                <div className="list">
                  {snippets.map((snippet) => (
                    <div key={snippet.id} className="list-item snippet">
                      <div className="snippet-top">
                        <span className="list-key">{snippet.trigger_phrase}</span>
                        <button className="btn btn-sm btn-icon" onClick={() => deleteSnippet(snippet.id)}>✕</button>
                      </div>
                      <div className="snippet-output">{snippet.output_text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hint">No snippets yet</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
