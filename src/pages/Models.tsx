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
  const [modelsPath, setModelsPath] = useState('');

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
            onSuccess('Model downloaded successfully!');
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
      const path = await window.electronAPI.getModelsPath();
      setModelsPath(path);
    } catch {}
  };

  const handleDownload = async (modelName: string) => {
    if (downloading) {
      alert('Please wait for current download to finish');
      return;
    }

    setDownloading(modelName);
    setProgress(0);

    try {
      const result = await window.electronAPI.downloadModel(modelName);
      if (!result.success) {
        alert(result.error);
        setDownloading(null);
      }
    } catch (error) {
      console.error('Download failed:', error);
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

  const handleSelectModel = async (modelName: string) => {
    try {
      await window.electronAPI.updateSetting('model', modelName);
      setSelectedModel(modelName);
      onSuccess(`Model changed to ${modelName}`);
    } catch (error) {
      console.error('Failed to select model:', error);
    }
  };

  const getModelIcon = (modelName: string): string => {
    if (modelName.includes('tiny')) return '⚡';
    if (modelName.includes('base')) return '⚖️';
    if (modelName.includes('small')) return '🎯';
    if (modelName.includes('medium')) return '💎';
    if (modelName.includes('large')) return '👑';
    return '📦';
  };

  const getModelSpeed = (modelName: string): string => {
    if (modelName.includes('tiny')) return 'Fastest';
    if (modelName.includes('base')) return 'Fast';
    if (modelName.includes('small')) return 'Medium';
    if (modelName.includes('medium')) return 'Slow';
    if (modelName.includes('large')) return 'Slowest';
    return 'Unknown';
  };

  const getModelAccuracy = (modelName: string): string => {
    if (modelName.includes('tiny')) return 'Basic';
    if (modelName.includes('base')) return 'Good';
    if (modelName.includes('small')) return 'Better';
    if (modelName.includes('medium')) return 'Great';
    if (modelName.includes('large')) return 'Best';
    return 'Unknown';
  };

  if (loading) {
    return (
      <div className="models-page">
        <div className="empty-state">
          <p>Loading models...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="models-page">
      <div className="page-header">
        <h2>Whisper Models</h2>
      </div>

      <div className="models-info">
        <p>Download Whisper models for speech recognition.</p>
        <p className="models-path">
          📁 {modelsPath}
        </p>
      </div>

      {downloading && (
        <div className="download-progress">
          <div className="progress-header">
            <span>Downloading {downloading}...</span>
            <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
          </div>
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-text">{progress}%</div>
        </div>
      )}

      <div className="models-grid">
        {models.map((model) => (
          <div 
            key={model.name} 
            className={`model-card ${selectedModel === model.name ? 'selected' : ''} ${model.downloaded ? 'downloaded' : ''}`}
          >
            <div className="model-header">
              <span className="model-icon">{getModelIcon(model.name)}</span>
              <h3 className="model-name">{model.name.replace('.bin', '').replace('ggml-', '').toUpperCase()}</h3>
              {selectedModel === model.name && (
                <span className="model-active-badge">Active</span>
              )}
            </div>

            <div className="model-description">{model.description}</div>

            <div className="model-stats">
              <div className="model-stat">
                <span className="stat-icon">💾</span>
                <span>{model.size}</span>
              </div>
              <div className="model-stat">
                <span className="stat-icon">⚡</span>
                <span>{getModelSpeed(model.name)}</span>
              </div>
              <div className="model-stat">
                <span className="stat-icon">🎯</span>
                <span>{getModelAccuracy(model.name)}</span>
              </div>
            </div>

            <div className="model-actions">
              {model.downloaded ? (
                <>
                  <button
                    className={`model-btn ${selectedModel === model.name ? 'active' : ''}`}
                    onClick={() => handleSelectModel(model.name)}
                  >
                    {selectedModel === model.name ? '✓ Selected' : 'Select'}
                  </button>
                </>
              ) : (
                <button
                  className="model-btn download"
                  onClick={() => handleDownload(model.name)}
                  disabled={!!downloading}
                >
                  {downloading === model.name ? `Downloading ${progress}%` : 'Download'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="models-help">
        <h3>💡 Tips</h3>
        <ul>
          <li><strong>⚡ Tiny</strong> - Tercepat (~1 detik), cocok untuk real-time</li>
          <li><strong>⚖️ Base</strong> - Seimbang (~2-3 detik), recommended</li>
          <li><strong>🎯 Small</strong> - Lebih akurat (~5-7 detik)</li>
          <li><strong>💎 Medium</strong> - Sangat akurat (~10-15 detik)</li>
        </ul>
        <p className="models-note">
          Model diunduh dari Hugging Face dan disimpan secara lokal.
        </p>
        <div className="speed-tip">
          <strong>🚀 Untuk kecepatan maksimal:</strong> Gunakan model <strong>Tiny</strong>
        </div>
      </div>
    </div>
  );
}

export default Models;
