/**
 * Model definitions for Whisper models.
 * Single source of truth for available models.
 */

export interface ModelInfo {
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  description: string;
  isKnown: boolean;
  downloaded?: boolean;
  fileSize?: number;
  isValid?: boolean;
  sha256?: string;
}

// NOTE: SHA256 hashes are left as null for now.
// To generate: certUtil -hashfile <model.bin> SHA256
// Fill in after verifying against HuggingFace published hashes.
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    name: 'ggml-tiny.bin',
    size: '75 MB',
    sizeBytes: 75000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    description: 'Tercepat, akurasi rendah',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-base.bin',
    size: '142 MB',
    sizeBytes: 142000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    description: 'Seimbang untuk daily use',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-base-q5_1.bin',
    size: '57 MB',
    sizeBytes: 57000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    description: 'Base yang lebih kecil & cepat (quantized)',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3-turbo-q5_0.bin',
    size: '548 MB',
    sizeBytes: 548000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    description: '⭐ REKOMENDASI: Akurasi tinggi + cepat (daily use)',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3-turbo-q8_0.bin',
    size: '834 MB',
    sizeBytes: 834000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin',
    description: 'Large v3 Turbo Q8 — akurasi lebih baik dari Q5',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3-q5_0.bin',
    size: '1.1 GB',
    sizeBytes: 1100000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin',
    description: '🏆 AKURASI TERTINGGI: Large v3 penuh (quantized)',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-small.bin',
    size: '466 MB',
    sizeBytes: 466000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    description: 'Lebih akurat, cocok untuk bahasa campuran',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-medium.bin',
    size: '1.5 GB',
    sizeBytes: 1500000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    description: 'Sangat akurat untuk semua bahasa',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3-turbo.bin',
    size: '1.5 GB',
    sizeBytes: 1500000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    description: '⭐ Akurasi tinggi + cepat (recommended)',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3.bin',
    size: '3.1 GB',
    sizeBytes: 3100000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    description: 'Akurasi tertinggi, butuh RAM besar',
    isKnown: true,
    sha256: undefined,
  },
];

export const MIN_VALID_MODEL_SIZE = 10 * 1024 * 1024;
