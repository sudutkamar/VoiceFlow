import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WavRecorder } from '../utils/wavRecorder';
import { Iconify, getModelIcon, getModelSizeColor } from '../utils/icons';
import { logError } from '../utils/errorHandler';

interface BenchResult {
  model: string;
  status: 'pending' | 'running' | 'done' | 'error';
  text?: string;
  elapsedMs?: number;
  error?: string;
}

const ALL_MODELS = [
  'ggml-tiny.bin',
  'ggml-base.bin',
  'ggml-base-q5_1.bin',
  'ggml-small.bin',
  'ggml-medium.bin',
  'ggml-large-v3-turbo-q5_0.bin',
  'ggml-large-v3-turbo-q8_0.bin',
  'ggml-large-v3-turbo.bin',
  'ggml-large-v3-q5_0.bin',
  'ggml-large-v3.bin',
];

const MODEL_LABELS: Record<string, string> = {
  'ggml-tiny.bin': 'Tiny',
  'ggml-base.bin': 'Base',
  'ggml-base-q5_1.bin': 'Base Q5',
  'ggml-small.bin': 'Small',
  'ggml-medium.bin': 'Medium',
  'ggml-large-v3-turbo-q5_0.bin': 'Large v3 Turbo Q5',
  'ggml-large-v3-turbo-q8_0.bin': 'Large v3 Turbo Q8',
  'ggml-large-v3-turbo.bin': 'Large v3 Turbo',
  'ggml-large-v3-q5_0.bin': 'Large v3 Q5',
  'ggml-large-v3.bin': 'Large v3',
};

