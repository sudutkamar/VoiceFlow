/**
 * DictionaryTab — Custom word replacement dictionary.
 */
import React, { useState } from 'react';
import { Iconify } from '../../utils/icons';
import type { DictEntry } from './types';

interface Props {
  dict: DictEntry[];
  setDict: (dict: DictEntry[]) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function DictionaryTab({ dict, setDict, onSuccess, onError }: Props) {
  const [newPhrase, setNewPhrase] = useState('');
  const [newReplacement, setNewReplacement] = useState('');

  const addDict = async () => {
    if (!newPhrase.trim() || !newReplacement.trim()) return;
    try {
      await window.electronAPI.addDictionaryEntry(newPhrase.trim(), newReplacement.trim());
      const updated = await window.electronAPI.getDictionary();
      setDict(updated);
      setNewPhrase('');
      setNewReplacement('');
      onSuccess('Dictionary entry added');
    } catch (err: any) {
      onError(err.message || 'Failed to add entry');
    }
  };

  const deleteDict = async (id: string) => {
    try {
      await window.electronAPI.deleteDictionaryEntry(id);
      const updated = await window.electronAPI.getDictionary();
      setDict(updated);
      onSuccess('Entry deleted');
    } catch (err: any) {
      onError(err.message || 'Failed to delete entry');
    }
  };

  return (
    <div className="settings-sections">
      <div className="section">
        <div className="section-header">Custom Dictionary</div>
        <div className="section-body">
          <p className="section-hint">Words that will be auto-replaced during transcription.</p>
          <div className="form-row">
            <input
              type="text"
              placeholder="Original word"
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDict()}
            />
            <input
              type="text"
              placeholder="Replacement"
              value={newReplacement}
              onChange={(e) => setNewReplacement(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDict()}
            />
            <button className="btn btn-primary" onClick={addDict}>
              <Iconify icon="add" size={14} /> Add
            </button>
          </div>
          {dict.length > 0 ? (
            <div className="list">
              {dict.map((entry) => (
                <div key={entry.id} className="list-item">
                  <span className="list-key">{entry.phrase}</span>
                  <span className="list-arrow">→</span>
                  <span className="list-value">{entry.replacement}</span>
                  <button className="btn btn-sm btn-icon" onClick={() => deleteDict(entry.id)}>
                    <Iconify icon="cancel" size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-hint">No dictionary entries yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
