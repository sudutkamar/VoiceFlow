/**
 * LearningTab — Adaptive learning settings and learned corrections.
 */
import React from 'react';
import { Iconify } from '../../utils/icons';
import type { LearnedCorrection, AdaptiveStats } from './types';

interface Props {
  learnedCorrections: LearnedCorrection[];
  adaptiveStats: AdaptiveStats | null;
  loadLearnedCorrections: () => Promise<void>;
  onSuccess: (msg: string) => void;
}

export function LearningTab({ learnedCorrections, adaptiveStats, loadLearnedCorrections, onSuccess }: Props) {
  return (
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
                      <button
                        className="btn btn-sm btn-icon"
                        onClick={async () => {
                          await window.electronAPI.deleteLearnedCorrection(c.id);
                          loadLearnedCorrections();
                        }}
                      >
                        <Iconify icon="cancel" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px' }}>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    if (confirm('Hapus semua learned corrections?')) {
                      await window.electronAPI.clearLearnedCorrections();
                      loadLearnedCorrections();
                      onSuccess('All learned corrections cleared');
                    }
                  }}
                >
                  <Iconify icon="clear" size={14} /> Clear All Learned Data
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
  );
}