export default function Benchmark() {
  const [recording, setRecording] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [selectedModels, setSelectedModels] = useState<string[]>(['ggml-tiny.bin', 'ggml-base.bin', 'ggml-small.bin']);
  const [results, setResults] = useState<BenchResult[]>([]);
  const [running, setRunning] = useState(false);
  const recorderRef = useRef<WavRecorder | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Determine current step
  const currentStep = !audioBuffer ? 1 : !running && results.length === 0 ? 2 : 3;
  const step1Complete = !!audioBuffer;
  const step2Complete = selectedModels.length > 0;

  useEffect(() => {
    const unsub = window.electronAPI.onBenchmarkProgress?.((data) => {
      setResults(prev => prev.map(r => r.model === data.model ? { ...r, status: data.status as any, text: data.text, elapsedMs: data.elapsedMs, error: data.error } : r));
    });
    return () => unsub?.();
  }, []);

  const toggleModel = (m: string) => {
    setSelectedModels(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const recordSample = useCallback(async () => {
    try {
      const recorder = new WavRecorder({ sampleRate: 16000, channels: 1 });
      recorderRef.current = recorder;
      await recorder.start();
      setRecording(true);
      setCountdown(5);

      for (let i = 5; i > 0; i--) {
        setCountdown(i);
        await new Promise(r => setTimeout(r, 1000));
      }

      const { buffer, duration: dur } = await recorder.stop();
      recorderRef.current = null;
      setRecording(false);
      setAudioBuffer(Array.from(new Uint8Array(buffer)));
      setDuration(dur);
      setCountdown(0);
    } catch (err: any) {
      setRecording(false);
      setCountdown(0);
      alert('Mic error: ' + (err.message || 'Unknown'));
    }
  }, []);

  const runBenchmark = async () => {
    if (!audioBuffer || selectedModels.length === 0) return;
    setRunning(true);
    setResults(selectedModels.map(m => ({ model: m, status: 'pending' })));
    try {
      await window.electronAPI.runBenchmark(audioBuffer, selectedModels);
    } catch (err: any) {
      logError('Benchmark', err);
    }
    setRunning(false);
  };

  const resetAll = () => {
    setAudioBuffer(null);
    setResults([]);
    setRunning(false);
    setDuration(0);
  };

  const fastest = results.filter(r => r.status === 'done' && r.elapsedMs).sort((a, b) => (a.elapsedMs || Infinity) - (b.elapsedMs || Infinity))[0];
  const slowest = results.filter(r => r.status === 'done' && r.elapsedMs).sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0))[0];
  const completedCount = results.filter(r => r.status === 'done').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="page benchmark-page">
      <div className="page-header">
        <h1>Model Benchmark</h1>
        <p className="page-subtitle">Compare transcription speed and accuracy across Whisper models</p>
      </div>

      {/* Steps Indicator */}
      <div className="bench-steps">
        <div className={`bench-step-item ${currentStep === 1 ? 'active' : step1Complete ? 'complete' : ''}`}>
          <div className="bench-step-dot">
            {step1Complete ? <Iconify icon="check" size={14} /> : '1'}
          </div>
          <span className="bench-step-label"><Iconify icon="mic" size={14} /> Record Sample</span>
        </div>
        <div className={`bench-step-line ${step1Complete ? 'complete' : ''}`} />
        <div className={`bench-step-item ${currentStep === 2 ? 'active' : step2Complete && step1Complete ? 'complete' : ''}`}>
          <div className="bench-step-dot">
            {step2Complete && step1Complete ? <Iconify icon="check" size={14} /> : '2'}
          </div>
          <span className="bench-step-label"><Iconify icon="models" size={14} /> Select Models</span>
        </div>
        <div className={`bench-step-line ${results.length > 0 ? 'complete' : ''}`} />
        <div className={`bench-step-item ${currentStep === 3 ? 'active' : results.length > 0 && !running ? 'complete' : ''}`}>
          <div className="bench-step-dot">
            {results.length > 0 && !running ? <Iconify icon="check" size={14} /> : '3'}
          </div>
          <span className="bench-step-label"><Iconify icon="benchmark" size={14} /> Run & Compare</span>
        </div>
      </div>

      {/* Step 1: Record */}
      <div className={`bench-section ${currentStep === 1 ? 'active' : ''}`}>
        <div className="bench-section-header">
          <div className="bench-section-num">1</div>
          <span className="bench-section-title">Record Audio Sample</span>
        </div>
        <p className="bench-section-desc">
          Record a 5-second audio sample to test across all selected models. Speak clearly for best results.
        </p>

        <div className={`bench-record-area ${recording ? 'recording' : audioBuffer ? 'ready' : ''}`}>
          {!recording && !audioBuffer && (
            <>
              <button className="bench-record-btn" onClick={recordSample} title="Start recording">
                <Iconify icon="mic" size={48} />
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Click to start recording (5 seconds)</span>
            </>
          )}

          {recording && (
            <div className="bench-countdown">
              <div className="bench-countdown-ring">
                <span className="bench-countdown-num">{countdown}</span>
              </div>
              <div className="bench-countdown-label">
                <span className="bench-countdown-dot" />
                Recording... Speak now
              </div>
            </div>
          )}

          {audioBuffer && !recording && (
            <div className="bench-sample-ready">
              <div className="bench-sample-check">✓</div>
              <div className="bench-sample-info">
                <span className="duration">Sample recorded ({(duration / 1000).toFixed(1)}s)</span>
                <span className="label">Ready for benchmark</span>
              </div>
              <button className="btn btn-sm" onClick={resetAll}>
                ↺ Re-record
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Select Models */}
      <div className={`bench-section ${currentStep === 2 ? 'active' : ''}`}>
        <div className="bench-section-header">
          <div className="bench-section-num">2</div>
          <span className="bench-section-title">Select Models</span>
        </div>
        <p className="bench-section-desc">
          Choose which Whisper models to compare. Smaller models are faster but less accurate.
        </p>

        <div className="bench-models">
          {ALL_MODELS.map(m => (
            <button
              key={m}
              className={`bench-model-btn ${selectedModels.includes(m) ? 'selected' : ''}`}
              onClick={() => toggleModel(m)}
            >
              <span className="bench-model-icon" style={{ color: getModelSizeColor(m) }}>
                <Iconify icon={getModelIcon(m) as any} size={16} />
              </span>
              <span className="bench-model-check">
                {selectedModels.includes(m) && <Iconify icon="check" size={12} />}
              </span>
              <span>{MODEL_LABELS[m] || m}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: Run */}
      <div className={`bench-section ${currentStep === 3 ? 'active' : ''}`}>
        <div className="bench-section-header">
          <div className="bench-section-num">3</div>
          <span className="bench-section-title">Run Benchmark</span>
        </div>

        <div className="bench-run-area">
          <div className="bench-run-info">
            {audioBuffer && selectedModels.length > 0 ? (
              <>
                <div>Testing <strong>{selectedModels.length} model{selectedModels.length > 1 ? 's' : ''}</strong> with {(duration / 1000).toFixed(1)}s audio sample</div>
                {results.length > 0 && !running && (
                  <div style={{ marginTop: '4px', color: completedCount === selectedModels.length ? 'var(--success)' : 'var(--text-dim)' }}>
                    {completedCount}/{selectedModels.length} completed{errorCount > 0 && `, ${errorCount} failed`}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                {!audioBuffer ? 'Record an audio sample first' : 'Select at least one model'}
              </div>
            )}
          </div>

          <button
            className="bench-run-btn"
            onClick={runBenchmark}
            disabled={!audioBuffer || selectedModels.length === 0 || running}
          >
            {running ? (
              <>
                <span className="run-spinner" />
                Running...
              </>
            ) : (
              <>
                <Iconify icon="benchmark" size={18} /> Run Benchmark
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bench-section">
          <div className="bench-section-header">
            <div className="bench-section-num" style={{ background: 'rgba(74, 222, 128, 0.12)', color: 'var(--success)' }}>R</div>
            <span className="bench-section-title">Results</span>
            {fastest && slowest && fastest.model !== slowest.model && (
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-dim)' }}>
                {((slowest.elapsedMs || 0) / (fastest.elapsedMs || 1)).toFixed(1)}x speed difference
              </span>
            )}
          </div>

          <div className="bench-results">
            {results.map(r => (
              <div key={r.model} className={`bench-result-card ${r.status} ${fastest?.model === r.model ? 'fastest' : ''}`}>
                <div className="bench-result-header">
                  <span className="bench-model-name" style={{ color: getModelSizeColor(r.model) }}>
                    <Iconify icon={getModelIcon(r.model) as any} size={16} /> {MODEL_LABELS[r.model] || r.model}
                  </span>
                  {fastest?.model === r.model && r.status === 'done' && <span className="bench-fastest-badge"><Iconify icon="spark" size={12} /> FASTEST</span>}
                  {r.status === 'pending' && <span className="bench-pending-icon" />}
                  {r.status === 'running' && <span className="bench-spinner" />}
                  {r.status === 'done' && <span className="bench-time"><Iconify icon="benchmark" size={14} /> {((r.elapsedMs || 0) / 1000).toFixed(2)}s</span>}
                  {r.status === 'error' && <span className="bench-error"><Iconify icon="error" size={14} /> {r.error || 'Failed'}</span>}
                </div>
                {r.status === 'running' && (
                  <div className="bench-result-progress">
                    <div className="bench-progress-bar">
                      <div className="bench-progress-fill" />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Processing...</span>
                  </div>
                )}
                {r.text && <div className="bench-text">{r.text}</div>}
              </div>
            ))}
          </div>

          {/* Summary */}
          {!running && completedCount > 0 && (
            <div style={{ marginTop: '16px', padding: '14px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px' }}>Summary</div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Models tested</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent)' }}>{completedCount}</div>
                </div>
                {fastest && (
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}><Iconify icon="spark" size={12} /> Fastest</span>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--success)' }}>
                      <Iconify icon={getModelIcon(fastest.model) as any} size={16} /> {((fastest.elapsedMs || 0) / 1000).toFixed(2)}s
                    </div>
                  </div>
                )}
                {slowest && slowest.model !== fastest?.model && (
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}><Iconify icon="warning" size={12} /> Slowest</span>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--error)' }}>
                      <Iconify icon={getModelIcon(slowest.model) as any} size={16} /> {((slowest.elapsedMs || 0) / 1000).toFixed(2)}s
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state when no results */}
      {results.length === 0 && !running && (
        <div className="bench-empty">
          <div className="bench-empty-icon"><Iconify icon="benchmark" size={48} /></div>
          <h3>No Results Yet</h3>
          <p>Record a sample, select models, and run the benchmark to see comparison results here.</p>
        </div>
      )}
    </div>
  );
}
