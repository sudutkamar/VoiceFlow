# Whisper Resources Setup

## Required Files

### 1. whisper-cli.exe + DLLs

Download dari **GitHub Releases**:
1. Buka: https://github.com/ggerganov/whisper.cpp/releases
2. Cari file `whisper-*.zip` atau `whisper-bin-*.zip`
3. Extract file CPU ke `resources/whisper/cpu/` dan GPU ke `resources/whisper/gpu/`

**Atau** build dari source:
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
cmake -B build
cmake --build build --config Release
# Copy build/bin/Release/whisper-cli.exe dan semua DLL ke folder cpu/ atau gpu/
```

#### DLL Files yang Dibutuhkan

| File | Required | Notes |
|------|----------|-------|
| `whisper-cli.exe` | ✅ | Main executable (letakkan di `cpu/`) |
| `whisper.dll` | ✅ | Core whisper library (letakkan di `cpu/`) |
| `ggml.dll` | ✅ | GGML tensor library (letakkan di `cpu/`) |
| `ggml-cpu-*.dll` | ✅ | CPU backend (letakkan di `cpu/`) |
| `ggml-base.dll` | ✅ | Base GGML functions (letakkan di `cpu/`) |
| `ggml-cuda.dll` | ⚡ Optional | NVIDIA GPU support (letakkan di `gpu/`) |
| `cublas64_12.dll` | ⚡ Optional | NVIDIA cuBLAS (letakkan di `gpu/`) |
| `cublasLt64_12.dll` | ⚡ Optional | NVIDIA cuBLAS (letakkan di `gpu/`) |
| `cudart64_12.dll` | ⚡ Optional | NVIDIA CUDA Runtime (letakkan di `gpu/`) |

> 💡 **GPU Support**: Jika punya NVIDIA GPU, install [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) dan copy DLL CUDA files. Transkripsi akan jauh lebih cepat!

### 2. Whisper Model

Download model dan simpan di folder `models/`:

| Model | Size | Speed | Accuracy | Recommendation |
|-------|------|-------|----------|----------------|
| `ggml-tiny.bin` | 75 MB | ⚡ Sangat cepat | Rendah | Testing, PC lama |
| `ggml-base.bin` | 142 MB | ✅ Cepat | Sedang | **Daily use (recommended)** |
| `ggml-small.bin` | 466 MB | 🐢 Sedang | Tinggi | Bahasa campuran |
| `ggml-medium.bin` | 1.5 GB | 🐌 Lambat | Sangat tinggi | Akurasi tinggi |
| `ggml-large-v3-turbo.bin` | 1.5 GB | ✅ Cepat | ⭐ Tertinggi | **Best quality** |
| `ggml-large-v3.bin` | 3.1 GB | 🐌 Sangat lambat | Tertinggi | Akurasi maksimal |

Download dari: https://huggingface.co/ggerganov/whisper.cpp/tree/main

Direct download links:
- tiny: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
- base: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
- small: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
- medium: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
- large-v3-turbo: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
- large-v3: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin

> 💡 Atau download dari dalam aplikasi: **Settings > Models**

## Folder Structure

```
resources/whisper/
├── cpu/                        # CPU files
│   ├── whisper-cli.exe         # Main executable
│   ├── whisper.dll             # Core library
│   ├── ggml.dll                # GGML library
│   ├── ggml-cpu-*.dll          # CPU backends
│   └── ggml-base.dll           # Base functions
├── gpu/                        # (optional) NVIDIA GPU
│   ├── ggml-cuda.dll           # GPU support
│   ├── cublas64_12.dll         # NVIDIA cuBLAS
│   ├── cublasLt64_12.dll       # NVIDIA cuBLAS
│   └── cudart64_12.dll         # CUDA Runtime
├── README.md                   # This file
└── models/
    ├── ggml-base.bin           # Recommended for daily use
    └── ggml-small.bin          # Optional: better accuracy
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| `whisper-cli.exe tidak ditemukan` | Download dari GitHub Releases |
| `Model belum diunduh` | Download model ke folder `models/` |
| `DLL load failed` | Pastikan semua DLL ada di folder `cpu/` (CPU) atau `gpu/` (GPU) |
| `CUDA not found` | Install CUDA Toolkit atau gunakan CPU-only mode |
