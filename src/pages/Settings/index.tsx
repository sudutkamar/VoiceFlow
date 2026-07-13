/**
 * Settings — Main settings page with tab navigation.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useSettings } from './useSettings';
import { GeneralTab } from './GeneralTab';
import { RecordingTab } from './RecordingTab';
import { ProcessingTab } from './ProcessingTab';
import { PresetsTab } from './PresetsTab';
import { DictionaryTab } from './DictionaryTab';
import { SnippetsTab } from './SnippetsTab';
import { LearningTab } from './LearningTab';
import { Iconify } from '../../utils/icons';

interface SettingsProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type TabId = 'general' | 'recording' | 'processing' | 'presets' | 'dictionary' | 'snippets' | 'learning';

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'recording', label: 'Recording' },
  { id: 'processing', label: 'Processing' },
  { id: 'presets', label: 'Presets' },
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'snippets', label: 'Snippets' },
  { id: 'learning', label: 'Learning' },
];

function Settings({ onSuccess, onError }: SettingsProps) {
  const [tab, setTab] = useState<TabId>('general');
  const [confirmDeleteEngine, setConfirmDeleteEngine] = useState<'cpu' | 'gpu' | null>(null);

  const {
    settings, setSettings,
    dict, setDict,
    snippets, setSnippets,
    loading,
    learnedCorrections,
    adaptiveStats,
    mics,
    gpuStatus, setGpuStatus,
    cudaDownload, setCudaDownload,
    availableModels,
    cudaPollRef,
    save, toggle,
    loadGpuStatus, loadLearnedCorrections,
  } = useSettings(onSuccess, onError);

  // CUDA download progress listener
  useEffect(() => {
    const unsub = window.electronAPI.onCudaDownloadProgress((data) => {
      setCudaDownload(data);
      if (data.state === 'completed') {
        if (cudaPollRef.current) clearInterval(cudaPollRef.current);
        cudaPollRef.current = null;
        loadGpuStatus();
        onSuccess('CUDA berhasil di-download dan di-extract!');
      } else if (data.state === 'error') {
        if (cudaPollRef.current) clearInterval(cudaPollRef.current);
        cudaPollRef.current = null;
        onError('CUDA download gagal');
      }
    });
    return unsub;
  }, []);

  const confirmDeleteEngineAction = useCallback(async () => {
    if (!confirmDeleteEngine) return;
    try {
      await window.electronAPI.deleteWhisperEngine?.(confirmDeleteEngine);
      setConfirmDeleteEngine(null);
      loadGpuStatus();
      onSuccess(`${confirmDeleteEngine === 'cpu' ? 'CPU' : 'GPU'} engine deleted`);
    } catch (err: any) {
      onError(err.message || 'Failed to delete engine');
    }
  }, [confirmDeleteEngine, loadGpuStatus, onSuccess, onError]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-loading">
          <div className="spinner-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      {/* Tabs */}
      <div
        className="tabs"
        onKeyDown={(e) => {
          const tabIds = TABS.map(t => t.id);
          const idx = tabIds.indexOf(tab);
          if (e.key === 'ArrowRight' && idx < tabIds.length - 1) {
            e.preventDefault();
            setTab(tabIds[idx + 1]);
          }
          if (e.key === 'ArrowLeft' && idx > 0) {
            e.preventDefault();
            setTab(tabIds[idx - 1]);
          }
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'general' && (
        <GeneralTab
          settings={settings}
          save={save}
          toggle={toggle}
          gpuStatus={gpuStatus}
          setGpuStatus={setGpuStatus}
          cudaDownload={cudaDownload}
          setCudaDownload={setCudaDownload}
          cudaPollRef={cudaPollRef}
          onSuccess={onSuccess}
          onError={onError}
          onDeleteEngine={setConfirmDeleteEngine}
        />
      )}

      {tab === 'recording' && (
        <RecordingTab
          settings={settings}
          save={save}
          mics={mics}
          availableModels={availableModels}
          loadMics={async () => {
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              // Will be set by parent
            } catch (err) {
              console.warn('[Settings] Failed to load mics:', err);
            }
          }}
          onSuccess={onSuccess}
        />
      )}

      {tab === 'processing' && (
        <ProcessingTab
          settings={settings}
          setSettings={setSettings}
          save={save}
          toggle={toggle}
          onSuccess={onSuccess}
        />
      )}

      {tab === 'presets' && (
        <PresetsTab settings={settings} save={save} onSuccess={onSuccess} />
      )}

      {tab === 'dictionary' && (
        <DictionaryTab
          dict={dict}
          setDict={setDict}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}

      {tab === 'snippets' && (
        <SnippetsTab
          snippets={snippets}
          setSnippets={setSnippets}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}

      {tab === 'learning' && (
        <LearningTab
          learnedCorrections={learnedCorrections}
          adaptiveStats={adaptiveStats}
          loadLearnedCorrections={loadLearnedCorrections}
          onSuccess={onSuccess}
        />
      )}

      {/* Delete Engine Confirmation Modal */}
      {confirmDeleteEngine && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteEngine(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Hapus {confirmDeleteEngine === 'cpu' ? 'CPU Engine' : 'GPU / CUDA'}</h3>
            <p>
              Yakin ingin menghapus semua file <strong>{confirmDeleteEngine === 'cpu' ? 'Whisper CPU' : 'CUDA GPU'}</strong>?
            </p>
            <p className="text-warning">
              {confirmDeleteEngine === 'cpu'
                ? 'Aplikasi tidak bisa transcribe tanpa CPU engine. Download ulang diperlukan.'
                : 'GPU acceleration tidak akan aktif. Download ulang CUDA jika ingin GPU lagi.'}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDeleteEngine(null)}>
                <Iconify icon="cancel" size={14} /> Batal
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteEngineAction}>
                <Iconify icon="delete" size={14} /> Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
