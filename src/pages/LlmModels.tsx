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
    name: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: '379 MB',
    sizeBytes: 397808192,
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    description: '⭐ Rekomendasi: Qwen 0.5B Q4 — cepat + akurat untuk cleanup teks',
  },
  {
    name: 'qwen2.5-0.5b-instruct-q3_k_m.gguf',
    size: '280 MB',
    sizeBytes: 280000000,
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q3_K_M.gguf',
    description: 'Qwen 0.5B Q3 — lebih kecil, hampir sama akurat',
  },
  {
    name: 'tinyllama-1.1b-chat-q4_k_m.gguf',
    size: '637 MB',
    sizeBytes: 637000000,
    url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    description: 'TinyLlama 1.1B Q4 — akurasi lebih bagus, butuh ~1.5GB RAM',
  },
  {
    name: 'phi-2-q4_k_m.gguf',
    size: '622 MB',
    sizeBytes: 622000000,
    url: 'https://huggingface.co/TheBloke/phi-2-GGUF/resolve/main/phi-2.Q4_K_M.gguf',
    description: 'Phi-2 2.7B Q4 — akurasi tinggi, butuh ~2GB RAM',
  },
];

function LlmModels({ onSuccess, onError }: LlmModelsProps) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [downloadedModels, setDownloadedModels] = useState<Array<{ name: string; sizeBytes: number }>>([]);
  const [modelsPath, setModelsPath] = useState<string>('Memuat...');
  const [scanning, setScanning] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadState, setDownloadState] = useState<string>('idle');
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [hasCli, setHasCli] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const notif = useNotification();
  const downloadingRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await window.electronAPI.llmCheckAvailability();
      setHasCli(result.hasCli);
      if (result.models) {
        setDownloadedModels(result.models);
      }
      const s = await window.electronAPI.getSettings();
      setSettings(s);
      const p = await window.electronAPI.llmGetModelsPath();
      console.log('[LlmModels] path loaded:', p);
      setModelsPath(p || '(path kosong)');
    } catch (err: any) {
      console.error('[LlmModels] gagal load path:', err?.message || err);
      setModelsPath('Gagal memuat path: ' + (err?.message || 'unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Subscribe to LLM download progress events
  useEffect(() => {
    const unsub = window.electronAPI.onLlmDownloadProgress((data) => {
      const { progress, state, downloadedBytes: dlBytes, totalBytes: tBytes } = data;

      setDownloadProgress(progress);
      if (dlBytes !== undefined) setDownloadedBytes(dlBytes);
      if (tBytes !== undefined && tBytes > 0) setTotalBytes(tBytes);

      if (state === 'downloading') {
        setDownloadState('downloading');
      }

      if (state === 'error') {
        setDownloadState('error');
        setDownloading(null);
        downloadingRef.current = null;
        notif.error(`Download gagal`);
        setTimeout(() => {
          setDownloadState('idle');
          setDownloadProgress(0);
          setDownloadedBytes(0);
          setTotalBytes(0);
        }, 3000);
      }

      if (state === 'completed') {
        const completedModel = downloadingRef.current;
        setDownloading(null);
        downloadingRef.current = null;
        setDownloadState('completed');
        setDownloadProgress(100);

        if (completedModel) {
          notif.success(`${completedModel} berhasil di-download!`);
          loadData();
          window.electronAPI.updateSetting('llm_model', completedModel).then(() => {
            window.electronAPI.updateSetting('llm_postprocess', 'true').then(() => {
              setSettings(prev => ({ ...prev, llm_model: completedModel, llm_postprocess: 'true' }));
              notif.success('LLM Post-Processing diaktifkan!');
            });
          });
        }

        setTimeout(() => {
          setDownloadState('idle');
          setDownloadProgress(0);
          setDownloadedBytes(0);
          setTotalBytes(0);
        }, 2000);
      }
    });

    return () => { unsub(); };
  }, []);

  const handleDownload = async (modelName: string) => {
    setDownloading(modelName);
    downloadingRef.current = modelName;
    setDownloadProgress(0);
    setDownloadedBytes(0);
    const modelInfo = AVAILABLE_LLM_MODELS.find(m => m.name === modelName);
    setTotalBytes(modelInfo?.sizeBytes || 0);
    setDownloadState('starting');

    try {
      const result = await window.electronAPI.llmDownloadModel(modelName);
      if (!result.success) {
        notif.error(result.error || 'Download gagal');
        setDownloading(null);
        downloadingRef.current = null;
        setDownloadState('idle');
      }
    } catch (err: any) {
      notif.error(err.message || 'Download gagal');
      setDownloading(null);
      downloadingRef.current = null;
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

  const handleChooseFolder = async () => {
    try {
      const result = await window.electronAPI.llmChooseModelsFolder();
      if (result.success && result.path) {
        setModelsPath(result.path);
        notif.success(`Folder LLM models: ${result.path}`);
      }
    } catch {
      notif.error('Gagal memilih folder');
    }
  };

  const handleScanFolder = async () => {
    setScanning(true);
    try {
      const result = await window.electronAPI.llmScanModelsFolder();
      if (result.success && result.models) {
        setDownloadedModels(result.models);
        const modelNames = result.models.map(m => m.name).join(', ');
        if (result.models.length > 0) {
          notif.info(`Folder OK — ${result.models.length} model tersedia: ${modelNames}`);
        } else {
          notif.warning('Tidak ada model LLM (*.gguf) ditemukan di folder ini');
        }
      } else {
        notif.error('Gagal scan folder');
      }
    } catch {
      notif.error('Gagal scan folder');
    } finally {
      setScanning(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (downloaded: number, total: number): string => {
    if (total <= 0) return `${formatBytes(downloaded)}`;
    return `${formatBytes(downloaded)} / ${formatBytes(total)}`;
  };

  const getIcon = (name: string) => {
    if (name.includes('qwen2.5-0.5b')) return 'Q';
    if (name.includes('tinyllama')) return 'T';
    if (name.includes('phi-2')) return 'P';
    return '?';
  };

  const getLabel = (name: string) => {
    if (name.includes('qwen2.5-0.5b-instruct-q4')) return 'Qwen 2.5 0.5B Q4';
    if (name.includes('qwen2.5-0.5b-instruct-q3')) return 'Qwen 2.5 0.5B Q3';
    if (name.includes('tinyllama-1.1b-chat-q4')) return 'TinyLlama 1.1B Q4';
    if (name.includes('phi-2-q4')) return 'Phi-2 2.7B Q4';
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
                : 'Download llama-cli.zip dari GitHub release llama.cpp, extract ke resources/llm/'}
            </span>
          </div>
          <div className="active-model-speed" style={{ gap: '8px' }}>
            {!hasCli ? (
              <span style={{ color: '#f87171', fontSize: '13px', maxWidth: '200px', textAlign: 'right' }}>
                Klik Settings &gt; LLM &gt; Download Binary
              </span>
            ) : activeModel && (
              <>
                <Iconify icon="spark" size={14} />
                <span>{getLabel(activeModel)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* LLM Models Save Location */}
      <div className="info-card">
        <div className="info-card-row">
          <div>
            <span className="info-label">📂 Lokasi Simpan:</span>
            <span className="info-value info-path" title={modelsPath}>{modelsPath}</span>
          </div>
          <div className="info-card-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleChooseFolder}>
              <Iconify icon="folder" size={14} /> Pilih Folder
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleScanFolder}
              disabled={scanning}
            >
              {scanning ? (
                <><span className="btn-spinner" /> Scanning...</>
              ) : (
                <><Iconify icon="scan" size={14} /> Scan Folder</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Download Progress */}
      {downloading && (
        <div className={`download-progress-card ${downloadState === 'error' ? 'paused' : ''} ${downloadState === 'completed' ? 'finalizing' : ''}`}>
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
              <div
                className={`download-progress-bar ${downloadState === 'error' ? 'paused' : ''} ${downloadState === 'completed' ? 'finalizing' : ''}`}
                style={{ width: `${Math.max(2, downloadProgress)}%` }}
              />
            </div>
          </div>
          <div className="download-progress-stats">
            {downloadState === 'starting' && <span>Starting download...</span>}
            {downloadState === 'downloading' && (
              <span>Downloading: {formatSpeed(downloadedBytes, totalBytes)}</span>
            )}
            {downloadState === 'error' && <span style={{ color: '#f87171' }}>Download gagal</span>}
            {downloadState === 'completed' && <span style={{ color: '#4ade80' }}>Selesai!</span>}
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
