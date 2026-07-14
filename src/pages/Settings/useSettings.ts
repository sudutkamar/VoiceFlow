/**
 * Shared hook for Settings page - loads and saves settings.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { SettingsData, DictEntry, SnippetEntry, GpuStatus, CudaDownloadState, LearnedCorrection, AdaptiveStats } from './types';
import { filterRealMics } from '../../utils/micDetector';

export function useSettings(onSuccess: (msg: string) => void, onError: (msg: string) => void) {
  const [settings, setSettings] = useState<SettingsData>({});
  const [dict, setDict] = useState<DictEntry[]>([]);
  const [snippets, setSnippets] = useState<SnippetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [learnedCorrections, setLearnedCorrections] = useState<LearnedCorrection[]>([]);
  const [adaptiveStats, setAdaptiveStats] = useState<AdaptiveStats | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [cudaDownload, setCudaDownload] = useState<CudaDownloadState | null>(null);
  const [availableModels, setAvailableModels] = useState<{ name: string; downloaded?: boolean }[]>([]);
  const [appVersion, setAppVersion] = useState('');
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cudaPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
      if (cudaPollRef.current) clearInterval(cudaPollRef.current);
    };
  }, []);

  useEffect(() => {
    loadData();
    loadMics();
    loadGpuStatus();
    loadModels();
    loadVersion();
    loadLearnedCorrections();
  }, []);

  const loadData = async () => {
    try {
      const s = await window.electronAPI.getSettings();
      setSettings(s);
      window.voiceflowSoundEnabled = s.sound_effects !== 'false';
      if (s.theme === 'light') {
        document.documentElement.classList.add('light-theme');
      }
      const d = await window.electronAPI.getDictionary();
      setDict(d);
      const sn = await window.electronAPI.getSnippets();
      setSnippets(sn);
    } catch (err) {
      console.warn('[Settings] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMics = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const allMics = devices.filter(d => d.kind === 'audioinput');
      // Store ALL mics (components will filter as needed)
      setMics(allMics);
    } catch (err) {
      console.warn('[Settings] Failed to load mics:', err);
    }
  };

  const loadGpuStatus = async () => {
    try {
      const status = await window.electronAPI.getGpuStatus();
      setGpuStatus(status);
    } catch (err) {
      console.warn('[Settings] Failed to load GPU status:', err);
    }
  };

  const loadModels = async () => {
    try {
      const models = await window.electronAPI.getAvailableModels();
      setAvailableModels(models);
    } catch (err) {
      console.warn('[Settings] Failed to load models:', err);
    }
  };

  const loadVersion = async () => {
    try {
      const v = await window.electronAPI.getVersion?.();
      setAppVersion(v || '1.0.0');
    } catch (err) {
      setAppVersion('1.0.0');
    }
  };

  const loadLearnedCorrections = async () => {
    try {
      const corrections = await window.electronAPI.getLearnedCorrections();
      setLearnedCorrections(corrections);
      const stats = await window.electronAPI.getAdaptiveStats();
      setAdaptiveStats(stats);
    } catch (err) {
      console.warn('[Settings] Failed to load learned corrections:', err);
    }
  };

  const save = async (key: string, value: string) => {
    try {
      await window.electronAPI.updateSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      onError(`Failed to save ${key}`);
    }
  };

  const toggle = (key: string) => {
    const current = settings[key];
    const next = current === 'false' ? 'true' : 'false';
    save(key, next);
  };

  return {
    settings, setSettings,
    dict, setDict,
    snippets, setSnippets,
    loading,
    learnedCorrections, setLearnedCorrections,
    adaptiveStats,
    mics,
    gpuStatus, setGpuStatus,
    cudaDownload, setCudaDownload,
    availableModels,
    appVersion,
    promptTimerRef,
    cudaPollRef,
    save, toggle,
    loadData, loadMics, loadGpuStatus, loadModels, loadVersion, loadLearnedCorrections,
  };
}
