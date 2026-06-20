import React, { useState, useEffect } from 'react';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [hotkey, setHotkey] = useState('');
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [tempHotkey, setTempHotkey] = useState('');
  const [language, setLanguage] = useState('auto');
  const [selectedMic, setSelectedMic] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadAudioDevices();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const data = await window.electronAPI.getSettings();
      setSettings(data);
      setHotkey(data.hotkey || 'CommandOrControl+Shift+Space');
      setLanguage(data.language || 'auto');
      setSelectedMic(data.selected_mic || '');
    } catch {}
  };

  const loadAudioDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }));
      setAudioDevices(mics);
    } catch {}
  };

  const updateSetting = async (key: string, value: string) => {
    try {
      await window.electronAPI.updateSetting(key, value);
      setSettings({ ...settings, [key]: value });
    } catch {}
  };

  const handleHotkeyKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');

    // Add the main key if it's not a modifier
    const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
    if (!modifierKeys.includes(e.key)) {
      const keyName = e.key === ' ' ? 'Space' : 
                      e.key.length === 1 ? e.key.toUpperCase() : 
                      e.key;
      parts.push(keyName);
    }

    if (parts.length >= 2) {
      const newHotkey = parts.join('+');
      setTempHotkey(newHotkey);
    }
  };

  const saveHotkey = async () => {
    if (tempHotkey) {
      const electronHotkey = tempHotkey
        .replace('Ctrl', 'CommandOrControl')
        .replace('Super', 'Super');
      
      try {
        const result = await window.electronAPI.updateHotkey(electronHotkey);
        if (result.success) {
          setHotkey(tempHotkey);
          setSettings({ ...settings, hotkey: electronHotkey });
        } else {
          alert('Gagal mendaftarkan hotkey: ' + (result.error || 'Hotkey sudah digunakan atau tidak valid'));
        }
      } catch (error) {
        console.error('Failed to update hotkey:', error);
        alert('Gagal mendaftarkan hotkey');
      }
      setTempHotkey('');
      setIsRecordingHotkey(false);
    }
  };

  const formatHotkey = (hk: string) => {
    return hk
      .replace('CommandOrControl', 'Ctrl')
      .replace('Control', 'Ctrl')
      .split('+')
      .map(k => k.trim())
      .join(' + ');
  };

  const languages = [
    { code: 'auto', label: 'Auto Detect', flag: '🌐' },
    { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'ko', label: '한국어', flag: '🇰🇷' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
  ];

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          {/* Microphone */}
          <div className="setting-group">
            <label className="setting-label">
              <span className="label-icon">🎤</span>
              <span className="label-text">Microphone</span>
            </label>
            <div className="setting-control">
              <select 
                value={selectedMic} 
                onChange={e => {
                  setSelectedMic(e.target.value);
                  updateSetting('selected_mic', e.target.value);
                }}
              >
                <option value="">Default</option>
                {audioDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
              <button className="refresh-btn" onClick={loadAudioDevices}>🔄</button>
            </div>
          </div>

          {/* Language */}
          <div className="setting-group">
            <label className="setting-label">
              <span className="label-icon">🌐</span>
              <span className="label-text">Language</span>
            </label>
            <select 
              value={language} 
              onChange={e => {
                setLanguage(e.target.value);
                updateSetting('language', e.target.value);
              }}
            >
              {languages.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>

          {/* Hotkey */}
          <div className="setting-group">
            <label className="setting-label">
              <span className="label-icon">⌨️</span>
              <span className="label-text">Hotkey</span>
            </label>
            <div className="hotkey-input-wrapper">
              {isRecordingHotkey ? (
                <div 
                  className="hotkey-input recording"
                  onKeyDown={handleHotkeyKeyDown}
                  onBlur={() => {
                    if (tempHotkey) saveHotkey();
                    setIsRecordingHotkey(false);
                  }}
                  tabIndex={0}
                  autoFocus
                >
                  <span className="hotkey-hint">Press keys...</span>
                  {tempHotkey && (
                    <div className="hotkey-preview">
                      {formatHotkey(tempHotkey)}
                      <button className="save-hotkey" onClick={saveHotkey}>✓</button>
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  className="hotkey-display"
                  onClick={() => setIsRecordingHotkey(true)}
                >
                  <span>{formatHotkey(hotkey)}</span>
                  <span className="edit-hint">Click to change</span>
                </button>
              )}
            </div>
          </div>

          {/* Auto Paste */}
          <div className="setting-group">
            <label className="setting-label">
              <span className="label-icon">📋</span>
              <span className="label-text">Auto Paste</span>
            </label>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={settings.auto_paste !== 'false'}
                onChange={e => updateSetting('auto_paste', e.target.checked.toString())}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Cleanup */}
          <div className="setting-group">
            <label className="setting-label">
              <span className="label-icon">✨</span>
              <span className="label-text">Text Cleanup</span>
            </label>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={settings.cleanup_enabled !== 'false'}
                onChange={e => updateSetting('cleanup_enabled', e.target.checked.toString())}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        <div className="settings-footer">
          <span className="version">VoiceFlow v0.1.0</span>
        </div>
      </div>
    </div>
  );
}
