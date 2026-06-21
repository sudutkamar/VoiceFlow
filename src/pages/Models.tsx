import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNotification } from '../components/Notification';

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
  downloaded: boolean;
  fileSize?: number;
  isValid?: boolean;
}

type DownloadState = 'idle' | 'downloading' | 'paused' | 'completed' | 'error' | 'finalizing';

function Models({ onSuccess, onError }: ModelsProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modelsPath, setModelsPath] = useState<string>('');
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
      console.error('Failed to load models:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      setSelectedModel(settings.model || 'ggml-base.bin');
    } catch {}
  }, []);

  const loadModelsPath = useCallback(async () => {
    try {
      const path = await window.electronAPI.getModelsPath();
      setModelsPath(path);
    } catch {}
  }, []);

  useEffect(() => {
    loadModels(true);
    loadSettings();
    loadModelsPath();

    // Listen for download progress updates
    const unsub = window.electronAPI.onDownloadProgress((data) => {
      const { progress: prog, state, downloadedBytes: dlBytes, totalBytes: tBytes } = data;
      
      setProgress(prog);
      setDownloadedBytes(dlBytes);
      setTotalBytes(tBytes);

      if (state === 'finalizing') {
        // Download is finishing up, show 100%
        setProgress(100);
        setDownloadState('finalizing');
        return;
      }

      if (state === 'completed') {
        // File is ready! Reset download state and refresh models
        const completedModel = downloadingRef.current;
        setDownloading(null);
        setDownloadState('idle');
        setProgress(100);
        
        // Refresh models list (file is guaranteed to be renamed at this point)
        loadModels(false);
        
        // Auto-select the newly downloaded model
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

      // Update state for downloading/paused
      setDownloadState(state as DownloadState);
    });

    return () => unsub();
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
    if (name.includes('tiny')) return '⚡';
    if (name.includes('base')) return '⚖️';
    if (name.includes('small')) return '🎯';
    if (name.includes('medium')) return '💎';
    if (name.includes('large-v3-turbo')) return '🏆';
    if (name.includes('large')) return '👑';
    return '🧠';
  };

  const getLabel = (name: string) => {
    if (name.includes('tiny')) return 'Tiny';
    if (name.includes('base')) return 'Base';
    if (name.includes('small')) return 'Small';
    if (name.includes('medium')) return 'Medium';
    if (name.includes('large-v3-turbo')) return 'Large v3 Turbo';
    if (name.includes('large-v3')) return 'Large v3';
    if (name.includes('large')) return 'Large';
    return name.replace('ggml-', '').replace('.bin', '');
  };

  const getSpeed = (name: string) => {
    if (name.includes('tiny')) return '~1s';
    if (name.includes('base')) return '~2-3s';
    if (name.includes('small')) return '~5-7s';
    if (name.includes('medium')) return '~10-15s';
    if (name.includes('large-v3-turbo')) return '~8-12s';
    if (name.includes('large')) return '~15-25s';
    return '';
  };

  const getAccuracy = (name: string) => {
    if (name.includes('tiny')) return 'Low';
    if (name.includes('base')) return 'Good';
    if (name.includes('small')) return 'Better';
    if (name.includes('medium')) return 'Great';
    if (name.includes('large-v3-turbo')) return 'Excellent';
    if (name.includes('large')) return 'Best';
    return '';
  };

  const isModelCorrupt = (model: ModelInfo): boolean => {
    return model.fileSize !== undefined && model.fileSize > 0 && !model.isValid;
  };

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
        <span className="info-label">Active Model:</span>
        <span className="info-value">{getIcon(selectedModel)} {getLabel(selectedModel)}</span>
      </div>

      {/* Models Save Location */}
      <div className="info-card">
        <div className="info-card-row">
          <div>
            <span className="info-label">📂 Lokasi Simpan:</span>
            <span className="info-value info-path" title={modelsPath}>{modelsPath}</span>
          </div>
          <div className="info-card-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleChooseFolder}>
              Pilih Folder
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleResetPath}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Download Progress Card */}
      {downloading && (
        <div className={`download-progress-card ${downloadState === 'paused' ? 'paused' : ''} ${downloadState === 'finalizing' ? 'finalizing' : ''}`}>
          <div className="download-progress-header">
            <div className="download-progress-info">
              <span className="download-model-name">
                {downloadState === 'paused' ? '⏸️' : downloadState === 'finalizing' ? '✅' : '⬇️'} {getLabel(downloading)}
              </span>
              <span className="download-progress-percent">{Math.round(progress)}%</span>
            </div>
            <div className="download-progress-actions">
              {downloadState === 'downloading' && (
                <button className="btn btn-secondary btn-sm" onClick={handlePause}>
                  ⏸ Pause
                </button>
              )}
              {downloadState === 'paused' && (
                <button className="btn btn-primary btn-sm" onClick={handleResume}>
                  ▶ Resume
                </button>
              )}
              {downloadState !== 'finalizing' && (
                <button className="btn btn-danger btn-sm" onClick={handleCancel}>
                  ✕ Cancel
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

      {/* Models List */}
      <div className="card-list">
        {models.map((model) => {
          const isActive = selectedModel === model.name;
          const isDownloading = downloading === model.name;
          const isCorrupt = isModelCorrupt(model);

          return (
            <div key={model.name} className={`card ${isActive ? 'card-active' : ''} ${isCorrupt ? 'card-corrupt' : ''}`}>
              <div className="card-left">
                <div className="card-icon">{getIcon(model.name)}</div>
                <div className="card-body">
                  <div className="card-title">
                    {getLabel(model.name)}
                    {isActive && <span className="badge">Active</span>}
                    {isCorrupt && <span className="badge badge-warning">Corrupt</span>}
                  </div>
                  <div className="card-desc">{model.description}</div>
                  <div className="card-meta">
                    <span>📦 {model.size}</span>
                    <span>⚡ {getSpeed(model.name)}</span>
                    <span>🎯 {getAccuracy(model.name)}</span>
                    {model.fileSize !== undefined && model.fileSize > 0 && (
                      <span className={isCorrupt ? 'text-warning' : ''}>
                        💾 {formatBytes(model.fileSize)}
                        {isCorrupt && ' (incomplete)'}
                      </span>
                    )}
                  </div>
                  {isCorrupt && (
                    <div className="card-warning">
                      ⚠️ File tidak valid atau tidak lengkap. Silakan download ulang.
                    </div>
                  )}
                </div>
              </div>
              <div className="card-right">
                {model.downloaded && !isCorrupt ? (
                  <div className="card-actions-row">
                    {isActive ? (
                      <span className="status-active">✓ Active</span>
                    ) : (
                      <button className="btn btn-primary" onClick={() => handleSelect(model.name)}>
                        Use
                      </button>
                    )}
                    <button 
                      className="btn btn-danger btn-icon" 
                      onClick={() => handleDelete(model.name)}
                      title="Hapus model"
                    >
                      🗑
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
                      Re-download
                    </button>
                    <button 
                      className="btn btn-danger btn-icon" 
                      onClick={() => handleDelete(model.name)}
                      title="Hapus file corrupt"
                    >
                      🗑
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleDownload(model.name)}
                    disabled={!!downloading}
                  >
                    Download
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tips */}
      <div className="info-box">
        <h3>💡 Tips</h3>
        <ul>
          <li><strong>Base</strong> is good enough for daily use</li>
          <li><strong>Medium</strong> gives best accuracy but uses more RAM</li>
          <li>Download requires internet connection</li>
          <li>You can pause and resume downloads at any time</li>
          <li>If a model shows as "Corrupt", click "Re-download" to fix it</li>
        </ul>
      </div>
    </div>
  );
}

export default Models;
