use std::sync::atomic::{AtomicU8, Ordering};

/// Simple logger for VoiceFlow
pub struct Logger {
    level: AtomicU8, // 0=debug, 1=info, 2=warn, 3=error
}

impl Logger {
    pub fn new() -> Self {
        Self {
            level: AtomicU8::new(1), // Default: info
        }
    }

    pub fn set_level(&self, level: &str) {
        let l = match level {
            "debug" => 0,
            "info" => 1,
            "warn" => 2,
            "error" => 3,
            _ => 1,
        };
        self.level.store(l, Ordering::SeqCst);
    }

    pub fn debug(&self, msg: &str) {
        if self.level.load(Ordering::SeqCst) <= 0 {
            log::debug!("{}", msg);
        }
    }

    pub fn info(&self, msg: &str) {
        if self.level.load(Ordering::SeqCst) <= 1 {
            log::info!("{}", msg);
        }
    }

    pub fn warn(&self, msg: &str) {
        if self.level.load(Ordering::SeqCst) <= 2 {
            log::warn!("{}", msg);
        }
    }

    pub fn error(&self, msg: &str) {
        log::error!("{}", msg);
    }
}
