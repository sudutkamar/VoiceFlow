import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WavRecorder } from '../utils/wavRecorder';

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
  'ggml-small.bin',
  'ggml-medium.bin',
  'ggml-large-v3-turbo.bin',
  'ggml-large-v3.bin',
];

const MODEL_LABELS: Record<string, string> = {
  'ggml-tiny.bin': '⚡ Tiny',
  'ggml-base.bin': '⚖️ Base',
  'ggml-small.bin': '🎯 Small',
  'ggml-medium.bin': '💎 Medium',
  'ggml-large-v3-turbo.bin': '🏆 Large v3 Turbo',
  'ggml-large-v3.bin': '👑 Large v3',
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

      // 5-second countdown
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
      console.error('Benchmark error:', err);
    }
    setRunning(false);
  };

  const fastest = results.filter(r => r.status === 'done' && r.elapsedMs).sort((a, b) => (a.elapsedMs || Infinity) - (b.elapsedMs || Infinity))[0];

  return (
    <div className="page benchmark-page">
      <div className="page-header">
        <h1>Model Benchmark</h1>
        <p className="page-subtitle">Compare transcription speed and accuracy across models</p>
      </div>

      {/* Step 1: Record */}
      <div className="section">
        <div className="section-header">Step 1: Record a 5-second sample</div>
        <div className="bench-record">
          {!recording && !audioBuffer && (
            <button className="btn btn-primary" onClick={recordSample}>
              🎙️ Record Sample
            </button>
          )}
          {recording && (
            <div className="bench-countdown">
              <div className="countdown-num">{countdown}</div>
              <span>Recording...</span>
            </div>
          )}
          {audioBuffer && !recording && (
            <div className="bench-sample-ready">
              ✅ Sample recorded ({(duration / 1000).toFixed(1)}s)
              <button className="btn btn-sm" onClick={() => { setAudioBuffer(null); setResults([]); }}>Re-record</button>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Select models */}
      <div className="section">
        <div className="section-header">Step 2: Select models to compare</div>
        <div className="bench-models">
          {ALL_MODELS.map(m => (
            <button
              key={m}
              className={`bench-model-btn ${selectedModels.includes(m) ? 'selected' : ''}`}
              onClick={() => toggleModel(m)}
            >
              {MODEL_LABELS[m] || m}
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: Run */}
      <div className="section">
        <div className="section-header">Step 3: Run benchmark</div>
        <button
          className="btn btn-primary"
          onClick={runBenchmark}
          disabled={!audioBuffer || selectedModels.length === 0 || running}
        >
          {running ? '⏳ Running...' : '🚀 Run Benchmark'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="section">
          <div className="section-header">Results</div>
          <div className="bench-results">
            {results.map(r => (
              <div key={r.model} className={`bench-result-card ${r.status} ${fastest?.model === r.model ? 'fastest' : ''}`}>
                <div className="bench-result-header">
                  <span className="bench-model-name">{MODEL_LABELS[r.model] || r.model}</span>
                  {fastest?.model === r.model && <span className="bench-fastest-badge">FASTEST</span>}
                  {r.status === 'running' && <span className="bench-spinner" />}
                  {r.status === 'done' && <span className="bench-time">{((r.elapsedMs || 0) / 1000).toFixed(1)}s</span>}
                  {r.status === 'error' && <span className="bench-error">❌ {r.error}</span>}
                </div>
                {r.text && <div className="bench-text">{r.text}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
