import React, { useState, useEffect } from 'react';

interface ModelsProps {
  onSuccess: (message: string) => void;
}

interface ModelInfo {
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  description: string;
  downloaded: boolean;
}

function Models({ onSuccess }: ModelsProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    loadModels();
    loadSettings();
  }, []);

  useEffect(() => {
    if (downloading) {
      const interval = setInterval(async () => {
        try {
          const p = await window.electronAPI.getDownloadProgress();
          setProgress(p);
          if (p >= 100) {
            clearInterval(interval);
            setDownloading(null);
            loadModels();
            onSuccess('Model downloaded!');
          }
        } catch {}
      }, 500);
      return () => clearInterval(interval);
    }
  }, [downloading]);

  const loadModels = async () => {
    try {
      setLoading(true);
      const available = await window.electronAPI.getAvailableModels();
      setModels(available);
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      setSelectedModel(settings.model || 'ggml-base.bin');
    } catch {}
  };

  const handleDownload = async (modelName: string) => {
    if (downloading) return;
    setDownloading(modelName);
    setProgress(0);
    try {
      const result = await window.electronAPI.downloadModel(modelName);
      if (!result.success) {
        alert(result.error);
        setDownloading(null);
      }
    } catch (error) {
      setDownloading(null);
    }
  };

  const handleCancel = async () => {
    if (downloading) {
      await window.electronAPI.cancelDownload();
      setDownloading(null);
      setProgress(0);
    }
  };

  const handleSelect = async (modelName: string) => {
    try {
      await window.electronAPI.updateSetting('model', modelName);
      setSelectedModel(modelName);
      onSuccess(`Model changed to ${modelName}`);
    } catch (error) {
      console.error('Failed to select model:', error);
    }
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

      {/* Models List */}
      <div className="card-list">
        {models.map((model) => {
          const isActive = selectedModel === model.name;
          const isDownloading = downloading === model.name;

          return (
            <div key={model.name} className={`card ${isActive ? 'card-active' : ''}`}>
              <div className="card-left">
                <div className="card-icon">{getIcon(model.name)}</div>
                <div className="card-body">
                  <div className="card-title">
                    {getLabel(model.name)}
                    {isActive && <span className="badge">Active</span>}
                  </div>
                  <div className="card-desc">{model.description}</div>
                  <div className="card-meta">
                    <span>📦 {model.size}</span>
                    <span>⚡ {getSpeed(model.name)}</span>
                    <span>🎯 {getAccuracy(model.name)}</span>
                  </div>
                  {isDownloading && (
                    <div className="progress-wrap">
                      <div className="progress-track">
                        <div className="progress-bar" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="progress-text">{Math.round(progress)}%</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="card-right">
                {model.downloaded ? (
                  isActive ? (
                    <span className="status-active">✓ Active</span>
                  ) : (
                    <button className="btn btn-primary" onClick={() => handleSelect(model.name)}>
                      Use
                    </button>
                  )
                ) : isDownloading ? (
                  <button className="btn btn-secondary" onClick={handleCancel}>
                    Cancel
                  </button>
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
        </ul>
      </div>
    </div>
  );
}

export default Models;
