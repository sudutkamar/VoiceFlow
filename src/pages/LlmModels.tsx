import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNotification } from '../components/Notification';
import { Iconify } from '../utils/icons';

interface LlmModelsProps {
  onSuccess: (message: string) => void;
  onError?: (message: string) => void;
}

interface LlmModelInfo {
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  description: string;
}

const AVAILABLE_LLM_MODELS: LlmModelInfo[] = [
  {
    name: 'qwen2.5-0.5b-q4_k_m.gguf',
    size: '352 MB',
    sizeBytes: 352000000,
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-GGUF/resolve/main/qwen2.5-0.5b-q4_k_m.gguf',
    description: '⭐ Rekomendasi: Qwen 0.5B Q4 — cepat + akurat untuk cleanup teks',
  },
  {
    name: 'qwen2.5-1.5b-q4_k_m.gguf',
    size: '985 MB',
    sizeBytes: 985000000,
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-GGUF/resolve/main/qwen2.5-1.5b-q4_k_m.gguf',
    description: 'Qwen 1.5B Q4 — lebih akurat, butuh ~2GB RAM',
  },
  {
    name: 'smollm2-360m-q4_k_m.gguf',
    size: '240 MB',
    sizeBytes: 240000000,
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-GGUF/resolve/main/smollm2-360m-q4_k_m.gguf',
    description: 'SmolLM2 360M — paling ringan, cocok untuk CPU lemah',
  },
  {
    name: 'gemma-3-1b-it-q4_k_m.gguf',
    size: '780 MB',
    sizeBytes: 780000000,
    url: 'https://huggingface.co/bartowski/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-q4_k_m.gguf',
    description: 'Gemma 3 1B Q4 — akurasi bagus, butuh ~1.5GB RAM',
  },
];

