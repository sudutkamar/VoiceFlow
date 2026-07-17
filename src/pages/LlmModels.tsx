import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNotification } from '../components/Notification';
import { Iconify } from '../utils/icons';
import { logError, logWarning } from '../utils/errorHandler';

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
    description: '⭐ Rekomendasi: Qwen 0.5B Q4 — grammar + punctuation fix',
  },
  {
    name: 'qwen2.5-0.5b-instruct-q3_k_m.gguf',
    size: '280 MB',
    sizeBytes: 280000000,
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q3_K_M.gguf',
    description: 'Qwen 0.5B Q3 — lebih kecil, grammar fix dasar',
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

type DownloadType = 'binary' | 'model';

interface DownloadState {
  type: DownloadType | null;
  modelName: string;
  progress: number;
  state: string; // idle | starting | downloading | paused | extracting | completed | error | cancelled
  downloadedBytes: number;
  totalBytes: number;
}

function LlmModels({ onSuccess, onError }: LlmModelsProps) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [downloadedModels, setDownloadedModels] = useState<Array<{ name: string; sizeBytes: number }>>([]);
  const [modelsPath, setModelsPath] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [hasCli, setHasCli] = useState(false);
  const [binaryDownloaded, setBinaryDownloaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dl, setDl] = useState<DownloadState>({
    type: null, modelName: '', progress: 0, state: 'idle',
    downloadedBytes: 0, totalBytes: 0,
  });
  const notif = useNotification();
  const dlRef = useRef<DownloadState>(dl);
  const mountedRef = useRef(true);

  // Keep ref in sync
  useEffect(() => { dlRef.current = dl; }, [dl]);

  // ─── Load all data ───
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [result, s, p, dstate] = await Promise.all([
        window.electronAPI.llmCheckAvailability(),
        window.electronAPI.getSettings(),
        window.electronAPI.llmGetModelsPath(),
        window.electronAPI.llmGetDownloadState(),
      ]);

      // Binary download state
      let binaryState = { state: 'idle', progress: 0, downloadedBytes: 0, totalBytes: 0 };
      try { binaryState = await window.electronAPI.llmGetBinaryDownloadState(); } catch {}

      setHasCli(result.hasCli);
      setBinaryDownloaded(!!result.binaryDownloaded);
      if (result.models) setDownloadedModels(result.models);
      setSettings(s);
      setModelsPath(p || '(belum tersedia)');

      // Restore model download state
      if (dstate && (dstate.state === 'downloading' || dstate.state === 'paused')) {
        setDl({
          type: 'model', modelName: dstate.modelName || '',
          progress: dstate.progress || 0, state: dstate.state,
          downloadedBytes: dstate.downloadedBytes || 0, totalBytes: dstate.totalBytes || 0,
        });
      }

      // Restore binary download state
      if (binaryState && (binaryState.state === 'downloading' || binaryState.state === 'paused')) {
        setDl({
          type: 'binary', modelName: 'llama-cli',
          progress: binaryState.progress || 0, state: binaryState.state,
          downloadedBytes: binaryState.downloadedBytes || 0, totalBytes: binaryState.totalBytes || 0,
        });
      }
    } catch (err: any) {
      logError('LlmModels', err);
      if (!silent) setModelsPath('Gagal memuat');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ─── Subscribe to progress from BOTH channels ───
  useEffect(() => {
    // Model download progress
    const modelHandler = (data: any) => {
      if (!mountedRef.current) return;
      const { progress, state, downloadedBytes: dlBytes, totalBytes: tBytes, modelName } = data;

      setDl(prev => ({
        ...prev,
        type: 'model',
        modelName: modelName || prev.modelName,
        progress,
        state: state === 'cancelled' ? 'idle' : state,
        downloadedBytes: dlBytes ?? prev.downloadedBytes,
        totalBytes: tBytes ?? prev.totalBytes,
      }));

      if (state === 'completed') {
        notif.success(`Model selesai di-download!`);
        loadData(true);
        setTimeout(() => {
          if (mountedRef.current) setDl({ type: null, modelName: '', progress: 0, state: 'idle', downloadedBytes: 0, totalBytes: 0 });
        }, 3000);
      }
      if (state === 'error') {
        notif.error('Download model gagal');
        setTimeout(() => {
          if (mountedRef.current) setDl(prev => prev.type === 'model' ? { ...prev, state: 'idle' } : prev);
        }, 3000);
      }
      if (state === 'cancelled') {
        setDl(prev => prev.type === 'model' ? { ...prev, state: 'idle', progress: 0, downloadedBytes: 0, totalBytes: 0 } : prev);
      }
    };

    const unsub1 = window.electronAPI.onLlmDownloadProgress(modelHandler);
    const unsub2 = window.electronAPI.onDownloadProgress((data: any) => {
      if (data.type === 'llm') modelHandler(data);
    });

    // Binary download progress
    const binaryHandler = (data: any) => {
      if (!mountedRef.current) return;
      const { progress, state, downloadedBytes, totalBytes } = data;

      setDl(prev => ({
        ...prev,
        type: 'binary',
        modelName: 'llama-cli',
        progress,
        state: state === 'cancelled' ? 'idle' : state,
        downloadedBytes: downloadedBytes ?? prev.downloadedBytes,
        totalBytes: totalBytes ?? prev.totalBytes,
      }));

      if (state === 'completed') {
        notif.success('llama-cli berhasil di-download!');
        setHasCli(true);
        setBinaryDownloaded(true);
        loadData(true);
        setTimeout(() => {
          if (mountedRef.current) setDl({ type: null, modelName: '', progress: 0, state: 'idle', downloadedBytes: 0, totalBytes: 0 });
        }, 3000);
      }
      if (state === 'extracting') {
        notif.info('Mengekstrak llama-cli...');
      }
      if (state === 'error') {
        notif.error('Download llama-cli gagal');
        setTimeout(() => {
          if (mountedRef.current) setDl(prev => prev.type === 'binary' ? { ...prev, state: 'idle' } : prev);
        }, 3000);
      }
      if (state === 'cancelled') {
        setDl(prev => prev.type === 'binary' ? { ...prev, state: 'idle', progress: 0, downloadedBytes: 0, totalBytes: 0 } : prev);
      }
    };

    // Binary download progress (gunakan optional chaining untuk safety)
    const binarySub = window.electronAPI.onLlmBinaryDownloadProgress?.(binaryHandler);
    const unsub3 = binarySub || (() => {});

    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  // ─── Download Binary ───
  const handleDownloadBinary = async () => {
    setDl({
      type: 'binary', modelName: 'llama-cli',
      progress: 0, state: 'starting',
      downloadedBytes: 0, totalBytes: 0,
    });

    try {
      // Method ini ada di preload.ts — restart app jika error
      const result = await window.electronAPI.llmDownloadBinary();
      if (!result.success && mountedRef.current) {
        if (dlRef.current.type === 'binary') {
          notif.error(result.error || 'Download binary gagal');
          setDl(prev => prev.type === 'binary' ? { ...prev, state: 'idle' } : prev);
        }
      }
    } catch (err: any) {
      if (mountedRef.current && dlRef.current.type === 'binary') {
        notif.error(err.message || 'Download binary gagal');
        setDl(prev => prev.type === 'binary' ? { ...prev, state: 'idle' } : prev);
      }
    }
  };

  // ─── Cancel Binary ───
  const handleCancelBinary = async () => {
    try {
      await window.electronAPI.llmCancelBinaryDownload();
    } catch (err) {
      logError('LlmModels', err);
    }
    setDl({ type: null, modelName: '', progress: 0, state: 'idle', downloadedBytes: 0, totalBytes: 0 });
    notif.info('Download binary dibatalkan');
  };

  // ─── Download Model ───
  const handleDownloadModel = async (modelName: string) => {
    setDl({
      type: 'model', modelName,
      progress: 0, state: 'starting',
      downloadedBytes: 0,
      totalBytes: AVAILABLE_LLM_MODELS.find(m => m.name === modelName)?.sizeBytes || 0,
    });

    try {
      const result = await window.electronAPI.llmDownloadModel(modelName);
      if (!result.success && mountedRef.current) {
        if (dlRef.current.type === 'model' && dlRef.current.modelName === modelName) {
          notif.error(result.error || 'Download gagal');
          setDl(prev => prev.type === 'model' && prev.modelName === modelName ? { ...prev, state: 'idle' } : prev);
        }
      }
    } catch (err: any) {
      if (mountedRef.current && dlRef.current.type === 'model' && dlRef.current.modelName === modelName) {
        notif.error(err.message || 'Download gagal');
        setDl(prev => prev.type === 'model' && prev.modelName === modelName ? { ...prev, state: 'idle' } : prev);
      }
    }
  };

  // ─── Pause / Resume / Cancel Model ───
  const handlePauseModel = async () => {
    await window.electronAPI.llmPauseDownload();
    setDl(prev => ({ ...prev, state: 'paused' }));
  };

  const handleResumeModel = async () => {
    await window.electronAPI.llmResumeDownload();
    // Without true resume support: restart
    const modelName = dlRef.current.modelName;
    if (!modelName) return;
    setDl(prev => ({ ...prev, state: 'starting', progress: 0, downloadedBytes: 0 }));
    try {
      const result = await window.electronAPI.llmDownloadModel(modelName);
      if (!result.success && mountedRef.current) {
        notif.error(result.error || 'Download gagal');
        setDl(prev => prev.type === 'model' && prev.modelName === modelName ? { ...prev, state: 'idle' } : prev);
      }
    } catch (err: any) {
      notif.error(err.message || 'Download gagal');
      setDl(prev => prev.type === 'model' && prev.modelName === modelName ? { ...prev, state: 'idle' } : prev);
    }
  };

  const handleCancelModel = async () => {
    await window.electronAPI.llmCancelDownload();
    setDl({ type: null, modelName: '', progress: 0, state: 'idle', downloadedBytes: 0, totalBytes: 0 });
    notif.info('Download model dibatalkan');
  };

  // ─── Unified Cancel ───
  const handleCancel = () => {
    if (dl.type === 'binary') handleCancelBinary();
    else if (dl.type === 'model') handleCancelModel();
  };

  // ─── Delete ───
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
        loadData(true);
      } else {
        notif.error(result.error || 'Gagal menghapus');
      }
    } catch (err: any) {
      notif.error(err.message || 'Gagal menghapus');
    }
    setConfirmDelete(null);
  };

  // ─── Select ───
  const handleSelect = async (modelName: string) => {
    await window.electronAPI.updateSetting('llm_model', modelName);
    await window.electronAPI.updateSetting('llm_postprocess', 'true');
    setSettings(prev => ({ ...prev, llm_model: modelName, llm_postprocess: 'true' }));
    notif.success(`LLM Model: ${modelName}`);
  };

  // ─── Folder ───
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
        if (result.models.length > 0) {
          notif.info(`Folder OK — ${result.models.length} model tersedia`);
        } else {
          notif.warning('Tidak ada model LLM (*.gguf) ditemukan');
        }
      }
    } catch {
      notif.error('Gagal scan folder');
    } finally {
      setScanning(false);
    }
  };

  // ─── Helpers ───
  const formatBytes = (b: number): string => {
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getLabel = (name: string) => {
    if (name.includes('qwen2.5-0.5b-instruct-q4')) return 'Qwen 2.5 0.5B Q4';
    if (name.includes('qwen2.5-0.5b-instruct-q3')) return 'Qwen 2.5 0.5B Q3';
    if (name.includes('tinyllama-1.1b-chat-q4')) return 'TinyLlama 1.1B Q4';
    if (name.includes('phi-2-q4')) return 'Phi-2 2.7B Q4';
    if (name === 'llama-cli') return 'llama.cpp Binary';
    return name.replace('.gguf', '');
  };

  const getIcon = (name: string) => {
    if (name.includes('qwen')) return 'Q';
    if (name.includes('tinyllama')) return 'T';
    if (name.includes('phi-2')) return 'P';
    if (name === 'llama-cli') return '⚡';
    return '?';
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'starting': return 'download';
      case 'downloading': return 'download';
      case 'extracting': return 'scan';
      case 'paused': return 'pause';
      case 'completed': return 'success';
      case 'error': return 'error';
      default: return 'download';
    }
  };

  const getStateLabel = (state: string, dl: DownloadState) => {
    switch (state) {
      case 'starting': return 'Memulai download...';
      case 'downloading': return `Download: ${formatBytes(dl.downloadedBytes)} / ${formatBytes(dl.totalBytes)}`;
      case 'extracting': return 'Mengekstrak...';
      case 'paused': return 'Download dijeda';
      case 'completed': return 'Selesai!';
      case 'error': return 'Download gagal';
      default: return '';
    }
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
  const isDownloadingBinary = dl.type === 'binary';
  const isDownloadingModel = dl.type === 'model';

  return (
    <div className="page">
      <div className="page-header">
        <h1>LLM Models</h1>
        <p className="page-subtitle">AI models untuk grammar &amp; punctuation fix pada hasil transkripsi (dijalankan SEBELUM TextCleaner)</p>
      </div>

      {/* Step 1: Binary Card */}
      <div className={`info-card ${hasCli ? '' : 'warning'}`}>
        <div className="active-model-info">
          <div className="active-model-icon" style={{ color: hasCli ? '#4ade80' : '#f87171' }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{hasCli ? '✅' : '⚠️'}</span>
          </div>
          <div className="active-model-details">
            <span className="active-model-name">
              {hasCli ? 'llama-cli.exe ready' : 'llama-cli.exe belum ada'}
            </span>
            <span className="active-model-file">
              {hasCli
                ? `Binary: ${downloadedModels.length} model · ${llmEnabled ? 'LLM aktif' : 'LLM nonaktif'}`
                : 'Download otomatis llama.cpp binary (18MB ZIP, extract ke resources/llm/)'}
            </span>
          </div>
          <div className="active-model-speed" style={{ gap: '8px' }}>
            {!hasCli && !isDownloadingBinary ? (
              <button className="btn btn-primary" onClick={handleDownloadBinary}>
                <Iconify icon="download" size={14} /> Download Binary
              </button>
            ) : hasCli ? (
              activeModel ? (
                <>
                  <Iconify icon="spark" size={14} />
                  <span>{getLabel(activeModel)}</span>
                </>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>Pilih model di bawah</span>
              )
            ) : null}
          </div>
        </div>
      </div>

      {/* Download Progress (unified) */}
      {dl.type && dl.state !== 'idle' && dl.state !== 'completed' && dl.state !== 'cancelled' && (
        <div className={`download-progress-card ${dl.state === 'paused' ? 'paused' : ''} ${dl.state === 'error' ? 'paused' : ''}`}>
          <div className="download-progress-header">
            <div className="download-progress-info">
              <span className="download-model-name">
                <Iconify icon={getStateIcon(dl.state) as any} size={14} />
                {' '}{getLabel(dl.modelName)}
              </span>
              <span className="download-progress-percent">
                {dl.state === 'extracting' ? '--%' : `${Math.round(dl.progress)}%`}
              </span>
            </div>
            <div className="download-progress-actions">
              {dl.state === 'downloading' || dl.state === 'starting' ? (
                <>
                  {dl.type === 'model' && (
                    <button className="btn btn-sm btn-icon" onClick={handlePauseModel} title="Pause">
                      <Iconify icon="pause" size={14} />
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger btn-icon" onClick={handleCancel} title="Cancel">
                    <Iconify icon="cancel" size={14} />
                  </button>
                </>
              ) : dl.state === 'paused' ? (
                <>
                  <button className="btn btn-sm btn-primary" onClick={handleResumeModel} title="Resume">
                    <Iconify icon="resume" size={14} />
                  </button>
                  <button className="btn btn-sm btn-danger btn-icon" onClick={handleCancel} title="Cancel">
                    <Iconify icon="cancel" size={14} />
                  </button>
                </>
              ) : dl.state === 'error' ? (
                <button className="btn btn-sm btn-danger" onClick={handleCancel} title="Dismiss">
                  <Iconify icon="cancel" size={14} /> Dismiss
                </button>
              ) : null}
            </div>
          </div>
          <div className="download-progress-bar-wrap">
            <div className="download-progress-track">
              <div
                className={`download-progress-bar ${dl.state === 'paused' ? 'paused' : ''} ${dl.state === 'extracting' ? 'finalizing' : ''}`}
                style={{ width: `${dl.state === 'extracting' ? 100 : Math.max(2, dl.progress)}%` }}
              />
            </div>
          </div>
          <div className="download-progress-stats">
            <span className={`download-state ${dl.state === 'paused' ? 'paused' : ''} ${dl.state === 'error' ? 'paused' : ''}`}
              style={{
                color: dl.state === 'paused' ? '#fbbf24' : dl.state === 'error' ? '#f87171' : dl.state === 'extracting' ? '#4a9eff' : '#94a3b8'
              }}>
              {getStateLabel(dl.state, dl)}
            </span>
          </div>
        </div>
      )}

      {/* Folder Path */}
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
            <button className="btn btn-secondary btn-sm" onClick={handleScanFolder} disabled={scanning}>
              {scanning ? (
                <><span className="btn-spinner" /> Scanning...</>
              ) : (
                <><Iconify icon="scan" size={14} /> Scan Folder</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Models List */}
      <div className="card-list">
        {AVAILABLE_LLM_MODELS.map((model) => {
          const isDownloaded = downloadedModels.some(dm => dm.name === model.name);
          const isActive = activeModel === model.name;
          const isDownloading = isDownloadingModel && dl.modelName === model.name;
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
                      <button className="btn btn-primary" onClick={() => handleSelect(model.name)} disabled={!!dl.type}>
                        <Iconify icon="check" size={14} /> Use
                      </button>
                    )}
                    <button className="btn btn-danger btn-icon" onClick={() => setConfirmDelete(model.name)} title="Hapus model">
                      <Iconify icon="delete" />
                    </button>
                  </div>
                ) : isDownloading ? (
                  <div className="downloading-indicator">
                    <div className="mini-spinner" />
                    <span>{Math.round(dl.progress)}%</span>
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={() => handleDownloadModel(model.name)}
                    disabled={!!dl.type || !hasCli} title={!hasCli ? 'Download binary dulu' : ''}>
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
          <li><strong>Step 1:</strong> Klik "Download Binary" untuk download llama-cli.exe (18MB, sekali saja)</li>
          <li><strong>Step 2:</strong> Download salah satu model GGUF dari HuggingFace</li>
          <li><strong>Step 3:</strong> Model otomatis diaktifkan sebagai LLM grammar fix</li>
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
