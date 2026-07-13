/**
 * SnippetsTab — Text snippet shortcuts.
 */
import React, { useState } from 'react';
import { Iconify } from '../../utils/icons';
import type { SnippetEntry } from './types';

interface Props {
  snippets: SnippetEntry[];
  setSnippets: (snippets: SnippetEntry[]) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function SnippetsTab({ snippets, setSnippets, onSuccess, onError }: Props) {
  const [newTrigger, setNewTrigger] = useState('');
  const [newOutput, setNewOutput] = useState('');

  const addSnippet = async () => {
    if (!newTrigger.trim() || !newOutput.trim()) return;
    try {
      await window.electronAPI.addSnippet(newTrigger.trim(), newOutput.trim());
      const updated = await window.electronAPI.getSnippets();
      setSnippets(updated);
      setNewTrigger('');
      setNewOutput('');
      onSuccess('Snippet added');
    } catch (err: any) {
      onError(err.message || 'Failed to add snippet');
    }
  };

  const deleteSnippet = async (id: string) => {
    try {
      await window.electronAPI.deleteSnippet(id);
      const updated = await window.electronAPI.getSnippets();
      setSnippets(updated);
      onSuccess('Snippet deleted');
    } catch (err: any) {
      onError(err.message || 'Failed to delete snippet');
    }
  };

  return (
    <div className="settings-sections">
      <div className="section">
        <div className="section-header">Text Snippets</div>
        <div className="section-body">
          <p className="section-hint">Shortcuts for frequently used text.</p>
          <div className="form-row">
            <input
              type="text"
              placeholder="Trigger phrase"
              value={newTrigger}
              onChange={(e) => setNewTrigger(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSnippet()}
            />
            <input
              type="text"
              placeholder="Output text"
              value={newOutput}
              onChange={(e) => setNewOutput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSnippet()}
            />
            <button className="btn btn-primary" onClick={addSnippet}>
              <Iconify icon="add" size={14} /> Add
            </button>
          </div>
          {snippets.length > 0 ? (
            <div className="list">
              {snippets.map((snippet) => (
                <div key={snippet.id} className="list-item snippet">
                  <div className="snippet-top">
                    <span className="list-key">{snippet.trigger_phrase}</span>
                    <button className="btn btn-sm btn-icon" onClick={() => deleteSnippet(snippet.id)}>
                      <Iconify icon="cancel" size={14} />
                    </button>
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
  );
}
