/**
 * GeneralTab — Appearance, quick settings, hotkeys, system settings.
 */
import React, { useState, useCallback } from 'react';
import { Iconify } from '../../utils/icons';
import appLogo from '../../assets/logo.png';
import { LANGUAGES } from '../../utils/languages';
import { logError, logWarning } from '../../utils/errorHandler';
import type { SettingsData, GpuStatus, CudaDownloadState } from './types';

interface Props {
  settings: SettingsData;
  save: (key: string, value: string) => Promise<void>;
  toggle: (key: string) => void;
  gpuStatus: GpuStatus | null;
  setGpuStatus: (status: GpuStatus | null) => void;
  cudaDownload: CudaDownloadState | null;
  setCudaDownload: (state: CudaDownloadState | null) => void;
  cudaPollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onDeleteEngine: (type: 'cpu' | 'gpu') => void;
}

interface GpuScanResult {
  present: string[];
  missing: string[];
  total: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatHotkey(hotkey: string): string {
  return hotkey
    .replace('Control', 'Ctrl')
    .replace('Shift', 'Shift')
    .replace('Alt', 'Alt')
    .replace('Meta', 'Win');
}

export function GeneralTab({
  settings, save, toggle,
  gpuStatus, setGpuStatus,
  cudaDownload, setCudaDownload,
  cudaPollRef, onSuccess, onError, onDeleteEngine,
}: Props) {
  const [editingHotkey, setEditingHotkey] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [gpuPath, setGpuPath] = useState('');
  const [gpuScan, setGpuScan] = useState<GpuScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  // Load GPU path on mount
  React.useEffect(() => {
    window.electronAPI.getVersion?.().then((v: string) => setAppVersion(v || '1.0.0')).catch(() => setAppVersion('1.0.0'));
    window.electronAPI.getGpuPath?.().then((p: string) => setGpuPath(p || '')).catch((err) => logWarning('GeneralTab', 'Failed to get GPU path', err));
  }, []);

  const handleHotkey = useCallback(async (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Control');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');
    if (e.metaKey) keys.push('Meta');
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      keys.push(e.key === ' ' ? 'Space' : e.key);
    }
    if (keys.length >= 2) {
      const combo = keys.join('+');
      await save('hotkey', combo);
      setEditingHotkey(false);
      await window.electronAPI.updateHotkey?.(combo);
      onSuccess(`Hotkey changed: ${formatHotkey(combo)}`);
    }
  }, [save, onSuccess]);

  const handleCudaDownload = async () => {
    try {
      await window.electronAPI.downloadCuda();
      onSuccess('CUDA download started');
    } catch (err: any) {
      onError(err.message || 'Failed to start CUDA download');
    }
  };

  const handleCudaPause = async () => {
    try {
      await window.electronAPI.pauseCudaDownload();
    } catch (err) {
      logError('GeneralTab', err);
    }
  };

  const handleCudaResume = async () => {
    try {
      await window.electronAPI.resumeCudaDownload();
    } catch (err) {
      logError('GeneralTab', err);
    }
  };

  const handleCudaCancel = async () => {
    try {
      await window.electronAPI.cancelCudaDownload();
      setCudaDownload(null);
    } catch (err) {
      logError('GeneralTab', err);
    }
  };

  // GPU folder management
  const handleChooseGpuFolder = async () => {
    try {
      const result = await window.electronAPI.chooseGpuFolder();
      if (result.success && result.path) {
        setGpuPath(result.path);
        onSuccess(`GPU folder: ${result.path}`);
      }
    } catch (err: any) {
      onError(err.message || 'Gagal memilih folder');
    }
  };

  const handleScanGpuFolder = async () => {
    if (scanning) return;
    try {
      setScanning(true);
      const result = await window.electronAPI.scanGpuFolder();
      setGpuScan(result);
      if (result.missing.length === 0 && result.present.length > 0) {
        onSuccess(`GPU OK — ${result.present.length}/${result.total} DLL tersedia`);
      } else if (result.present.length > 0) {
        onSuccess(`${result.present.length}/${result.total} DLL ditemukan, ${result.missing.length} hilang`);
      }
    } catch (err: any) {
      onError(err.message || 'Gagal scan folder');
    } finally {
      setScanning(false);
    }
  };

  const handleResetGpuPath = async () => {
    try {
      const result = await window.electronAPI.resetGpuPath();
      if (result.success && result.path) {
        setGpuPath(result.path);
        setGpuScan(null);
        onSuccess('GPU path direset ke default');
      }
    } catch (err: any) {
      onError(err.message || 'Gagal reset path');
    }
  };

  return (
    <div className="settings-sections">
      {/* Appearance */}
      <div className="section">
        <div className="section-header">Appearance</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Theme</span>
            <span className="setting-hint">Switch between dark and light appearance</span>
          </div>
          <div className="theme-switcher">
            <button
              className={`theme-btn ${settings.theme !== 'light' ? 'active' : ''}`}
              onClick={async () => { await save('theme', 'dark'); document.documentElement.classList.remove('light-theme'); }}
              title="Dark Theme"
            >
              <Iconify icon="theme" size={14} /> Dark
            </button>
            <button
              className={`theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
              onClick={async () => { await save('theme', 'light'); document.documentElement.classList.add('light-theme'); }}
              title="Light Theme"
            >
              <Iconify icon="theme" size={14} /> Light
            </button>
          </div>
        </div>
      </div>

      {/* Quick Settings */}
      <div className="section">
        <div className="section-header">Quick Settings</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Auto Paste</span>
            <span className="setting-hint">Auto paste text to active app</span>
          </div>
          <div className={`toggle ${settings.auto_paste !== 'false' ? 'on' : ''}`} onClick={() => toggle('auto_paste')} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Sound Feedback</span>
            <span className="setting-hint">Play sound on record start/stop</span>
          </div>
          <div className={`toggle ${settings.sound_effects !== 'false' ? 'on' : ''}`} onClick={() => toggle('sound_effects')} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Start on Boot</span>
            <span className="setting-hint">Launch on Windows startup</span>
          </div>
          <div
            className={`toggle ${settings.auto_start === 'true' ? 'on' : ''}`}
            onClick={async () => {
              const v = settings.auto_start !== 'true';
              await save('auto_start', v.toString());
              await window.electronAPI.setAutoStart(v);
              onSuccess(v ? 'Enabled' : 'Disabled');
            }}
          />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Floating UI</span>
            <span className="setting-hint">Show compact floating bar while dictating. Turn off for silent background paste.</span>
          </div>
          <div
            className={`toggle ${settings.show_mini_window !== 'false' ? 'on' : ''}`}
            onClick={async () => {
              const next = settings.show_mini_window === 'false' ? 'true' : 'false';
              await save('show_mini_window', next);
              if (next === 'false') {
                await window.electronAPI.hideMiniWindow?.();
              } else {
                await window.electronAPI.showMiniWindow?.();
              }
              onSuccess(next === 'false' ? 'Floating UI disabled' : 'Floating UI enabled');
            }}
          />
        </div>
        {settings.show_mini_window !== 'false' && (
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">Floating UI Layout</span>
              <span className="setting-hint">Horizontal (default) or Vertical orientation</span>
            </div>
            <div className="orientation-switcher">
              <button
                className={`orientation-btn ${settings.mini_bar_orientation !== 'vertical' ? 'active' : ''}`}
                onClick={async () => {
                  await save('mini_bar_orientation', 'horizontal');
                  await save('mini_window_width', '460');
                  await save('mini_window_height', '52');
                  await window.electronAPI.hideMiniWindow?.();
                  await new Promise(r => setTimeout(r, 200));
                  await window.electronAPI.resizeMiniWindow?.(52, 460);
                  await new Promise(r => setTimeout(r, 100));
                  await window.electronAPI.showMiniWindow?.();
                  onSuccess('Layout: Horizontal');
                }}
                title="Horizontal Layout"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="5" width="16" height="8" rx="2" />
                  <line x1="5" y1="9" x2="13" y2="9" />
                </svg>
                <span>Horizontal</span>
              </button>
              <button
                className={`orientation-btn ${settings.mini_bar_orientation === 'vertical' ? 'active' : ''}`}
                onClick={async () => {
                  await save('mini_bar_orientation', 'vertical');
                  await save('mini_window_width', '64');
                  await save('mini_window_height', '220');
                  await window.electronAPI.hideMiniWindow?.();
                  await new Promise(r => setTimeout(r, 200));
                  await window.electronAPI.resizeMiniWindow?.(220, 64);
                  await new Promise(r => setTimeout(r, 100));
                  await window.electronAPI.showMiniWindow?.();
                  onSuccess('Layout: Vertical');
                }}
                title="Vertical Layout"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="1" width="8" height="16" rx="2" />
                  <line x1="9" y1="5" x2="9" y2="13" />
                </svg>
                <span>Vertical</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hotkey */}
      <div className="section">
        <div className="section-header">Hotkey</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Push to Talk</span>
            <span className="setting-hint">Hold hotkey to record, release to stop</span>
          </div>
          <div className={`toggle ${settings.push_to_talk !== 'false' ? 'on' : ''}`} onClick={() => toggle('push_to_talk')} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Recording Hotkey</span>
            <span className="setting-hint">Press key combination to change</span>
          </div>
          {editingHotkey ? (
            <div className="hotkey-input" tabIndex={0} onKeyDown={handleHotkey} onBlur={() => setEditingHotkey(false)} autoFocus>
              Press keys...
            </div>
          ) : (
            <button className="hotkey-btn" onClick={() => setEditingHotkey(true)}>
              {formatHotkey(settings.hotkey || 'Ctrl+Shift+F9')}
              <span className="hotkey-edit">Edit</span>
            </button>
          )}
        </div>
      </div>

      {/* System */}
      <div className="section">
        <div className="section-header">System</div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Acceleration</span>
            <span className="setting-hint">
              {gpuStatus?.hasGpu
                ? gpuStatus?.cudaDllsPresent
                  ? 'GPU detected (CUDA). Choose processing device.'
                  : 'GPU detected. Download CUDA for GPU acceleration.'
                : 'No GPU detected. CPU only.'}
            </span>
          </div>
          <div className="setting-control" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
            {gpuStatus?.hasGpu ? (
              <select
                value={settings.whisper_device || 'auto'}
                onChange={(e) => {
                  save('whisper_device', e.target.value);
                  const labels: Record<string, string> = { auto: 'Auto (GPU)', gpu: 'Force GPU', cpu: 'Force CPU' };
                  onSuccess(`Device: ${labels[e.target.value] || e.target.value}`);
                }}
              >
                {gpuStatus?.cudaDllsPresent && <option value="auto">Auto (GPU)</option>}
                {gpuStatus?.cudaDllsPresent && <option value="gpu">Force GPU</option>}
                <option value="cpu">Force CPU</option>
              </select>
            ) : (
              <div className="gpu-badge gpu-badge-cpu">
                <span className="gpu-badge-icon">C</span>
                <span className="gpu-badge-text">CPU Only</span>
              </div>
            )}
            {gpuStatus?.hasGpu && gpuStatus?.needsDownload && (
              <div className="cuda-download-section">
                {cudaDownload && cudaDownload.state !== 'idle' ? (
                  <div className="cuda-download-progress">
                    <div className="cuda-progress-header">
                      <span className="cuda-progress-label">
                        {cudaDownload.state === 'downloading' && 'Downloading CUDA...'}
                        {cudaDownload.state === 'paused' && 'Paused'}
                        {cudaDownload.state === 'extracting' && 'Extracting...'}
                        {cudaDownload.state === 'completed' && 'Done!'}
                        {cudaDownload.state === 'error' && 'Download Error'}
                      </span>
                      <span className="cuda-progress-percent">{cudaDownload.progress}%</span>
                    </div>
                    <div className="cuda-progress-bar-wrap">
                      <div
                        className={`cuda-progress-bar ${cudaDownload.state === 'extracting' ? 'indeterminate' : ''}`}
                        style={{ width: cudaDownload.state === 'extracting' ? '100%' : `${cudaDownload.progress}%` }}
                      />
                    </div>
                    {cudaDownload.state === 'downloading' && (
                      <div className="cuda-progress-details">
                        <span>{formatBytes(cudaDownload.downloadedBytes)} / {formatBytes(cudaDownload.totalBytes)}</span>
                        <div className="cuda-progress-actions">
                          <button className="btn btn-sm" onClick={handleCudaPause}>Pause</button>
                          <button className="btn btn-sm btn-danger" onClick={handleCudaCancel}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {cudaDownload.state === 'paused' && (
                      <div className="cuda-progress-details">
                        <span>{formatBytes(cudaDownload.downloadedBytes)} / {formatBytes(cudaDownload.totalBytes)}</span>
                        <div className="cuda-progress-actions">
                          <button className="btn btn-sm btn-primary" onClick={handleCudaResume}>Continue</button>
                          <button className="btn btn-sm btn-danger" onClick={handleCudaCancel}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {cudaDownload.state === 'error' && (
                      <div className="cuda-progress-details">
                        <div className="cuda-progress-actions">
                          <button className="btn btn-sm btn-primary" onClick={handleCudaDownload}>Retry</button>
                          <button className="btn btn-sm btn-danger" onClick={handleCudaCancel}>Dismiss</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={handleCudaDownload}>
                    <Iconify icon="download" size={14} /> Download CUDA
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {/* CPU Engine Path */}
        {gpuStatus?.cpuDir && (
          <div className="setting-row">
            <div className="setting-info" style={{ flex: 1 }}>
              <div className="engine-path-display">
                <span className="engine-path-icon">
                  <Iconify icon="cpu" size={14} style={{ color: 'var(--accent)' }} />
                </span>
                <span className="engine-path-label">CPU</span>
                <span className="engine-path-sep" />
                <span className="engine-path-text" title={gpuStatus.cpuDir}>{gpuStatus.cpuDir}</span>
                <span className="engine-path-badge badge-ok">✓</span>
              </div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => onDeleteEngine('cpu')}>
              <Iconify icon="delete" size={14} />
            </button>
          </div>
        )}

        {/* GPU/CUDA Path */}
        {gpuStatus?.gpuDir && (
          <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="setting-name">
                <Iconify icon="gpu" size={13} style={{ marginRight: '4px', color: gpuStatus.cudaDllsPresent ? 'var(--success)' : 'var(--text-muted)', verticalAlign: 'middle' }} />
                CUDA / GPU
                {gpuStatus.cudaDllsPresent ? (
                  <span className="engine-path-badge badge-ok" style={{ marginLeft: '6px' }}>✓ Installed</span>
                ) : (
                  <span className="engine-path-badge badge-warn" style={{ marginLeft: '6px' }}>Not Downloaded</span>
                )}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleChooseGpuFolder}>
                  <Iconify icon="folder" size={13} /> Pilih
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleScanGpuFolder} disabled={scanning}>
                  {scanning ? <><span className="btn-spinner" /> Scanning...</> : <><Iconify icon="scan" size={13} /> Scan</>}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleResetGpuPath}>
                  <Iconify icon="refresh" size={13} /> Reset
                </button>
                {gpuStatus.cudaDllsPresent && (
                  <button className="btn btn-danger btn-sm" onClick={() => onDeleteEngine('gpu')}>
                    <Iconify icon="delete" size={13} /> Hapus
                  </button>
                )}
              </div>
            </div>
            <div className="engine-path-display">
              <span className="engine-path-icon">
                <Iconify icon="folder" size={14} style={{ color: gpuStatus.cudaDllsPresent ? 'var(--success)' : 'var(--text-muted)' }} />
              </span>
              <span className="engine-path-text" title={gpuPath || gpuStatus.gpuDir} style={{ color: 'var(--text)' }}>
                {gpuPath || gpuStatus.gpuDir || '—'}
              </span>
              {!gpuStatus.cudaDllsPresent && (
                <span className="engine-path-badge badge-warn">Missing</span>
              )}
            </div>
            {/* Scan results */}
            {gpuScan && (
              <div style={{
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap',
                fontSize: '10px',
              }}>
                {gpuScan.present.map(dll => (
                  <span key={dll} className="engine-path-badge badge-ok">{dll}</span>
                ))}
                {gpuScan.missing.map(dll => (
                  <span key={dll} className="engine-path-badge badge-warn">{dll}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Language</span>
            <span className="setting-hint">Transcription language</span>
          </div>
          <select value={settings.language || 'auto'} onChange={(e) => save('language', e.target.value)}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Save History</span>
            <span className="setting-hint">Save transcription history locally</span>
          </div>
          <div className={`toggle ${settings.save_history !== 'false' ? 'on' : ''}`} onClick={() => toggle('save_history')} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Clear Cache</span>
            <span className="setting-hint">Remove GPU cache & temp files to fix errors</span>
          </div>
          <button
            className="btn btn-sm"
            onClick={async () => {
              try {
                const result = await window.electronAPI.clearCache();
                if (result.success) {
                  onSuccess(`Cache cleared! ${result.filesCleared || 0} files removed`);
                } else {
                  onError(result.error || 'Failed to clear cache');
                }
              } catch (err: any) {
                onError(err.message || 'Failed to clear cache');
              }
            }}
          >
            <Iconify icon="clear" size={14} /> Clear Cache
          </button>
        </div>
      </div>

      {/* About */}
      <div className="section">
        <div className="section-header">About</div>
        <div className="about-logo-section">
          <img src={appLogo} alt="VoiceFlow" className="about-logo-img" />
          <div className="about-logo-text">
            <span className="about-logo-name">VoiceFlow</span>
            <span className="about-logo-desc">Local voice-to-text</span>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Version</span>
            <span className="setting-hint">Current app version</span>
          </div>
          <span className="setting-value">{appVersion || '1.0.0'}</span>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">GitHub</span>
            <span className="setting-hint">Source code, issues, and updates</span>
          </div>
          <button className="btn btn-sm" onClick={() => window.open('https://github.com/sudutkamar/VoiceFlow', '_blank')}>
            <Iconify icon="github" size={14} /> Open
          </button>
        </div>
      </div>
    </div>
  );
}
