# Whisper Resources Setup

## Required Files

### 1. whisper-cli.exe

Download from: https://github.com/ggerganov/whisper.cpp/releases

Look for the latest release and download `whisper-cli.exe` for Windows.

Or build from source:
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
cmake -B build
cmake --build build --config Release
# Copy build/bin/Release/whisper-cli.exe to this folder
```

### 2. Whisper Model

Download a model file and place it in `models/` folder:

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| ggml-tiny.bin | 75 MB | Fastest | Lower |
| ggml-base.bin | 142 MB | Balanced | Good |
| ggml-small.bin | 466 MB | Slower | Better |

Download from: https://huggingface.co/ggerganov/whisper.cpp/tree/main

Direct download links:
- tiny: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
- base: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
- small: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

## Folder Structure

```
resources/
└── whisper/
    ├── whisper-cli.exe
    ├── README.md
    └── models/
        ├── ggml-base.bin
        └── ggml-small.bin (optional)
```
