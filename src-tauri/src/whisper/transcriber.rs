use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

/// Whisper transcription engine — spawns whisper-cli.exe
pub struct Transcriber {
    whisper_path: PathBuf,
    models_path: PathBuf,
    has_gpu: bool,
    cancelled: AtomicBool,
}

impl Transcriber {
    pub fn new() -> Self {
        let whisper_path = Self::find_whisper_cli();
        let models_path = Self::find_models_dir();

        Self {
            whisper_path,
            models_path,
            has_gpu: Self::detect_gpu(),
            cancelled: AtomicBool::new(false),
        }
    }

    /// Transcribe audio file to text
    pub async fn transcribe(
        &mut self,
        audio_path: &Path,
        model: &str,
        language: &str,
    ) -> Result<String, String> {
        self.cancelled.store(false, Ordering::SeqCst);

        if !self.whisper_path.exists() {
            return Err("whisper-cli.exe not found".into());
        }

        // Select model
        let model_name = if model.is_empty() {
            self.select_best_model()
        } else {
            model.to_string()
        };

        let model_path = self.models_path.join(&model_name);
        if !model_path.exists() {
            return Err(format!("Model not found: {}", model_name));
        }

        if !audio_path.exists() {
            return Err("Audio file not found".into());
        }

        // Build whisper-cli arguments
        let mut args = vec![
            "-m".to_string(),
            model_path.to_string_lossy().to_string(),
            "-f".to_string(),
            audio_path.to_string_lossy().to_string(),
            "-otxt".to_string(),
            "--no-prints".to_string(),
            "--no-timestamps".to_string(),
            "-t".to_string(),
            num_cpus().to_string(),
            "--best-of".to_string(),
            "2".to_string(),
            "--beam-size".to_string(),
            "3".to_string(),
            "--entropy-thold".to_string(),
            "2.4".to_string(),
            "--logprob-thold".to_string(),
            "-1.0".to_string(),
            "--no-speech-thold".to_string(),
            "0.5".to_string(),
        ];

        // GPU/CPU
        if !self.has_gpu {
            args.push("-ng".to_string());
        }

        // Language
        if !language.is_empty() && language != "auto" {
            args.push("-l".to_string());
            args.push(language.to_string());
        }

        // Run whisper-cli
        let output = Command::new(&self.whisper_path)
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run whisper-cli: {}", e))?;

        if self.cancelled.load(Ordering::SeqCst) {
            return Err("Cancelled".into());
        }

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Whisper failed (code {:?}): {}",
                output.status.code(),
                stderr.chars().take(200).collect::<String>()
            ));
        }

        // Read output text file
        let txt_path = audio_path.with_extension("wav.txt");
        if txt_path.exists() {
            let text =
                fs::read_to_string(&txt_path).map_err(|e| format!("Failed to read output: {}", e))?;
            let _ = fs::remove_file(&txt_path);
            let cleaned = self.clean_transcript(&text);
            if cleaned.is_empty() {
                return Err("__NO_SPEECH__".into());
            }
            return Ok(cleaned);
        }

        // Fallback: parse stdout
        let stdout = String::from_utf8_lossy(&output.stdout);
        let text = self.parse_stdout(&stdout);
        let cleaned = self.clean_transcript(&text);
        if cleaned.is_empty() {
            return Err("__NO_SPEECH__".into());
        }
        Ok(cleaned)
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn clean_transcript(&self, text: &str) -> String {
        text.replace("[BLANK_AUDIO]", "")
            .replace("[MUSIC]", "")
            .replace("[silence]", "")
            .replace("[SOUND]", "")
            .replace("[NOISE]", "")
            .replace("[SPEECH_NOT_RECOGNIZED]", "")
            .trim()
            .to_string()
    }

    fn parse_stdout(&self, stdout: &str) -> String {
        stdout
            .lines()
            .filter(|line| {
                let line = line.trim();
                if line.is_empty() || line.len() < 3 {
                    return false;
                }
                if line.starts_with('[') && line.contains(':') {
                    return false;
                }
                if line.starts_with("whisper model:")
                    || line.starts_with("system_info:")
                    || line.starts_with("main: processing")
                    || line.starts_with("sampling rate:")
                {
                    return false;
                }
                true
            })
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string()
    }

    fn select_best_model(&self) -> String {
        let priority = vec![
            "ggml-large-v3-turbo-q5_0.bin",
            "ggml-large-v3-turbo-q8_0.bin",
            "ggml-large-v3-turbo.bin",
            "ggml-large-v3-q5_0.bin",
            "ggml-large-v3.bin",
            "ggml-medium.bin",
            "ggml-small.bin",
            "ggml-base.bin",
            "ggml-tiny.bin",
        ];

        for model in priority {
            if self.models_path.join(model).exists() {
                return model.to_string();
            }
        }

        // Try to find any .bin file
        if let Ok(entries) = fs::read_dir(&self.models_path) {
            for entry in entries.flatten() {
                if entry.path().extension().map_or(false, |e| e == "bin") {
                    return entry.file_name().to_string_lossy().to_string();
                }
            }
        }

        "ggml-base.bin".to_string()
    }

    fn find_whisper_cli() -> PathBuf {
        let exe_dir = std::env::current_exe().unwrap_or_default();
        let exe_parent = exe_dir.parent().unwrap_or(&exe_dir);

        let candidates = vec![
            exe_parent
                .join("resources")
                .join("whisper")
                .join("cpu")
                .join("whisper-cli.exe"),
            exe_parent.join("whisper").join("cpu").join("whisper-cli.exe"),
            PathBuf::from(
                "C:\\Program Files\\VoiceFlow\\resources\\whisper\\cpu\\whisper-cli.exe",
            ),
        ];

        for path in candidates {
            if path.exists() {
                return path;
            }
        }

        exe_parent.join("whisper-cli.exe")
    }

    fn find_models_dir() -> PathBuf {
        if let Some(docs) = dirs::document_dir() {
            let models_dir = docs.join("VoiceFlow").join("models");
            if models_dir.exists() {
                return models_dir;
            }
        }

        let exe_dir = std::env::current_exe().unwrap_or_default();
        let exe_parent = exe_dir.parent().unwrap_or(&exe_dir);
        let resources_models = exe_parent
            .join("resources")
            .join("whisper")
            .join("models");
        if resources_models.exists() {
            return resources_models;
        }

        PathBuf::from("models")
    }

    fn detect_gpu() -> bool {
        let exe_dir = std::env::current_exe().unwrap_or_default();
        let exe_parent = exe_dir.parent().unwrap_or(&exe_dir);

        let cuda_dll = exe_parent
            .join("resources")
            .join("whisper")
            .join("cpu")
            .join("ggml-cuda.dll");
        cuda_dll.exists()
    }
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}
