/**
 * PresetsTab — Recording presets for quick setup.
 * Saves/loads full recording profiles: model + language + mode + VAD + prompt.
 */
import React, { useState, useEffect } from 'react';
import { Iconify } from '../../utils/icons';
import { logError, logWarning } from '../../utils/errorHandler';
import type { SettingsData } from './types';

interface Props {
  settings: SettingsData;
  save: (key: string, value: string) => Promise<void>;
  onSuccess: (msg: string) => void;
}

interface Preset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  values: Record<string, string>;
}

// Built-in presets
const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'id-casual',
    name: 'Indonesia Casual',
    icon: 'language',
    desc: 'Bahasa Indonesia natural, spoken punctuation',
    values: { language: 'id', processing_mode: 'natural', initial_prompt: '', vad_enabled: 'true', vad_sensitivity: 'medium', vad_silence_ms: '3000' },
  },
  {
    id: 'id-formal',
    name: 'Indonesia Formal',
    icon: 'text',
    desc: 'Full cleanup, proper capitalization & punctuation',
    values: { language: 'id', processing_mode: 'clean', initial_prompt: '', vad_enabled: 'true', vad_sensitivity: 'medium', vad_silence_ms: '4000' },
  },
  {
    id: 'en',
    name: 'English',
    icon: 'language',
    desc: 'English with natural cleanup',
    values: { language: 'en', processing_mode: 'natural', initial_prompt: '', vad_enabled: 'true', vad_sensitivity: 'medium', vad_silence_ms: '3000' },
  },
  {
    id: 'coding',
    name: 'Coding',
    icon: 'spark',
    desc: 'Code terms hint, raw output, no cleanup',
    values: { language: 'en', processing_mode: 'raw', initial_prompt: 'function, const, let, var, return, import, export, async, await, interface, type, class, if, else, for, while, try, catch', vad_enabled: 'true', vad_sensitivity: 'high', vad_silence_ms: '2000' },
  },
  {
    id: 'quick',
    name: 'Quick Command',
    icon: 'search',
    desc: 'Fast model, short pauses, auto-paste directly',
    values: { language: 'auto', processing_mode: 'raw', initial_prompt: '', vad_enabled: 'true', vad_sensitivity: 'high', vad_silence_ms: '1500' },
  },
  {
    id: 'meeting',
    name: 'Meeting Notes',
    icon: 'note',
    desc: 'Long pauses, large model, clean output',
    values: { language: 'auto', processing_mode: 'clean', initial_prompt: '', vad_enabled: 'true', vad_sensitivity: 'low', vad_silence_ms: '5000' },
  },
];

export function PresetsTab({ settings, save, onSuccess }: Props) {
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Load custom presets from localStorage (persist across sessions)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('voiceflow_presets');
      if (saved) setCustomPresets(JSON.parse(saved));
    } catch {}
  }, []);

  const savePresets = (presets: Preset[]) => {
    setCustomPresets(presets);
    try { localStorage.setItem('voiceflow_presets', JSON.stringify(presets)); } catch {}
  };

  const applyPreset = async (preset: Preset) => {
    setSaving(preset.id);
    try {
      for (const [key, value] of Object.entries(preset.values)) {
        await save(key, value);
      }
      onSuccess(`Preset "${preset.name}" applied`);
    } catch (err) {
      logError('PresetsTab', err);
    } finally {
      setSaving(null);
    }
  };

  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) return;
    const newPreset: Preset = {
      id: `custom-${Date.now()}`,
      name: presetName.trim(),
      icon: 'spark',
      desc: 'Custom preset',
      values: {
        language: settings.language || 'auto',
        processing_mode: settings.processing_mode || 'natural',
        initial_prompt: settings.initial_prompt || '',
        vad_enabled: settings.vad_enabled || 'true',
        vad_sensitivity: settings.vad_sensitivity || 'medium',
        vad_silence_ms: settings.vad_silence_ms || '3000',
      },
    };
    savePresets([...customPresets, newPreset]);
    setPresetName('');
    setShowSaveDialog(false);
    onSuccess(`Preset "${newPreset.name}" saved`);
  };

  const deleteCustomPreset = (id: string) => {
    savePresets(customPresets.filter(p => p.id !== id));
    onSuccess('Preset deleted');
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  return (
    <div className="settings-sections">
      <div className="section">
        <div className="section-header">Recording Presets</div>
        <div className="section-body">
          <p className="section-hint">
            One-click setup for common use cases. Each preset sets language, processing mode, VAD sensitivity, and pause timeout at once.
          </p>
          <div className="preset-grid">
            {allPresets.map(p => (
              <button
                key={p.id}
                className="preset-card"
                onClick={() => !saving && applyPreset(p)}
                disabled={saving === p.id}
                style={{ opacity: saving === p.id ? 0.6 : 1 }}
              >
                <div className="preset-icon">
                  <Iconify icon={p.icon as any} size={20} />
                </div>
                <div className="preset-name">{p.name}</div>
                <div className="preset-desc">{p.desc}</div>
                {p.id.startsWith('custom-') && (
                  <div
                    className="preset-delete"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); deleteCustomPreset(p.id); }}
                    title="Delete preset"
                  >
                    <Iconify icon="delete" size={12} />
                  </div>
                )}
                {saving === p.id && <div className="preset-loading"><span className="btn-spinner" /></div>}
              </button>
            ))}
          </div>

          {/* Save Current as Preset */}
          <div style={{ marginTop: 16 }}>
            {showSaveDialog ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Preset name..."
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentAsPreset(); if (e.key === 'Escape') setShowSaveDialog(false); }}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={saveCurrentAsPreset} disabled={!presetName.trim()}>
                  Save
                </button>
                <button className="btn btn-sm" onClick={() => setShowSaveDialog(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn btn-sm" onClick={() => setShowSaveDialog(true)}>
                <Iconify icon="spark" size={14} /> Save Current Settings as Preset
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Currently Active Summary */}
      <div className="section">
        <div className="section-header">Active Settings</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Quick Summary</span>
            <span className="setting-hint">These values will be saved when you create a new preset</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'right' }}>
            <div>Language: {settings.language || 'auto'}</div>
            <div>Mode: {settings.processing_mode || 'natural'}</div>
            <div>VAD: {settings.vad_sensitivity || 'medium'} / {settings.vad_silence_ms || '3000'}ms</div>
          </div>
        </div>
      </div>
    </div>
  );
}
