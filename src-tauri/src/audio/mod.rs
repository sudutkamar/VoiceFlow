// Audio processing module
// Audio recording is handled by Web Audio API in the frontend
// This module provides audio format conversion utilities

pub mod converter;

pub use converter::AudioConverter;
