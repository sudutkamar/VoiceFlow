/**
 * Shared models path utility for VoiceFlow.
 *
 * Single source of truth for WHERE models are stored.
 *
 * Priority:
 *   1. custom_models_path (user-defined, saved in DB)
 *   2. Default: Documents/VoiceFlow/models/  (packaged)
 *      Fallback: resources/whisper/models/    (dev)
 *
 * Migration from old paths (userData/models, userData/whisper/models)
 * happens automatically at first startup after upgrade.
 */
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

/**
 * Get the user-visible "Documents/VoiceFlow/" base directory.
 * This is where models live — user-friendly and easy to find.
 */
export function getDocumentsVoiceFlowDir(): string {
  const docsPath = app.getPath('documents');
  return path.join(docsPath, 'VoiceFlow');
}

/**
 * Default models directory path.
 * Packaged: Documents/VoiceFlow/models/
 * Dev:      resources/whisper/models/ (reuse bundled)
 */
export function getDefaultModelsDir(): string {
  if (app.isPackaged) {
    return path.join(getDocumentsVoiceFlowDir(), 'models');
  }
  // Dev mode: bundled resources are fine
  return path.join(__dirname, '..', '..', 'resources', 'whisper', 'models');
}

/**
 * Old paths that may have models from previous installs.
 * Used for migration only.
 */
export function getOldModelsDirs(): string[] {
  const userData = app.getPath('userData');
  return [
    path.join(userData, 'models'),           // Old ModelDownloader path
    path.join(userData, 'whisper', 'models'), // Old Transcriber path
  ];
}

/**
 * Bundled resources models directory (read-only, from installer).
 */
export function getResourcesModelsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'whisper', 'models');
  }
  return path.join(__dirname, '..', '..', 'resources', 'whisper', 'models');
}

/**
 * Resolve the effective models directory considering user custom path.
 * Returns { path, isCustom }
 */
export function resolveModelsPath(customModelsPath?: string | null): { path: string; isCustom: boolean } {
  if (customModelsPath && fs.existsSync(customModelsPath)) {
    return { path: customModelsPath, isCustom: true };
  }
  return { path: getDefaultModelsDir(), isCustom: false };
}

/**
 * Migrate models from old paths to target directory.
 * Returns { migrated: number, from: string[] }
 */
export function migrateModelsTo(targetDir: string): { migrated: number; from: string[] } {
  let migrated = 0;
  const sources: string[] = [];

  for (const oldDir of getOldModelsDirs()) {
    if (!fs.existsSync(oldDir)) continue;
    try {
      const files = fs.readdirSync(oldDir).filter(f => f.endsWith('.bin') && !f.endsWith('.tmp'));
      if (files.length === 0) continue;

      sources.push(oldDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      for (const file of files) {
        const src = path.join(oldDir, file);
        const dest = path.join(targetDir, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          migrated++;
          try { fs.chmodSync(dest, 0o666); } catch {}
        }
      }
    } catch (err) {
      console.warn('[ModelsPath] Migration from', oldDir, 'failed:', err);
    }
  }

  return { migrated, from: sources };
}

/**
 * Check if target directory exists and has .bin files.
 */
export function modelsDirHasContent(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).some(f => f.endsWith('.bin'));
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists.
 */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get the path for GPU CUDA DLLs (stored alongside models, not in userData/whisper).
 */
export function getGpuDir(baseDir: string): string {
  return path.join(baseDir, '..', 'gpu');
}
