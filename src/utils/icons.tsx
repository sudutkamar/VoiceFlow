import React from 'react';
import { Icon } from '@iconify/react';

// Mapping of semantic icon names to Iconify icon IDs
export const ICONS = {
  // Navigation
  record: 'mdi:microphone',
  models: 'mdi:package-variant-closed',
  history: 'mdi:history',
  benchmark: 'mdi:chart-line',
  settings: 'mdi:cog',
  home: 'mdi:home',

  // Model sizes
  modelTiny: 'mdi:lightning-bolt',
  modelBase: 'mdi:weight',
  modelSmall: 'mdi:target',
  modelMedium: 'mdi:diamond',
  modelLarge: 'mdi:trophy',
  modelLargeV3: 'mdi:crown',
  modelLargeV3Turbo: 'mdi:rocket',
  modelCustom: 'mdi:help-circle',

  // Actions
  download: 'mdi:download',
  pause: 'mdi:pause-circle',
  resume: 'mdi:play-circle',
  cancel: 'mdi:close-circle',
  delete: 'mdi:delete',
  refresh: 'mdi:refresh',
  scan: 'mdi:magnify-scan',
  copy: 'mdi:content-copy',
  paste: 'mdi:clipboard-arrow-left',
  search: 'mdi:magnify',
  export: 'mdi:file-export',
  clear: 'mdi:broom',
  edit: 'mdi:pencil',
  add: 'mdi:plus',
  close: 'mdi:close',

  // Status
  active: 'mdi:check-circle',
  warning: 'mdi:alert-circle',
  error: 'mdi:alert-circle',
  info: 'mdi:information',
  success: 'mdi:check-circle',
  check: 'mdi:check',
  done: 'mdi:check-all',

  // Audio
  mic: 'mdi:microphone',
  micOff: 'mdi:microphone-off',
  speaker: 'mdi:volume-high',
  recording: 'mdi:record-rec',
  waveform: 'mdi:waveform',
  noise: 'mdi:waves',
  silent: 'mdi:volume-off',
  goodLevel: 'mdi:check-circle-outline',
  loudLevel: 'mdi:volume-high',
  clipLevel: 'mdi:alert-outline',

  // Misc
  folder: 'mdi:folder',
  file: 'mdi:file',
  text: 'mdi:format-text',
  dictionary: 'mdi:book-open-variant',
  snippets: 'mdi:text-short',
  learning: 'mdi:brain',
  gpu: 'mdi:chip',
  cpu: 'mdi:cpu-64-bit',
  theme: 'mdi:theme-light-dark',
  hotkey: 'mdi:keyboard',
  language: 'mdi:translate',
  version: 'mdi:information-outline',
  github: 'mdi:github',
  tip: 'mdi:lightbulb-outline',
  cog: 'mdi:cog',
  chevronLeft: 'mdi:chevron-left',
  chevronRight: 'mdi:chevron-right',
  chevronDown: 'mdi:chevron-down',
  menu: 'mdi:menu',
  minimize: 'mdi:window-minimize',
  maximize: 'mdi:window-maximize',
  closeWindow: 'mdi:close',
  arrowRight: 'mdi:arrow-right',
  arrowLeft: 'mdi:arrow-left',
  spark: 'mdi:auto-fix',
  note: 'mdi:note-text-outline',
};

export type IconName = keyof typeof ICONS;

export function Iconify({ icon, size = 18, className = '' }: { icon: IconName; size?: number; className?: string }) {
  const iconId = ICONS[icon];
  if (!iconId) {
    console.warn(`[Iconify] Unknown icon: ${icon}`);
    return null;
  }
  return <Icon icon={iconId} width={size} height={size} className={className} />;
}

export function getModelIcon(name: string | undefined | null): IconName {
  if (!name) return 'modelCustom';
  const lower = name.toLowerCase();
  if (lower.includes('tiny')) return 'modelTiny';
  if (lower.includes('base-q5_1')) return 'modelBase';
  if (lower.includes('base')) return 'modelBase';
  if (lower.includes('small')) return 'modelSmall';
  if (lower.includes('medium')) return 'modelMedium';
  if (lower.includes('large-v3-q5_0')) return 'modelLargeV3';
  if (lower.includes('large-v3-turbo-q8_0')) return 'modelLargeV3Turbo';
  if (lower.includes('large-v3-turbo-q5_0')) return 'modelLargeV3Turbo';
  if (lower.includes('large-v3-turbo')) return 'modelLargeV3Turbo';
  if (lower.includes('large-v3')) return 'modelLargeV3';
  if (lower.includes('large')) return 'modelLarge';
  return 'modelCustom';
}

export function getModelSizeColor(name: string | undefined | null): string {
  if (!name) return '#6b7280';
  const lower = name.toLowerCase();
  if (lower.includes('tiny')) return '#94a3b8';
  if (lower.includes('base')) return '#60a5fa';
  if (lower.includes('small')) return '#34d399';
  if (lower.includes('medium')) return '#fbbf24';
  if (lower.includes('large-v3-q5_0')) return '#8b5cf6';
  if (lower.includes('large-v3-turbo-q8_0')) return '#f97316';
  if (lower.includes('large-v3-turbo-q5_0')) return '#f97316';
  if (lower.includes('large-v3-turbo')) return '#f97316';
  if (lower.includes('large-v3')) return '#ec4899';
  if (lower.includes('large')) return '#a78bfa';
  return '#6b7280';
}
