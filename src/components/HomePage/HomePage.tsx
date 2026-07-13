/**
 * HomePage — Main recording page in the full app window.
 * Contains the mic button, waveform visualizer, and result display.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useRecorder } from '../../hooks/useRecorder';
import { playSound } from '../../utils/audio';
import { Iconify, getModelIcon, getModelSizeColor } from '../../utils/icons';

type State = 'idle' | 'hover' | 'recording' | 'processing' | 'done';

interface HomePageProps {
  settings: Record<string, string>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

/** Get confidence color for display */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#4ade80';
  if (confidence >= 0.75) return '#4a9eff';
  if (confidence >= 0.6) return '#fbbf24';
  return '#f87171';
}

export default function HomePage({ settings, onSuccess, onError }: HomePageProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<any>(null);
  const [fuzzyChanges, setFuzzyChanges] = useState<number>(0);
  const [rawText, setRawText] = useState<string>('');
  const [levels, setLevels] = useState<number[]>(Array(30).fill(0));
  const prevState = useRef<State>('idle');

  const {
    state, setState,
    text, setText,
    partial, setPartial,
    error, setError,
    time, micLevel, setMicLevel, clipPeak, setClipPeak,
    analyserRef, animRef, wavRecorderRef, stateRef, processingTimeoutRef,
    cancelRec, toggle,
  } = useRecorder(settings, {
    onTranscript: (d) => {
      const result = d.cleaned || d.raw;
      setText(result);
      setConfidence(d.confidence || null);
      setFuzzyChanges(d.fuzzyChanges || 0);
      setRawText(d.rawText || '');
      setHistory(prev => [result, ...prev].slice(0, 10));
      setState('done');
      playSound('done');
      setTimeout(() => setState('idle'), 2000);
    },
    onPartial: (p) => setPartial(p),
    onError: (e) => {
      if (e === '__NO_SPEECH__') {
        setError('Tidak terdeteksi suara');
        setState('idle');
        setTimeout(() => setError(''), 2000);
        return;
      }
      setError(e);
      setState('idle');
      playSound('error');
      setTimeout(() => setError(''), 3000);
    },
    minRecordingMs: 2000,
  });

  const vadEnabled = settings.vad_enabled !== 'false';

  // Sound effects for recording state transitions
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (state === 'recording' && prev !== 'recording') playSound('start');
    else if (state === 'processing' && prev === 'recording') playSound('stop');
  }, [state]);

  // Visualization effect
  useEffect(() => {
    if (state !== 'recording') { setLevels(Array(30).fill(0)); return; }
    const viz = () => {
      if (!analyserRef.current || !wavRecorderRef.current?.isRecording()) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      setLevels(Array.from(data).slice(0, 30).map((v) => Math.min(100, v * 1.8)));
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setMicLevel(Math.min(100, avg * 2));
      setClipPeak(prev => Math.max(prev, avg > 80 ? 2 : avg > 60 ? 1 : 0));
      animRef.current = requestAnimationFrame(viz);
    };
    viz();
    return () => { cancelAnimationFrame(animRef.current); };
  }, [state]);

  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

  const [hasModel, setHasModel] = useState<boolean | null>(null);

  useEffect(() => {
    window.electronAPI.hasAnyModel().then(setHasModel).catch(() => setHasModel(true));
  }, []);

  // Determine active profile based on model and audio settings
  const getActiveProfile = () => {
    const model = settings.model || '';
    const modelName = model.replace('ggml-', '').replace('.bin', '');
    
    // Get model display name
    let displayName = 'No Model';
    if (model.includes('large-v3-q5_0')) displayName = 'Large v3 Q5';
    else if (model.includes('large-v3-turbo-q8_0')) displayName = 'Large v3 Turbo Q8';
    else if (model.includes('large-v3-turbo-q5_0')) displayName = 'Large v3 Turbo Q5';
    else if (model.includes('large-v3-turbo')) displayName = 'Large v3 Turbo';
    else if (model.includes('large-v3')) displayName = 'Large v3';
    else if (model.includes('large')) displayName = 'Large';
    else if (model.includes('medium')) displayName = 'Medium';
    else if (model.includes('small')) displayName = 'Small';
    else if (model.includes('base-q5_1')) displayName = 'Base Q5';
    else if (model.includes('base')) displayName = 'Base';
    else if (model.includes('tiny')) displayName = 'Tiny';
    else if (model) displayName = modelName;
    
    // Get speed hint
    let speed = '';
    if (model.includes('tiny')) speed = '~1s';
    else if (model.includes('base-q5_1')) speed = '~1-2s';
    else if (model.includes('base')) speed = '~2-3s';
    else if (model.includes('small')) speed = '~5-7s';
    else if (model.includes('medium')) speed = '~10-15s';
    else if (model.includes('large-v3-q5_0')) speed = '~6-10s';
    else if (model.includes('large-v3-turbo-q8_0')) speed = '~5-8s';
    else if (model.includes('large-v3-turbo-q5_0')) speed = '~4-7s';
    else if (model.includes('large-v3-turbo')) speed = '~8-12s';
    else if (model.includes('large-v3')) speed = '~15-25s';
    else if (model.includes('large')) speed = '~15-25s';
    
    return {
      name: displayName,
      icon: getModelIcon(model),
      color: getModelSizeColor(model),
      desc: speed ? `Est. ${speed}` : 'Select a model',
      model: model,
    };
  };
  const activeProfile = getActiveProfile();

  return (
    <div className="page home-page">
      {hasModel === false && (
        <div className="model-warning-banner">
          <span className="warning-icon">!</span>
          <div className="model-warning-text">
            <strong>Belum ada model AI!</strong>
            <p>Download model untuk mulai transcribe.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => window.electronAPI.showMain('models')}>
            Download Model
          </button>
        </div>
      )}
      
      {/* Profile Indicator */}
      <div className="profile-indicator">
        <div className="profile-badge" style={{ borderColor: activeProfile.color }}>
          <span className="profile-badge-icon" style={{ color: activeProfile.color }}>
            <Iconify icon={activeProfile.icon} size={20} />
          </span>
          <span className="profile-badge-text">
            <span className="profile-badge-name">{activeProfile.name}</span>
            <span className="profile-badge-speed">{activeProfile.desc}</span>
          </span>
        </div>
        <div className="profile-info">
          <span className="profile-name">Active Model</span>
          <span className="profile-desc">{activeProfile.model || 'Not selected'}</span>
        </div>
      </div>

      <div className="home-content">
        {/* Mic Button */}
        <div className={`mic-section ${state}`}>
          <button className={`mic-btn ${state}`} onClick={toggle} disabled={state === 'processing'}>
            {state === 'idle' || state === 'done' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            ) : state === 'recording' ? (
              <div className="stop-icon" />
            ) : (
              <div className="spinner" />
            )}
          </button>
          
          <div className="mic-status">
            {state === 'idle' && <span>Click to start recording</span>}
            {state === 'recording' && (
              <div className="rec-status">
                <div className="rec-dot" />
                <span>Recording</span>
                <span className="rec-time">{fmt(time)}</span>
              </div>
            )}
            {state === 'processing' && <span className="processing-text">{partial ? partial.substring(0, 50) + (partial.length > 50 ? '...' : '') : 'Processing audio...'}</span>}
            {state === 'done' && <span className="done-text">✓ Complete</span>}
          </div>
          
          {state === 'recording' && (
            <button className="cancel-btn" onClick={cancelRec} title="Cancel recording (Esc)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              <span>Cancel</span>
              <span className="cancel-key">Esc</span>
            </button>
          )}
        </div>

        {/* Professional Waveform Visualizer */}
        {state === 'recording' && (
          <>
            <div className="pro-viz">
              <div className="pro-viz-inner">
                {levels.map((l, i) => (
                  <div key={i} className="pro-viz-bar-wrap">
                    <div className="pro-viz-bar" style={{ height: `${Math.max(6, l * 0.95)}%` }} />
                    <div className="pro-viz-bar-mirror" style={{ height: `${Math.max(3, l * 0.4)}%` }} />
                  </div>
                ))}
              </div>
            </div>
            <div className={`mic-diag ${clipPeak >= 2 ? 'clip' : clipPeak >= 1 ? 'loud' : micLevel < 3 ? 'low' : 'ok'}`}>
              {clipPeak >= 2 ? 'Clipping - move mic away' : micLevel < 3 ? 'No input detected - check mic' : clipPeak >= 1 ? 'Loud - may distort' : 'Good level'}
              {vadEnabled && <span className="vad-badge">VAD</span>}
            </div>
          </>
        )}

        {/* Partial */}
        {partial && (state === 'recording' || state === 'processing') && (
          <div className="partial-box">
            <div className="partial-label">{state === 'processing' ? 'Transcribing...' : 'Listening...'}</div>
            <p>{partial}</p>
          </div>
        )}

        {/* Result */}
        {text && state !== 'recording' && (
          <div className="result-box">
            <p>{text}</p>
            
            {/* Diff View: raw vs final */}
            {rawText && rawText !== text && (
              <div className="diff-view">
                <div className="diff-header">Raw Whisper → Final</div>
                <div className="diff-pair">
                  <div className="diff-raw"><span className="diff-tag">RAW</span> {rawText}</div>
                  <div className="diff-final"><span className="diff-tag">FINAL</span> {text}</div>
                </div>
              </div>
            )}
            
            {/* Confidence Info */}
            {confidence && (
              <div className="confidence-info">
                <div className="confidence-header">
                  <span className="confidence-label">Confidence:</span>
                  <span className="confidence-value" style={{ color: getConfidenceColor(confidence.overall) }}>
                    {Math.round(confidence.overall * 100)}%
                  </span>
                  <span className={`confidence-badge ${confidence.quality}`}>
                    {confidence.quality}
                  </span>
                </div>
                {fuzzyChanges > 0 && (
                  <div className="fuzzy-info">
                    <span>{fuzzyChanges} words auto-corrected</span>
                  </div>
                )}
                {confidence.suggestions && confidence.suggestions.length > 0 && (
                  <div className="suggestions">
                    {confidence.suggestions.slice(0, 2).map((s: string, i: number) => (
                      <div key={i} className="suggestion-item">{s}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="result-actions">
              <button className="btn-action" onClick={async () => { await window.electronAPI.copyText(text); onSuccess('Copied!'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy
              </button>
              <button className="btn-action primary" onClick={async () => { await window.electronAPI.pasteText(text); setText(''); onSuccess('Pasted!'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                Paste
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div className="error-box">{error}</div>}

        {/* History Link */}
        <div className="history-link-section">
          <button className="btn-action history-link-btn" onClick={() => {
            const event = new CustomEvent('navigate-page', { detail: 'history' });
            window.dispatchEvent(event);
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            View History
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14, marginLeft: 2 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
