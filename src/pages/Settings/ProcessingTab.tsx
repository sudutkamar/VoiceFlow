/**
 * ProcessingTab — Processing mode, VAD, and LLM settings.
 */
import React, { useRef } from 'react';
import { Iconify } from '../../utils/icons';
import type { SettingsData } from './types';

interface Props {
  settings: SettingsData;
  setSettings: React.Dispatch<React.SetStateAction<SettingsData>>;
  save: (key: string, value: string) => Promise<void>;
  toggle: (key: string) => void;
  onSuccess: (msg: string) => void;
}

export function ProcessingTab({ settings, setSettings, save, toggle, onSuccess }: Props) {
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    };
  }, []);

  return (
    <div className="settings-sections">
      {/* Processing Mode */}
      <div className="section">
        <div className="section-header">Processing Mode</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Output Mode</span>
            <span className="setting-hint">How text is processed after transcription</span>
          </div>
          <select value={settings.processing_mode || 'natural'} onChange={(e) => save('processing_mode', e.target.value)}>
            <option value="raw">Raw - Whisper output as-is</option>
            <option value="natural">Natural - Spoken punctuation only</option>
            <option value="clean">Clean - Full cleanup + capitalization</option>
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
          <input
            type="text"
            className="setting-input"
            placeholder="e.g. VoiceFlow, API, React, TypeScript"
            value={settings.initial_prompt || ''}
            onChange={(e) => {
              const val = e.target.value;
              setSettings(prev => ({ ...prev, initial_prompt: val }));
              if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
              promptTimerRef.current = setTimeout(() => save('initial_prompt', val), 500);
            }}
          />
        </div>
      </div>

      {/* Voice Activity Detection */}
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

      {/* Advanced */}
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

      {/* LLM Post-Processing */}
      <div className="section">
        <div className="section-header">LLM Post-Processing <span className="badge badge-new">NEW</span></div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Enable LLM Grammar Fix</span>
            <span className="setting-hint">Use local AI to fix grammar, punctuation &amp; sentence flow (applied BEFORE TextCleaner)</span>
          </div>
          <div className={`toggle ${settings.llm_postprocess === 'true' ? 'on' : ''}`} onClick={() => toggle('llm_postprocess')} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Active Model</span>
            <span className="setting-hint">{settings.llm_model ? settings.llm_model : 'No model selected'}</span>
          </div>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => {
              const event = new CustomEvent('navigate-page', { detail: 'llm-models' });
              window.dispatchEvent(event);
            }}
          >
            <Iconify icon="download" size={14} /> Manage Models
          </button>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Download llama-cli</span>
            <span className="setting-hint">Download llama.cpp binary (18MB ZIP) dan extract otomatis ke folder resources/llm/</span>
          </div>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              const event = new CustomEvent('navigate-page', { detail: 'llm-models' });
              window.dispatchEvent(event);
            }}
          >
            <Iconify icon="download" size={14} /> Download Binary
          </button>
        </div>
      </div>
    </div>
  );
}
