import React, { useState, useEffect, useRef, useCallback } from 'react';
import appLogo from '../assets/logo.png';

interface SettingsProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
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

function Settings({ onSuccess, onError }: SettingsProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dict, setDict] = useState<DictEntry[]>([]);
  const [snippets, setSnippets] = useState<SnippetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'general' | 'recording' | 'processing' | 'presets' | 'dictionary' | 'snippets' | 'learning'>('general');
  const [learnedCorrections, setLearnedCorrections] = useState<any[]>([]);
  const [adaptiveStats, setAdaptiveStats] = useState<{ total: number; totalFrequency: number; avgConfidence: number } | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [editingHotkey, setEditingHotkey] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [newOutput, setNewOutput] = useState('');
  const [gpuStatus, setGpuStatus] = useState<{ hasGpu: boolean; mode: string; cudaDllsPresent?: boolean; needsDownload?: boolean; downloadUrl?: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<{ name: string; downloaded?: boolean }[]>([]);
  const [appVersion, setAppVersion] = useState('');
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (promptTimerRef.current) clearTimeout(promptTimerRef.current); };
  }, []);

  useEffect(() => { loadData(); loadMics(); loadGpuStatus(); loadModels(); loadVersion(); loadLearnedCorrections(); }, []);

  const loadGpuStatus = async () => {
    try {
      const status = await window.electronAPI.getGpuStatus();
      setGpuStatus(status);
    } catch {}
  };

  const loadModels = async () => {
    try {
      const models = await window.electronAPI.scanModelsFolder();
      const downloaded = models.filter((m: any) => m.downloaded);
      setAvailableModels(downloaded);
    } catch {}
  };

  const loadVersion = async () => {
    try {
      const v = await window.electronAPI.getVersion();
      setAppVersion(v);
    } catch {}
  };

  const loadLearnedCorrections = async () => {
    try {
      const corrections = await window.electronAPI.getLearnedCorrections();
      setLearnedCorrections(corrections);
      const stats = await window.electronAPI.getAdaptiveStats();
      setAdaptiveStats(stats);
    } catch {}
  };

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
      setSettings(prev => ({ ...prev, [key]: value }));
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
        } else if (result.error) {
          onError(result.error);
        }
      } catch {
        onError('Gagal mengupdate hotkey');
      }
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
      <div className="tabs" onKeyDown={(e) => {
        const tabIds = ['general', 'recording', 'processing', 'presets', 'dictionary', 'snippets'];
        const idx = tabIds.indexOf(tab);
        if (e.key === 'ArrowRight' && idx < tabIds.length - 1) { e.preventDefault(); setTab(tabIds[idx + 1] as any); }
        if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); setTab(tabIds[idx - 1] as any); }
      }}>
        {[
          { id: 'general', label: 'General', icon: '⚙️' },
          { id: 'recording', label: 'Recording', icon: '🎤' },
          { id: 'processing', label: 'Processing', icon: '✨' },
          { id: 'presets', label: 'Presets', icon: '🎯' },
          { id: 'dictionary', label: 'Dictionary', icon: '📖' },
          { id: 'snippets', label: 'Snippets', icon: '📝' },
          { id: 'learning', label: 'Learning', icon: '🧠' },
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
            <div className="section-header">Appearance</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Theme</span>
                <span className="setting-hint">Switch between dark and light appearance</span>
              </div>
              <div className="theme-switcher">
                <button
                  className={`theme-btn ${settings.theme !== 'light' ? 'active' : ''}`}
                  onClick={async () => { await save('theme', 'dark'); document.documentElement.classList.remove('light-theme'); }}
                  title="Dark Theme"
                >
                  🌙 Dark
                </button>
                <button
                  className={`theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
                  onClick={async () => { await save('theme', 'light'); document.documentElement.classList.add('light-theme'); }}
                  title="Light Theme"
                >
                  ☀️ Light
                </button>
              </div>
            </div>
          </div>

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
                <span className="setting-name">Acceleration</span>
                <span className="setting-hint">
                  {gpuStatus?.hasGpu
                    ? gpuStatus?.cudaDllsPresent
                      ? 'GPU detected (CUDA). Choose processing device.'
                      : 'GPU detected. CUDA perlu di-download.'
                    : 'No GPU detected. CPU only.'}
                </span>
              </div>
              <div className="setting-control">
                {gpuStatus?.hasGpu && gpuStatus?.cudaDllsPresent ? (
                  <select
                    value={settings.whisper_device || 'auto'}
                    onChange={(e) => {
                      save('whisper_device', e.target.value);
                      const labels: Record<string, string> = { auto: 'Auto (GPU)', gpu: 'Force GPU', cpu: 'Force CPU' };
                      onSuccess(`Device: ${labels[e.target.value] || e.target.value}`);
                    }}
                  >
                    <option value="auto">Auto (GPU)</option>
                    <option value="gpu">Force GPU</option>
                    <option value="cpu">Force CPU</option>
                  </select>
                ) : gpuStatus?.hasGpu && gpuStatus?.needsDownload ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (gpuStatus?.downloadUrl) {
                        window.open(gpuStatus.downloadUrl, '_blank');
                        onSuccess('Download CUDA, lalu extract ke folder yang ditunjukkan');
                      }
                    }}
                  >
                    Download CUDA
                  </button>
                ) : (
                  <div className="gpu-badge gpu-badge-cpu">
                    <span className="gpu-badge-icon">🖥️</span>
                    <span className="gpu-badge-text">CPU Only</span>
                  </div>
                )}
              </div>
            </div>
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
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Clear Cache</span>
                <span className="setting-hint">Remove GPU cache & temp files to fix errors</span>
              </div>
              <button className="btn btn-sm" onClick={async () => {
                try {
                  const result = await window.electronAPI.clearCache();
                  if (result.success) {
                    onSuccess(`Cache cleared! ${result.filesCleared || 0} files removed`);
                  } else {
                    onError(result.error || 'Failed to clear cache');
                  }
                } catch (err: any) {
                  onError(err.message || 'Failed to clear cache');
                }
              }}>
                🗑️ Clear Cache
              </button>
            </div>
          </div>

          <div className="section">
            <div className="section-header">About</div>
            <div className="about-logo-section">
              <img src={appLogo} alt="VoiceFlow" className="about-logo-img" />
              <div className="about-logo-text">
                <span className="about-logo-name">VoiceFlow</span>
                <span className="about-logo-desc">Local voice-to-text powered by Whisper AI</span>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Version</span>
                <span className="setting-hint">Current app version</span>
              </div>
              <span className="setting-value">{appVersion || '1.0.0'}</span>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">GitHub</span>
                <span className="setting-hint">Source code, issues, and updates</span>
              </div>
              <button className="btn btn-sm" onClick={() => window.open('https://github.com/sudutkamar/VoiceFlow', '_blank')}>
                Open
              </button>
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
                <span className="setting-hint">Larger models = better accuracy, slower speed</span>
              </div>
              <select value={settings.model || 'ggml-large-v3-turbo-q5_0.bin'} onChange={(e) => { save('model', e.target.value); onSuccess('Model changed'); }}>
                {availableModels.length > 0 ? (
                  availableModels.map(m => (
                    <option key={m.name} value={m.name}>{m.name.replace('ggml-', '').replace('.bin', '')}</option>
                  ))
                ) : (
                  <>
                    <option value="ggml-base-q5_1.bin">Base Q5 - Fast</option>
                    <option value="ggml-base.bin">Base - Balanced</option>
                    <option value="ggml-large-v3-turbo-q5_0.bin">Large v3 Turbo Q5</option>
                    <option value="ggml-large-v3.bin">Large v3 - Best</option>
                  </>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Processing */}
      {tab === 'processing' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Processing Mode</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Output Mode</span>
                <span className="setting-hint">How text is processed after transcription</span>
              </div>
              <select value={settings.processing_mode || 'natural'} onChange={(e) => save('processing_mode', e.target.value)}>
                <option value="raw">🔴 Raw - Whisper output as-is</option>
                <option value="natural">🟡 Natural - Spoken punctuation only</option>
                <option value="clean">🟢 Clean - Full cleanup + capitalization</option>
              </select>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Verbatim Mode</span>
                <span className="setting-hint">Force Raw mode regardless of Output Mode setting</span>
              </div>
              <div className={`toggle ${settings.verbatim_mode !== 'false' ? 'on' : ''}`} onClick={() => toggle('verbatim_mode')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Initial Prompt</span>
                <span className="setting-hint">Hint Whisper with domain words (e.g. coding terms, names). Leave empty for auto.</span>
              </div>
              <input type="text" className="setting-input" placeholder="e.g. VoiceFlow, API, React, TypeScript" value={settings.initial_prompt || ''} onChange={(e) => {
                const val = e.target.value;
                setSettings(prev => ({ ...prev, initial_prompt: val }));
                if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
                promptTimerRef.current = setTimeout(() => save('initial_prompt', val), 500);
              }} />
            </div>
          </div>

          <div className="section">
            <div className="section-header">Voice Activity Detection</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Auto-Stop on Silence</span>
                <span className="setting-hint">Stop recording automatically when you stop speaking</span>
              </div>
              <div className={`toggle ${settings.vad_enabled !== 'false' ? 'on' : ''}`} onClick={() => toggle('vad_enabled')} />
            </div>
            {settings.vad_enabled !== 'false' && (
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-name">Silence Timeout</span>
                  <span className="setting-hint">How long to wait before auto-stopping (ms)</span>
                </div>
                <select value={settings.vad_silence_ms || '1500'} onChange={(e) => save('vad_silence_ms', e.target.value)}>
                  <option value="800">Fast (0.8s)</option>
                  <option value="1200">Medium (1.2s)</option>
                  <option value="1500">Normal (1.5s)</option>
                  <option value="2500">Slow (2.5s)</option>
                  <option value="4000">Very Slow (4s)</option>
                </select>
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-header">Advanced</div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Audio Preprocessing</span>
                <span className="setting-hint">Noise gate/normalization. OFF recommended for best accuracy.</span>
              </div>
              <div className={`toggle ${settings.audio_preprocess === 'true' ? 'on' : ''}`} onClick={() => toggle('audio_preprocess')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Fuzzy Auto-Correct</span>
                <span className="setting-hint">Dictionary-based correction. OFF recommended in Raw/Natural mode.</span>
              </div>
              <div className={`toggle ${settings.fuzzy_match === 'true' ? 'on' : ''}`} onClick={() => toggle('fuzzy_match')} />
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-name">Voice Commands</span>
                <span className="setting-hint">"koma" → ",", "titik" → ".", "new paragraph" → enter</span>
              </div>
              <div className={`toggle ${settings.voice_commands !== 'false' ? 'on' : ''}`} onClick={() => toggle('voice_commands')} />
            </div>
          </div>
        </div>
      )}

      {/* Presets */}
      {tab === 'presets' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Language Presets</div>
            <div className="section-body">
              <p className="section-hint">One-click setup for common use cases. Overwrites language, processing mode, and initial prompt.</p>
              <div className="preset-grid">
                {[
                  { id: 'id-casual', name: 'Indonesia Casual', icon: '🇮🇩', desc: 'Natural Indonesian, spoken punctuation, no formalization', language: 'id', mode: 'natural', prompt: '' },
                  { id: 'id-formal', name: 'Indonesia Formal', icon: '📝', desc: 'Full cleanup, capitalization, proper punctuation', language: 'id', mode: 'clean', prompt: '' },
                  { id: 'en', name: 'English', icon: '🇺🇸', desc: 'English with natural cleanup', language: 'en', mode: 'natural', prompt: '' },
                  { id: 'auto', name: 'Auto Detect', icon: '🌐', desc: 'Auto language, raw output, no changes', language: 'auto', mode: 'raw', prompt: '' },
                  { id: 'mixed', name: 'Mixed ID/EN', icon: '🔀', desc: 'Code-switching Indonesian-English, raw output', language: 'auto', mode: 'raw', prompt: '' },
                  { id: 'coding', name: 'Coding Dictation', icon: '💻', desc: 'Code terms hint, no cleanup', language: 'en', mode: 'raw', prompt: 'function, const, let, var, return, import, export, async, await, interface, type, class, if, else, for, while, try, catch, throw, null, undefined, true, false, console.log, React, TypeScript, JavaScript, npm, git' },
                ].map(p => (
                  <button key={p.id} className="preset-card" onClick={async () => {
                    await save('language', p.language);
                    await save('processing_mode', p.mode);
                    await save('initial_prompt', p.prompt);
                    onSuccess(`Preset "${p.name}" applied`);
                  }}>
                    <div className="preset-icon">{p.icon}</div>
                    <div className="preset-name">{p.name}</div>
                    <div className="preset-desc">{p.desc}</div>
                  </button>
                ))}
              </div>
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

      {/* Adaptive Learning */}
      {tab === 'learning' && (
        <div className="settings-sections">
          <div className="section">
            <div className="section-header">Adaptive Learning</div>
            <div className="section-body">
              <p className="section-hint">
                VoiceFlow automatically learns from your usage. When you copy or paste text 
                that differs from the transcription, the system learns and auto-applies 
                similar corrections in the future. No manual editing needed!
              </p>
              
              {/* Stats */}
              {adaptiveStats && (
                <div className="learning-stats">
                  <div className="learning-stat">
                    <span className="learning-stat-value">{adaptiveStats.total}</span>
                    <span className="learning-stat-label">Learned Patterns</span>
                  </div>
                  <div className="learning-stat">
                    <span className="learning-stat-value">{adaptiveStats.totalFrequency}</span>
                    <span className="learning-stat-label">Total Applications</span>
                  </div>
                  <div className="learning-stat">
                    <span className="learning-stat-value">{Math.round(adaptiveStats.avgConfidence * 100)}%</span>
                    <span className="learning-stat-label">Avg Confidence</span>
                  </div>
                </div>
              )}

              {/* Corrections List */}
              {learnedCorrections.length > 0 ? (
                <>
                  <div className="list">
                    {learnedCorrections.map((c) => (
                      <div key={c.id} className="list-item learned-item">
                        <div className="learned-original">{c.original}</div>
                        <span className="list-arrow">→</span>
                        <div className="learned-corrected">{c.corrected}</div>
                        <div className="learned-meta">
                          <span className="learned-freq">×{c.frequency}</span>
                          <button className="btn btn-sm btn-icon" onClick={async () => {
                            await window.electronAPI.deleteLearnedCorrection(c.id);
                            loadLearnedCorrections();
                          }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <button className="btn btn-danger btn-sm" onClick={async () => {
                      if (confirm('Hapus semua learned corrections?')) {
                        await window.electronAPI.clearLearnedCorrections();
                        loadLearnedCorrections();
                        onSuccess('All learned corrections cleared');
                      }
                    }}>
                      Clear All Learned Data
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-hint">
                  <p>No learned corrections yet.</p>
                  <p style={{ marginTop: '8px', fontSize: '12px' }}>
                    Start recording and editing your transcriptions. 
                    VoiceFlow will learn from your corrections automatically.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
