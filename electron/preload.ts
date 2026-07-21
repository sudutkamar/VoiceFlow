/**
 * VoiceFlow Preload Script
 * 
 * Exposes a secure, typed API from the main process to the renderer
 * via contextBridge. Organized into domain-specific modules under electron/preload/.
 */
import { contextBridge } from 'electron';
import { createAudioAPI } from './preload/audio';
import { createClipboardAPI } from './preload/clipboard';
import { createMiniWindowAPI } from './preload/miniWindow';
import { createSettingsAPI } from './preload/settings';
import { createModelsAPI } from './preload/models';
import { createAppAPI } from './preload/app';
import { createLlmAPI } from './preload/llm';
import { createLearningAPI } from './preload/learning';
import { createEventsAPI } from './preload/events';

// Merge all domain APIs into a single object
const api = {
  ...createAudioAPI(),
  ...createClipboardAPI(),
  ...createMiniWindowAPI(),
  ...createSettingsAPI(),
  ...createModelsAPI(),
  ...createAppAPI(),
  ...createLlmAPI(),
  ...createLearningAPI(),
  ...createEventsAPI(),
};

contextBridge.exposeInMainWorld('electronAPI', api);
