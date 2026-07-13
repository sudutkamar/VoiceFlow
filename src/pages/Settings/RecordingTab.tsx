/**
 * RecordingTab — Microphone and model settings.
 */
import React from 'react';
import { Iconify } from '../../utils/icons';
import type { SettingsData } from './types';

interface Props {
  settings: SettingsData;
  save: (key: string, value: string) => Promise<void>;
  mics: MediaDeviceInfo[];
  availableModels: { name: string; downloaded?: boolean }[];
  loadMics: () => Promise<void>;
  onSuccess: (msg: string) => void;
}

export function RecordingTab({ settings, save, mics, availableModels, loadMics, onSuccess }: Props) {
  return (
    <div className="settings-sections">
      {/* Microphone */}
      <div className="section">
        <div className="section-header">Microphone</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Input Device</span>
            <span className="setting-hint">Select microphone</span>
          </div>
          <div className="setting-control">
            <select
              value={settings.selected_mic || ''}
              onChange={(e) => {
                save('selected_mic', e.target.value);
                onSuccess('Mic changed');
              }}
            >
              <option value="">Default</option>
              {mics.map(m => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || `Mic ${m.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-icon" onClick={loadMics} title="Refresh">
              <Iconify icon="refresh" />
            </button>
          </div>
        </div>
      </div>

      {/* Whisper Model */}
      <div className="section">
        <div className="section-header">Whisper Model</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Model</span>
            <span className="setting-hint">Larger models = better accuracy, slower speed</span>
          </div>
          <select
            value={settings.model || 'ggml-large-v3-turbo-q5_0.bin'}
            onChange={(e) => {
              save('model', e.target.value);
              onSuccess('Model changed');
            }}
          >
            {availableModels.length > 0 ? (
              availableModels.map(m => (
                <option key={m.name} value={m.name}>
                  {m.name.replace('ggml-', '').replace('.bin', '')}
                </option>
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
  );
}
