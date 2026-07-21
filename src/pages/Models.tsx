import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsContext } from '../hooks/SettingsContext';
import { useNotification } from '../components/Notification';
import { Iconify, getModelIcon, getModelSizeColor } from '../utils/icons';
import { logError, logWarning } from '../utils/errorHandler';

interface ModelsProps {
  onSuccess: (message: string) => void;
  onError?: (message: string) => void;
}

interface ModelInfo {
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  description: string;
  isKnown: boolean;
  downloaded: boolean;
  fileSize?: number;
  isValid?: boolean;
}

type DownloadState = 'idle' | 'downloading' | 'paused' | 'completed' | 'error' | 'finalizing';

function Models({ onSuccess, onError }: ModelsProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modelsPath, setModelsPath] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [interruptedDownload, setInterruptedDownload] = useState<{ modelName: string; progress: number } | null>(null);
  const notif = useNotification();
  const downloadingRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    downloadingRef.current = downloading;
  }, [downloading]);

  const loadModels = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const available = await window.electronAPI.getAvailableModels();
      setModels(available);
    } catch (error) {
      logError('Models', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const handleScanFolder = async () => {
    if (scanning) return;
    
    try {
      setScanning(true);
      const available = await window.electronAPI.scanModelsFolder();
      setModels(available);
      
      const foundCustom = available.filter(m => !m.isKnown && m.isValid);
      const knownModels = available.filter(m => m.isKnown);
      const downloadedModels = available.filter(m => m.downloaded);
      
      if (foundCustom.length > 0) {
        notif.success(`Ditemukan ${foundCustom.length} model custom baru!`);
      } else if (downloadedModels.length > 0) {
        notif.info(`Folder OK — ${downloadedModels.length} model tersedia`);
      } else {
        notif.warning('Tidak ada model ditemukan di folder ini');
      }
    } catch (error) {
      logError('Models', error);
      notif.error('Gagal scan folder models');
    } finally {
      setScanning(false);
    }
  };

  const { settings: ctxSettings } = useSettingsContext();

  // Sync selectedModel from context settings
  useEffect(() => {
    if (ctxSettings.model) {
      setSelectedModel(ctxSettings.model);
    }
  }, [ctxSettings.model]);

  const loadSettings = useCallback(async () => {
    try {
      const settings = ctxSettings.model ? ctxSettings : await window.electronAPI.getSettings();
      setSelectedModel(settings.model || 'ggml-base.bin');
    } catch (err) {
      logWarning('Models', 'Failed to load settings', err);
    }
  }, [ctxSettings]);

  const loadModelsPath = useCallback(async () => {
    try {
      const path = await window.electronAPI.getModelsPath();
      setModelsPath(path);
    } catch (err) {
      logWarning('Models', 'Failed to load models path', err);
    }
  }, []);

  useEffect(() => {
    loadModels(true);
    loadSettings();
    loadModelsPath();

    // Re-sync download state on mount (survives tab switches) — SILENT, no notification/auto-select
    (async () => {
      try {
        const data = await window.electronAPI.getDownloadProgress();
        if (data.state === 'downloading' || data.state === 'paused') {
          setProgress(data.progress);
          setDownloadState(data.state as DownloadState);
          setDownloadedBytes(data.downloadedBytes ?? 0);
          setTotalBytes(data.totalBytes ?? 0);
          if (data.modelName) setDownloading(data.modelName);
        } else if (data.state === 'completed') {
          // Download completed while on another tab - just refresh models list
          setDownloading(null);
          setDownloadState('idle');
          loadModels(false);
        } else {
          // idle or error - ensure clean state
          setDownloading(null);
          setDownloadState('idle');
        }
        
        // Check for interrupted download from app restart
        const interrupted = await window.electronAPI.getInterruptedDownloadInfo();
        if (interrupted && !data.modelName) {
          setInterruptedDownload(interrupted);
        }
      } catch (err) {
        logWarning('Models', 'Failed to sync download state', err);
      }
    })();

    // Listen for download progress updates — LIVE handler with notification/auto-select
    const unsub = window.electronAPI.onDownloadProgress((data) => {
      const { progress: prog, state, downloadedBytes: dlBytes, totalBytes: tBytes, modelName } = data;

      setProgress(prog);
      setDownloadedBytes(dlBytes ?? 0);
      setTotalBytes(tBytes ?? 0);

      if (state === 'finalizing') {
        setProgress(100);
        setDownloadState('finalizing');
        return;
      }

      if (state === 'completed') {
        const completedModel = modelName || downloadingRef.current;
        setDownloading(null);
        setDownloadState('idle');
        setProgress(100);
        loadModels(false);

        if (completedModel) {
          window.electronAPI.updateSetting('model', completedModel).then(() => {
            setSelectedModel(completedModel);
            notif.success(`${completedModel} berhasil di-download dan diaktifkan!`);
          });
        } else {
          notif.success('Model berhasil di-download!');
        }
        return;
      }

      if (state === 'error') {
        setDownloading(null);
        setDownloadState('idle');
        return;
      }

      if (state === 'downloading' || state === 'paused') {
        if (modelName) setDownloading(modelName);
      }

      setDownloadState(state as DownloadState);
    });

    // Listen for model-changed events (from another window or setting change)
    const unsubModelChanged = window.electronAPI.onModelChanged?.(async (modelName) => {
      // Refresh models list and selected model
      setSelectedModel(modelName);
      loadModels(false);
    });

    return () => {
      unsub();
      if (typeof unsubModelChanged === 'function') unsubModelChanged();
    };
  }, [loadModels, loadSettings, loadModelsPath, notif]);

  const handleChooseFolder = async () => {
    try {
      const result = await window.electronAPI.chooseModelsFolder();
      if (result.success && result.path) {
        setModelsPath(result.path);
        loadModels(false);
        notif.success(`Folder models diubah ke: ${result.path}`);
      }
    } catch (error) {
      console.error('Failed to choose folder:', error);
    }
  };

  const openModelsFolder = async () => {
    // Use shell.openPath via preload — but we don't have openPath. Use external file manager trick.
    // Actually use choose-models-folder with current modelsPath as defaultPath
    // to let user see it. For now, show it in notification
    try {
      notif.info(`Models disimpan di: ${modelsPath}`);
    } catch {}
  };

  const handleResetPath = async () => {
    try {
      const result = await window.electronAPI.resetModelsPath();
      if (result.success && result.path) {
        setModelsPath(result.path);
        loadModels(false);
        notif.success('Folder models direset ke default');
      }
    } catch (error) {
      console.error('Failed to reset path:', error);
    }
  };

  const handleDownload = async (modelName: string) => {
    if (downloading) return;
    setDownloading(modelName);
    setDownloadState('downloading');
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    
    try {
      const result = await window.electronAPI.downloadModel(modelName);
      if (!result.success && result.error !== 'Download di-pause') {
        notif.error(result.error || 'Download gagal');
        setDownloading(null);
        setDownloadState('idle');
      }
    } catch (error: any) {
      notif.error(error.message || 'Download gagal');
      setDownloading(null);
      setDownloadState('idle');
    }
  };

  const handleForceDownload = async (modelName: string) => {
    if (downloading) return;
    setDownloading(modelName);
    setDownloadState('downloading');
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    
    try {
      const result = await window.electronAPI.forceDownloadModel(modelName);
      if (!result.success && result.error !== 'Download di-pause') {
        notif.error(result.error || 'Download gagal');
        setDownloading(null);
        setDownloadState('idle');
      }
    } catch (error: any) {
      notif.error(error.message || 'Download gagal');
      setDownloading(null);
      setDownloadState('idle');
    }
  };

  const handlePause = async () => {
    try {
      const result = await window.electronAPI.pauseDownload();
      if (result.success) {
        setDownloadState('paused');
        notif.info('Download di-pause');
      }
    } catch (error: any) {
      notif.error('Gagal pause download');
    }
  };

  const handleResume = async () => {
    try {
      setDownloadState('downloading');
      const result = await window.electronAPI.resumeDownload();
      if (!result.success && result.error !== 'Download di-pause') {
        notif.error(result.error || 'Gagal resume download');
        setDownloading(null);
        setDownloadState('idle');
      }
    } catch (error: any) {
      notif.error('Gagal resume download');
      setDownloading(null);
      setDownloadState('idle');
    }
  };

  const handleCancel = async () => {
    if (downloading) {
      await window.electronAPI.cancelDownload();
      setDownloading(null);
      setDownloadState('idle');
      setProgress(0);
      notif.info('Download dibatalkan');
    }
  };

  const handleResumeInterrupted = async () => {
    if (!interruptedDownload) return;
    
    setDownloading(interruptedDownload.modelName);
    setDownloadState('downloading');
    setInterruptedDownload(null);
    
    try {
      const result = await window.electronAPI.resumeDownload();
      if (!result.success && result.error !== 'Download di-pause') {
        notif.error(result.error || 'Gagal resume download');
        setDownloading(null);
        setDownloadState('idle');
      }
    } catch (error: any) {
      notif.error('Gagal resume download');
      setDownloading(null);
      setDownloadState('idle');
    }
  };

  const handleDismissInterrupted = () => {
    setInterruptedDownload(null);
  };

  const handleSelect = async (modelName: string) => {
    try {
      await window.electronAPI.updateSetting('model', modelName);
      setSelectedModel(modelName);
      notif.success(`Model changed to ${modelName}`);
    } catch (error) {
      console.error('Failed to select model:', error);
    }
  };

  const handleDelete = async (modelName: string) => {
    setConfirmDelete(modelName);
  };

  const confirmDeleteModel = async () => {
    if (!confirmDelete) return;
    const modelName = confirmDelete;
    const isCurrentActive = selectedModel === modelName;
    
    try {
      await window.electronAPI.deleteModel(modelName);
      
      // If deleted model was active, switch to base
      if (isCurrentActive) {
        await window.electronAPI.updateSetting('model', 'ggml-base.bin');
        setSelectedModel('ggml-base.bin');
        notif.warning(`Model ${modelName} dihapus, beralih ke Base model`);
      } else {
        notif.success(`Model ${modelName} dihapus`);
      }
      
      loadModels(false);
    } catch (error) {
      notif.error('Gagal menghapus model');
    } finally {
      setConfirmDelete(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getIcon = (name: string) => {
    if (name.includes('tiny')) return 'T';
    if (name.includes('base-q5_1')) return 'BQ';
    if (name.includes('base')) return 'B';
    if (name.includes('small')) return 'S';
    if (name.includes('medium')) return 'M';
    if (name.includes('large-v3-turbo-q8_0')) return 'V3T8';
    if (name.includes('large-v3-turbo-q5_0')) return 'V3T5';
    if (name.includes('large-v3-turbo')) return 'V3T';
    if (name.includes('large-v3-q5_0')) return 'XL5';
    if (name.includes('large-v3')) return 'XL';
    if (name.includes('large')) return 'L';
    return '?';
  };

  const getLabel = (name: string) => {
    if (name.includes('large-v3-q5_0')) return 'Large v3 Q5';
    if (name.includes('large-v3-turbo-q8_0')) return 'Large v3 Turbo Q8';
    if (name.includes('large-v3-turbo-q5_0')) return 'Large v3 Turbo Q5';
    if (name.includes('large-v3-turbo')) return 'Large v3 Turbo';
    if (name.includes('large-v3')) return 'Large v3';
    if (name.includes('large')) return 'Large';
    if (name.includes('medium')) return 'Medium';
    if (name.includes('small')) return 'Small';
    if (name.includes('base-q5_1')) return 'Base Q5_1';
    if (name.includes('base')) return 'Base';
    if (name.includes('tiny')) return 'Tiny';
    return name.replace('ggml-', '').replace('.bin', '');
  };

  const getSpeed = (name: string) => {
    if (name.includes('large-v3-q5_0')) return '~6-10s';
    if (name.includes('large-v3-turbo-q8_0')) return '~5-8s';
    if (name.includes('large-v3-turbo-q5_0')) return '~4-7s';
    if (name.includes('large-v3-turbo')) return '~8-12s';
    if (name.includes('large-v3')) return '~15-25s';
    if (name.includes('large')) return '~15-25s';
    if (name.includes('medium')) return '~10-15s';
    if (name.includes('small')) return '~5-7s';
    if (name.includes('base-q5_1')) return '~1-2s';
    if (name.includes('base')) return '~2-3s';
    if (name.includes('tiny')) return '~1s';
    return '';
  };

  const getAccuracy = (name: string) => {
    if (name.includes('large-v3-q5_0')) return '🏆 Best';
    if (name.includes('large-v3-turbo-q8_0')) return 'Excellent';
    if (name.includes('large-v3-turbo-q5_0')) return 'Excellent';
    if (name.includes('large-v3-turbo')) return 'Excellent';
    if (name.includes('large-v3')) return 'Best';
    if (name.includes('large')) return 'Best';
    if (name.includes('medium')) return 'Great';
    if (name.includes('small')) return '⭐ Better';
    if (name.includes('base-q5_1')) return '⭐ Good';
    if (name.includes('base')) return 'Good';
    if (name.includes('tiny')) return 'Low';
    return '';
  };

  const getRecommendation = (name: string): string => {
    if (name.includes('small')) return '⭐ RECOMMENDED — Best akurasi & kecepatan';
    if (name.includes('base-q5_1')) return '⚡ FAST — Cepat untuk daily use';
    return '';
  };

  const isModelCorrupt = (model: ModelInfo): boolean => {
    return model.fileSize !== undefined && model.fileSize > 0 && !model.isValid;
  };

  // Custom models that aren't in AVAILABLE_MODELS but exist in folder
  const customModels = models.filter(m => !m.isKnown && m.isValid);

  if (loading) {
    return (
      <div className="page">
        <div className="page-loading">
          <div className="spinner-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Models</h1>
        <p className="page-subtitle">Choose a Whisper model for transcription</p>
      </div>

      {/* Current Model */}
      <div className="info-card accent">
        <div className="active-model-info">
          <div className="active-model-icon" style={{ color: getModelSizeColor(selectedModel) }}>
            <Iconify icon={getModelIcon(selectedModel)} size={24} />
          </div>
          <div className="active-model-details">
            <span className="active-model-name">{getLabel(selectedModel)}</span>
            <span className="active-model-file">{selectedModel || 'No model selected'}</span>
          </div>
          <div className="active-model-speed">
            <Iconify icon="benchmark" size={14} />
            <span>{getSpeed(selectedModel) || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Models Save Location */}
      <div className="info-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <div className="info-card-row">
          <span className="info-label" style={{ margin: 0 }}>
            <Iconify icon="folder" size={12} style={{ marginRight: '4px', verticalAlign: 'middle', opacity: 0.7 }} />
            Models Folder
          </span>
          <div className="info-card-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleChooseFolder}>
              <Iconify icon="folder" size={14} /> Pilih
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleResetPath}>
              <Iconify icon="refresh" size={14} /> Reset
            </button>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleScanFolder} 
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <span className="btn-spinner" /> Scanning...
                </>
              ) : (
                <><Iconify icon="scan" size={14} /> Scan</>
              )}
            </button>
          </div>
        </div>
        <div className="engine-path-display">
          <span className="engine-path-icon">
            <Iconify icon="folder" size={14} style={{ color: modelsPath.toLowerCase().includes('documents') ? 'var(--accent)' : 'var(--text-muted)' }} />
          </span>
          <span className="engine-path-text" title={modelsPath} style={{ color: 'var(--text)' }}>
            {modelsPath || '—'}
          </span>
          <span className={`engine-path-badge ${modelsPath.toLowerCase().includes('documents') ? 'badge-ok' : modelsPath.toLowerCase().includes('resources') ? 'badge-info' : 'badge-warn'}`}>
            {modelsPath.toLowerCase().includes('documents') ? 'Documents' : modelsPath.toLowerCase().includes('resources') ? 'Dev' : 'Custom'}
          </span>
        </div>
      </div>

      {/* Download Progress Card */}
      {downloading && (
        <div className={`download-progress-card ${downloadState === 'paused' ? 'paused' : ''} ${downloadState === 'finalizing' ? 'finalizing' : ''}`}>
          <div className="download-progress-header">
            <div className="download-progress-info">
              <span className="download-model-name">
                {downloadState === 'paused' ? <Iconify icon="pause" size={16} /> : downloadState === 'finalizing' ? <Iconify icon="done" size={16} /> : <Iconify icon="download" size={16} />} {getLabel(downloading)}
              </span>
              <span className="download-progress-percent">{Math.round(progress)}%</span>
            </div>
            <div className="download-progress-actions">
              {downloadState === 'downloading' && (
                <button className="btn btn-secondary btn-sm" onClick={handlePause}>
                  <Iconify icon="pause" size={14} /> Pause
                </button>
              )}
              {downloadState === 'paused' && (
                <button className="btn btn-primary btn-sm" onClick={handleResume}>
                  <Iconify icon="resume" size={14} /> Resume
                </button>
              )}
              {downloadState !== 'finalizing' && (
                <button className="btn btn-danger btn-sm" onClick={handleCancel}>
                  <Iconify icon="cancel" size={14} /> Cancel
                </button>
              )}
            </div>
          </div>
          
          <div className="download-progress-bar-wrap">
            <div className="download-progress-track">
              <div 
                className={`download-progress-bar ${downloadState === 'paused' ? 'paused' : ''} ${downloadState === 'finalizing' ? 'finalizing' : ''}`}
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
          
          <div className="download-progress-stats">
            <span>
              {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
            </span>
            <span className="download-state">
              {downloadState === 'paused' ? 'Paused' : 
               downloadState === 'finalizing' ? 'Menyimpan...' : 
               'Downloading...'}
            </span>
          </div>
        </div>
      )}

      {/* Interrupted Download Banner (from app restart) */}
      {interruptedDownload && !downloading && (
        <div className="download-progress-card paused">
          <div className="download-progress-header">
            <div className="download-progress-info">
              <span className="download-model-name"><Iconify icon="pause" size={16} /> {getLabel(interruptedDownload.modelName)}</span>
              <span className="download-progress-percent">{interruptedDownload.progress}%</span>
            </div>
            <div className="download-progress-actions">
              <button className="btn btn-primary btn-sm" onClick={handleResumeInterrupted}>
                <Iconify icon="resume" size={14} /> Resume Download
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDismissInterrupted}>
                <Iconify icon="cancel" size={14} /> Dismiss
              </button>
            </div>
          </div>
          <div className="download-progress-stats">
            <span>Download terputus sebelumnya</span>
            <span className="download-state">Paused</span>
          </div>
        </div>
      )}

      {/* Models List */}
      <div className="card-list">
        {models.map((model) => {
          const isActive = selectedModel === model.name;
          const isDownloading = downloading === model.name;
          const isCorrupt = isModelCorrupt(model);

          return (
            <div key={model.name} className={`card ${isActive ? 'card-active' : ''} ${isCorrupt ? 'card-corrupt' : ''}`}>
              <div className="card-left">
                <div className="card-icon" style={{ color: getModelSizeColor(model.name) }}>
                  <Iconify icon={getModelIcon(model.name)} size={24} />
                </div>
                <div className="card-body">
                  <div className="card-title">
                    {getLabel(model.name)}
                    {isActive && <span className="badge">Active</span>}
                    {getRecommendation(model.name) && !isActive && <span className="badge" style={{ background: 'var(--accent)', color: 'white' }}>Recommended</span>}
                    {!model.isKnown && model.downloaded && <span className="badge badge-custom">Custom</span>}
                    {isCorrupt && <span className="badge badge-warning">Corrupt</span>}
                  </div>
                  <div className="card-desc">{model.description}</div>
                  {getRecommendation(model.name) && (
                    <div className="card-desc" style={{ color: 'var(--accent)', fontWeight: 500, marginTop: '2px' }}>
                      {getRecommendation(model.name)}
                    </div>
                  )}
                  <div className="card-meta">
                    <span>{model.size}</span>
                    <span>{getSpeed(model.name)}</span>
                    <span>{getAccuracy(model.name)}</span>
                    {model.fileSize !== undefined && model.fileSize > 0 && (
                      <span className={isCorrupt ? 'text-warning' : ''}>
                        {formatBytes(model.fileSize)}
                        {isCorrupt && ' (incomplete)'}
                      </span>
                    )}
                  </div>
                  {isCorrupt && (
                    <div className="card-warning">
                      File tidak valid atau tidak lengkap. Silakan download ulang.
                    </div>
                  )}
                </div>
              </div>
              <div className="card-right">
                {model.downloaded && !isCorrupt ? (
                  <div className="card-actions-row">
                    {isActive ? (
                      <span className="status-active"><Iconify icon="active" size={14} /> Active</span>
                    ) : (
                      <button className="btn btn-primary" onClick={() => handleSelect(model.name)}>
                        <Iconify icon="check" size={14} /> Use
                      </button>
                    )}
                    <button 
                      className="btn btn-danger btn-icon" 
                      onClick={() => handleDelete(model.name)}
                      title="Hapus model"
                    >
                      <Iconify icon="delete" />
                    </button>
                  </div>
                ) : isDownloading ? (
                  <div className="downloading-indicator">
                    <div className="mini-spinner" />
                    <span>{Math.round(progress)}%</span>
                  </div>
                ) : isCorrupt ? (
                  <div className="card-actions-row">
                    <button
                      className="btn btn-warning"
                      onClick={() => handleForceDownload(model.name)}
                      disabled={!!downloading}
                    >
                      <Iconify icon="refresh" size={14} /> Re-download
                    </button>
                    <button 
                      className="btn btn-danger btn-icon" 
                      onClick={() => handleDelete(model.name)}
                      title="Hapus file corrupt"
                    >
                      <Iconify icon="delete" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleDownload(model.name)}
                    disabled={!!downloading}
                  >
                    <Iconify icon="download" size={14} /> Download
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tips & Recommendations */}
      <div className="info-box">
        <h3><Iconify icon="tip" size={16} /> Rekomendasi Model</h3>
        <div style={{ marginTop: '8px' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'var(--accent)' }}>⭐ Best Overall: ggml-small.bin</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.8 }}>
              Akurasi 90-95%, cepat, cocok untuk semua bahasa termasuk Indonesian.
              Balance terbaik antara kecepatan dan akurasi.
            </p>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'var(--success)' }}>⚡ Fastest: ggml-base-q5_1.bin</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.8 }}>
              57MB, sangat cepat (~3 detik), akurasi cukup untuk daily use.
              Cocok untuk coding, chat, dan catatan singkat.
            </p>
          </div>
          <div>
            <strong>📊 Perbandingan:</strong>
            <ul style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.8 }}>
              <li><strong>Tiny/Base</strong> — Sangat cepat, akurasi rendah-sedang</li>
              <li><strong>Small</strong> — Cepat, akurasi tinggi ⭐</li>
              <li><strong>Medium/Large</strong> — Lambat, butuh RAM 8GB+</li>
            </ul>
          </div>
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Delete Model</h3>
            <p>Are you sure you want to delete <strong>{confirmDelete}</strong>?</p>
            {selectedModel === confirmDelete && (
              <p className="text-warning">This is your active model. It will be replaced with Base.</p>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(null)}><Iconify icon="cancel" size={14} /> Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteModel}><Iconify icon="delete" size={14} /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Models;
