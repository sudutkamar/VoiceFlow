/**
 * SettingsContext — shared settings state untuk seluruh app.
 * 
 * Load settings sekali dari main process, cache di context, auto-refresh
 * saat onReloadSettings event.
 * 
 * Component lain cukup pake useSettingsContext() tanpa perlu getSettings() ulang.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface SettingsContextValue {
  settings: Record<string, string>;
  saveSetting: (key: string, value: string) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Record<string, string>>({});

  const refreshSettings = useCallback(async () => {
    try {
      const s = await window.electronAPI.getSettings();
      setSettings(s);
      // Sync theme
      if (s.theme === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }
      // Sync sound
      window.voiceflowSoundEnabled = s.sound_effects !== 'false';
    } catch {
      // Silent fail — settings will be empty
    }
  }, []);

  const saveSetting = useCallback(async (key: string, value: string) => {
    try {
      await window.electronAPI.updateSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    refreshSettings();

    const unsub = window.electronAPI.onReloadSettings?.(() => {
      refreshSettings();
    });

    return () => {
      if (unsub) unsub();
    };
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, saveSetting, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettingsContext must be used within SettingsProvider');
  }
  return ctx;
}