function LlmModels({ onSuccess, onError }: LlmModelsProps) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [downloadedModels, setDownloadedModels] = useState<Array<{ name: string; sizeBytes: number }>>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadState, setDownloadState] = useState<string>('idle');
  const [hasCli, setHasCli] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const notif = useNotification();

  const loadData = useCallback(async () => {
    try {
      const result = await window.electronAPI.llmCheckAvailability();
      setHasCli(result.hasCli);
      if (result.models) {
        setDownloadedModels(result.models);
      }
      const s = await window.electronAPI.getSettings();
      setSettings(s);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDownload = async (modelName: string) => {
    setDownloading(modelName);
    setDownloadProgress(0);
    setDownloadState('downloading');
    
    try {
      const result = await window.electronAPI.llmDownloadModel(modelName);
      if (result.success) {
        notif.success(`${modelName} berhasil di-download!`);
        loadData();
        // Auto-select: set as active LLM model
        await window.electronAPI.updateSetting('llm_model', modelName);
        await window.electronAPI.updateSetting('llm_postprocess', 'true');
        setSettings(prev => ({ ...prev, llm_model: modelName, llm_postprocess: 'true' }));
        notif.success('LLM Post-Processing diaktifkan!');
      } else {
        notif.error(result.error || 'Download gagal');
      }
    } catch (err: any) {
      notif.error(err.message || 'Download gagal');
    } finally {
      setDownloading(null);
      setDownloadState('idle');
      setDownloadProgress(0);
    }
  };

  const handleDelete = async (modelName: string) => {
    try {
      const result = await window.electronAPI.llmDeleteModel(modelName);
      if (result.success) {
        const isActive = settings.llm_model === modelName;
        if (isActive) {
          await window.electronAPI.updateSetting('llm_model', '');
          await window.electronAPI.updateSetting('llm_postprocess', 'false');
          setSettings(prev => ({ ...prev, llm_model: '', llm_postprocess: 'false' }));
          notif.warning('Model aktif dihapus, LLM dinonaktifkan');
        } else {
          notif.success(`${modelName} dihapus`);
        }
        loadData();
      } else {
        notif.error(result.error || 'Gagal menghapus');
      }
    } catch (err: any) {
      notif.error(err.message || 'Gagal menghapus');
    }
    setConfirmDelete(null);
  };

  const handleSelect = async (modelName: string) => {
    await window.electronAPI.updateSetting('llm_model', modelName);
    await window.electronAPI.updateSetting('llm_postprocess', 'true');
    setSettings(prev => ({ ...prev, llm_model: modelName, llm_postprocess: 'true' }));
    notif.success(`LLM Model: ${modelName}`);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getIcon = (name: string) => {
    if (name.includes('qwen2.5-0.5b')) return 'Q';
    if (name.includes('qwen2.5-1.5b')) return 'Q+';
    if (name.includes('smollm2')) return 'S';
    if (name.includes('gemma')) return 'G';
    return '?';
  };

  const getLabel = (name: string) => {
    if (name.includes('qwen2.5-0.5b-q4_k_m')) return 'Qwen 2.5 0.5B';
    if (name.includes('qwen2.5-1.5b-q4_k_m')) return 'Qwen 2.5 1.5B';
    if (name.includes('smollm2-360m-q4_k_m')) return 'SmolLM2 360M';
    if (name.includes('gemma-3-1b-it-q4_k_m')) return 'Gemma 3 1B';
    return name.replace('.gguf', '');
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

  const activeModel = settings.llm_model || '';
  const llmEnabled = settings.llm_postprocess === 'true';

  return (
    <div className="page">
      <div className="page-header">
        <h1>LLM Models</h1>
        <p className="page-subtitle">AI models for post-processing transcription (cleanup filler words, grammar, punctuation)</p>
      </div>

      {/* Status Card */}
      <div className={`info-card ${hasCli ? '' : 'warning'}`}>
        <div className="active-model-info">
          <div className="active-model-icon" style={{ color: hasCli ? '#4ade80' : '#f87171' }}>
            <Iconify icon="modelSmall" size={24} />
          </div>
          <div className="active-model-details">
            <span className="active-model-name">
              {hasCli ? '✅ llama-cli ready' : '⚠️ llama-cli.exe not found'}
            </span>
            <span className="active-model-file">
              {hasCli 
                ? `${downloadedModels.length} model(s) tersedia${llmEnabled ? ' · LLM aktif' : ' · LLM nonaktif'}`
                : 'llama-cli.exe harus dibundle di resources/llm/'}
            </span>
          </div>
          {activeModel && (
            <div className="active-model-speed">
              <Iconify icon="spark" size={14} />
              <span>{getLabel(activeModel)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Download Progress */}
      {downloading && (
        <div className="download-progress-card">
          <div className="download-progress-header">
            <div className="download-progress-info">
              <span className="download-model-name">
                <Iconify icon="download" size={16} /> {getLabel(downloading)}
              </span>
              <span className="download-progress-percent">{Math.round(downloadProgress)}%</span>
            </div>
          </div>
          <div className="download-progress-bar-wrap">
            <div className="download-progress-track">
              <div className="download-progress-bar" style={{ width: `${downloadProgress}%` }} />
            </div>
          </div>
          <div className="download-progress-stats">
            <span>Downloading {downloading}...</span>
          </div>
        </div>
      )}

      {/* Models List */}
      <div className="card-list">
        {AVAILABLE_LLM_MODELS.map((model) => {
          const isDownloaded = downloadedModels.some(dm => dm.name === model.name);
          const isActive = activeModel === model.name;
          const isDownloading = downloading === model.name;
          const downloadedInfo = downloadedModels.find(dm => dm.name === model.name);

          return (
            <div key={model.name} className={`card ${isActive ? 'card-active' : ''}`}>
              <div className="card-left">
                <div className="card-icon" style={{ color: isDownloaded ? '#4ade80' : '#6b7280' }}>
                  <span className="card-icon-text">{getIcon(model.name)}</span>
                </div>
                <div className="card-body">
                  <div className="card-title">
                    {getLabel(model.name)}
                    {isActive && <span className="badge">Active</span>}
                    {isDownloaded && !isActive && <span className="badge badge-custom">Downloaded</span>}
                  </div>
                  <div className="card-desc">{model.description}</div>
                  <div className="card-meta">
                    <span>{model.size}</span>
                    {downloadedInfo && <span>{formatBytes(downloadedInfo.sizeBytes)} on disk</span>}
                  </div>
                </div>
              </div>
              <div className="card-right">
                {isDownloaded ? (
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
                      onClick={() => setConfirmDelete(model.name)}
                      title="Hapus model"
                    >
                      <Iconify icon="delete" />
                    </button>
                  </div>
                ) : isDownloading ? (
                  <div className="downloading-indicator">
                    <div className="mini-spinner" />
                    <span>{Math.round(downloadProgress)}%</span>
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

      {/* Tips */}
      <div className="info-box">
        <h3><Iconify icon="tip" size={16} /> Cara Kerja</h3>
        <ul>
          <li>Model GGUF kecil akan di-download dari HuggingFace (sekali saja)</li>
          <li>Setelah download, LLM Post-Processing otomatis diaktifkan</li>
          <li>Filler words (um, uh, like) dan stutter otomatis dihapus</li>
          <li>Grammar &amp; punctuation diperbaiki secara natural</li>
          <li>Semua proses 100% lokal — tidak ada data dikirim ke cloud</li>
        </ul>
      </div>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Hapus Model</h3>
            <p>Yakin ingin menghapus <strong>{confirmDelete}</strong>?</p>
            {activeModel === confirmDelete && (
              <p className="text-warning">Ini model aktif. LLM Post-Processing akan dinonaktifkan.</p>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(null)}><Iconify icon="cancel" size={14} /> Batal</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}><Iconify icon="delete" size={14} /> Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LlmModels;
