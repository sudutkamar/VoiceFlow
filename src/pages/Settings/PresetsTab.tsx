/**
 * PresetsTab — Language presets for quick setup.
 */
import React from 'react';
import { Iconify } from '../../utils/icons';
import type { SettingsData } from './types';

interface Props {
  settings: SettingsData;
  save: (key: string, value: string) => Promise<void>;
  onSuccess: (msg: string) => void;
}

const PRESETS = [
  { id: 'id-casual', name: 'Indonesia Casual', icon: 'language', desc: 'Natural Indonesian, spoken punctuation, no formalization', language: 'id', mode: 'natural', prompt: '' },
  { id: 'id-formal', name: 'Indonesia Formal', icon: 'text', desc: 'Full cleanup, capitalization, proper punctuation', language: 'id', mode: 'clean', prompt: '' },
  { id: 'en', name: 'English', icon: 'language', desc: 'English with natural cleanup', language: 'en', mode: 'natural', prompt: '' },
  { id: 'auto', name: 'Auto Detect', icon: 'search', desc: 'Auto language, raw output, no changes', language: 'auto', mode: 'raw', prompt: '' },
  { id: 'mixed', name: 'Mixed ID/EN', icon: 'note', desc: 'Code-switching Indonesian-English, raw output', language: 'auto', mode: 'raw', prompt: '' },
  { id: 'coding', name: 'Coding Dictation', icon: 'spark', desc: 'Code terms hint, no cleanup', language: 'en', mode: 'raw', prompt: 'function, const, let, var, return, import, export, async, await, interface, type, class, if, else, for, while, try, catch, throw, null, undefined, true, false, console.log, React, TypeScript, JavaScript, npm, git' },
];

export function PresetsTab({ settings, save, onSuccess }: Props) {
  return (
    <div className="settings-sections">
      <div className="section">
        <div className="section-header">Language Presets</div>
        <div className="section-body">
          <p className="section-hint">One-click setup for common use cases. Overwrites language, processing mode, and initial prompt.</p>
          <div className="preset-grid">
            {PRESETS.map(p => (
              <button
                key={p.id}
                className="preset-card"
                onClick={async () => {
                  await save('language', p.language);
                  await save('processing_mode', p.mode);
                  await save('initial_prompt', p.prompt);
                  onSuccess(`Preset "${p.name}" applied`);
                }}
              >
                <div className="preset-icon">
                  <Iconify icon={p.icon as any} />
                </div>
                <div className="preset-name">{p.name}</div>
                <div className="preset-desc">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
