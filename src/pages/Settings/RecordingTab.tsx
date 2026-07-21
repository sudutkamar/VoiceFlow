/**
 * RecordingTab — Microphone and model settings.
 * Mic list is filtered to hide virtual/non-physical devices.
 * Includes real-time level meter and record+playback test.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Iconify } from '../../utils/icons';
import { filterRealMics, startMicMonitor, recordAndPlayback, testMicLevel } from '../../utils/micDetector';
import type { SettingsData } from './types';

interface Props {
  settings: SettingsData;
  save: (key: string, value: string) => Promise<void>;
  mics: MediaDeviceInfo[];
  availableModels: { name: string; downloaded?: boolean }[];
  loadMics: () => Promise<void>;
  onSuccess: (msg: string) => void;
}

// ═══════════════════════════════════════════════════════════════
//  Live Level Meter — real-time mic level visualization
// ═══════════════════════════════════════════════════════════════

function LiveLevelMeter({ rms, dB, peak }: { rms: number; dB: number; peak: number }) {
  // Normalize to 0-100 for display
  const pct = Math.min(100, Math.max(0, rms * 200));
  const peakPct = Math.min(100, Math.max(0, peak * 200));

  // Color based on level
  const color =
    peak > 0.8 ? '#ef4444' : // red — clipping
    rms > 0.3 ? '#f59e0b' : // amber — loud
    rms > 0.05 ? '#22c55e' : // green — good
    rms > 0.008 ? '#3b82f6' : // blue — low
    '#6b7280'; // gray — nothing

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      {/* Level bar */}
      <div style={{
        flex: 1, height: 8, background: 'rgba(255,255,255,0.1)',
        borderRadius: 4, overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color,
          borderRadius: 4,
          transition: 'width 0.05s linear, background 0.2s',
        }} />
        {/* Peak indicator */}
        <div style={{
          position: 'absolute', top: -2, left: `${peakPct}%`, width: 3, height: 12,
          background: peak > 0.8 ? '#ef4444' : '#fff',
          borderRadius: 2,
          transition: 'left 0.1s linear',
        }} />
      </div>
      {/* Numeric display */}
      <span style={{
        fontSize: 11, fontFamily: 'monospace', minWidth: 80, textAlign: 'right',
        color: rms > 0.008 ? color : '#6b7280',
      }}>
        {dB > -60 ? `${dB.toFixed(1)} dB` : '—'}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MicTestResult — static result after quick test
// ═══════════════════════════════════════════════════════════════

