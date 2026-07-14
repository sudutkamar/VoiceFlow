/**
 * Shared types for Settings page.
 */

export interface SettingsProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export interface DictEntry {
  id: string;
  phrase: string;
  replacement: string;
}

export interface SnippetEntry {
  id: string;
  trigger_phrase: string;
  output_text: string;
}

export interface SettingsData {
  [key: string]: string;
}

export interface GpuStatus {
  hasGpu: boolean;
  mode: string;
  cudaDllsPresent?: boolean;
  needsDownload?: boolean;
  downloadUrl?: string;
  whisperDir?: string;
  cpuDir?: string;
  gpuDir?: string;
}

export interface CudaDownloadState {
  state: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface LearnedCorrection {
  id: string;
  original: string;
  corrected: string;
  count: number;
  frequency: number;
}

export interface AdaptiveStats {
  total: number;
  totalFrequency: number;
  avgConfidence: number;
}