function MicTestResult({ level }: { level: number | null }) {
  if (level === null) {
    return <div className="setting-hint warning">✗ Mic test failed — device may be unavailable</div>;
  }
  if (level > 0.008) {
    return <div className="setting-hint success">✓ Mic OK (level: {(level * 1000).toFixed(1)})</div>;
  }
  return <div className="setting-hint warning">⚠ Low level ({(level * 1000).toFixed(1)}). Maybe not the right mic?</div>;
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function RecordingTab({ settings, save, mics, availableModels, loadMics, onSuccess }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState<string | null>(null); // deviceId being monitored live
  const [liverms, setLiverms] = useState(0);
  const [liveDB, setLiveDB] = useState(-100);
  const [livePeak, setLivePeak] = useState(0);
  const [playbackStatus, setPlaybackStatus] = useState<string | null>(null);
  const monitorRef = useRef<{ stop: () => void } | null>(null);
  const [micLevels, setMicLevels] = useState<Record<string, number | null>>({});
  const testingRef = useRef(false);

  // Filter mics
  const displayMics = showAll ? mics : filterRealMics(mics);
  const virtualCount = mics.length - filterRealMics(mics).length;

  // Quick-test selected mic on mount
  useEffect(() => {
    if (!settings.selected_mic || testingRef.current || micLevels[settings.selected_mic] !== undefined) return;
    testingRef.current = true;
    setTesting(settings.selected_mic);
    testMicLevel(settings.selected_mic, 800).then(level => {
      setMicLevels(prev => ({ ...prev, [settings.selected_mic]: level }));
      setTesting(null);
      testingRef.current = false;
    });
  }, [settings.selected_mic]);

  // Cleanup monitor on unmount
  useEffect(() => {
    return () => {
      if (monitorRef.current) monitorRef.current.stop();
    };
  }, []);

  // Start/stop live monitoring
  const toggleMonitor = useCallback(async (deviceId: string) => {
    if (monitorRef.current) {
      monitorRef.current.stop();
      monitorRef.current = null;
      setMonitoring(null);
      setLiverms(0);
      setLiveDB(-100);
      setLivePeak(0);
      return;
    }

    const handle = await startMicMonitor(deviceId, {
      onLevel: (rms, dB, peak) => {
        setLiverms(rms);
        setLiveDB(dB);
        setLivePeak(peak);
      },
      onError: (err) => {
        setPlaybackStatus(`Error: ${err}`);
        setMonitoring(null);
      },
    });
    monitorRef.current = handle;
    setMonitoring(deviceId);
  }, []);

  // Record + playback test
  const handleRecordPlayback = async (deviceId: string) => {
    if (playbackStatus === 'Recording...' || playbackStatus === 'Playing...') return;
    if (monitorRef.current) {
      monitorRef.current.stop();
      monitorRef.current = null;
      setMonitoring(null);
    }
    setPlaybackStatus('Recording...');
    const result = await recordAndPlayback(deviceId, 2000);
    if (!result.success) {
      setPlaybackStatus(`Failed: ${result.error}`);
      setTimeout(() => setPlaybackStatus(null), 3000);
      return;
    }
    setPlaybackStatus(`Playing back ${result.recordedMs}ms (RMS: ${(result.avgRms * 1000).toFixed(1)})...`);
    // Playback runs async; status clears when done (~2s)
    setTimeout(() => setPlaybackStatus(null), result.recordedMs + 500);
  };

  // Quick level test
  const handleQuickTest = async (deviceId: string) => {
    if (testing) return;
    setTesting(deviceId);
    const level = await testMicLevel(deviceId, 1000);
    setMicLevels(prev => ({ ...prev, [deviceId]: level }));
    setTesting(null);
  };

  return (
    <div className="settings-sections">
      {/* Microphone */}
      <div className="section">
        <div className="section-header">Microphone</div>
        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {/* Dropdown + action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={settings.selected_mic || ''}
              onChange={(e) => {
                const val = e.target.value;
                save('selected_mic', val);
                setMicLevels({});
                if (monitorRef.current) {
                  monitorRef.current.stop();
                  monitorRef.current = null;
                  setMonitoring(null);
                }
                if (val) handleQuickTest(val);
                onSuccess('Mic changed');
              }}
              style={{ flex: 1, minWidth: 180 }}
            >
              <option value="">System Default</option>
              {displayMics.map(m => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || `Mic ${m.deviceId.slice(0, 8)}...`}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-icon" onClick={loadMics} title="Refresh devices">
              <Iconify icon="refresh" />
            </button>
          </div>

          {/* Action buttons row */}
          {settings.selected_mic && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                className={`btn btn-sm ${monitoring === settings.selected_mic ? 'btn-active' : ''}`}
                onClick={() => toggleMonitor(settings.selected_mic)}
                title="Show real-time mic level"
              >
                {monitoring === settings.selected_mic ? 'Stop Monitor' : 'Monitor'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => handleRecordPlayback(settings.selected_mic)}
                disabled={playbackStatus !== null}
                title="Record 2 seconds and play it back"
              >
                {playbackStatus === 'Recording...' ? 'Recording...' : 'Record & Play'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => handleQuickTest(settings.selected_mic)}
                disabled={testing === settings.selected_mic}
                title="Quick level test (1s)"
              >
                {testing === settings.selected_mic ? 'Testing...' : 'Quick Test'}
              </button>
            </div>
          )}

          {/* Live level meter (when monitoring) */}
          {monitoring === settings.selected_mic && (
            <LiveLevelMeter rms={liverms} dB={liveDB} peak={livePeak} />
          )}

          {/* Quick test result */}
          {settings.selected_mic && !monitoring && micLevels[settings.selected_mic] !== undefined && (
            <MicTestResult level={micLevels[settings.selected_mic]} />
          )}

          {/* Record & Playback status */}
          {playbackStatus && (
            <div className={`setting-hint ${playbackStatus.startsWith('Playing') ? '' : 'warning'}`}>
              {playbackStatus}
            </div>
          )}

          {/* Show virtual toggle */}
          {virtualCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <label style={{ fontSize: 12, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={() => setShowAll(!showAll)}
                />
                Show {virtualCount} virtual / system devices
              </label>
            </div>
          )}

          <span className="setting-hint">
            {showAll
              ? 'Showing all devices. Use Monitor to see which one captures your voice.'
              : 'Virtual devices hidden. Check "Show virtual" to see all.'}
          </span>
        </div>
      </div>

      {/* Voice Activity Detection — Sensitivity */}
      <div className="section">
        <div className="section-header">Voice Activity Detection</div>
        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div className="setting-info">
            <span className="setting-name">Recording Sensitivity</span>
            <span className="setting-hint">How sensitive the mic is to detect speech. Higher = detects quiet speech but may pick up background noise.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={settings.vad_sensitivity || 'medium'}
              onChange={(e) => save('vad_sensitivity', e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="low">🔇 Low — Quiet rooms, fewer false triggers</option>
              <option value="medium">🎤 Medium — Balanced (default)</option>
              <option value="high">🔊 High — Noisy rooms, catches soft speech</option>
            </select>
          </div>
          <span className="setting-hint">
            {settings.vad_sensitivity === 'low' ? 'Best for quiet environments. Less likely to false-trigger on background noise.' :
             settings.vad_sensitivity === 'high' ? 'Best for noisy environments or soft speakers. May have more false starts.' :
             'Balanced setting suitable for most environments.'}
          </span>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Pause Timeout</span>
            <span className="setting-hint">How long of a pause before auto-stops recording</span>
          </div>
          <select
            value={settings.vad_silence_ms || '3000'}
            onChange={(e) => save('vad_silence_ms', e.target.value)}
          >
            <option value="1500">1.5s — Very short pauses</option>
            <option value="2000">2s — Short pauses</option>
            <option value="3000">3s — Normal (default)</option>
            <option value="4000">4s — Long pauses</option>
            <option value="5000">5s — Very long pauses</option>
            <option value="7000">7s — Max patience</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Voice Activity Detection</span>
            <span className="setting-hint">Auto-stop recording during silence vs manual stop</span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.vad_enabled !== 'false'}
              onChange={(e) => save('vad_enabled', e.target.checked ? 'true' : 'false')}
            />
            <span className="toggle-slider" />
          </label>
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
