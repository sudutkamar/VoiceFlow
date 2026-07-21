/**
 * OnboardingPopover — tooltips untuk fitur tersembunyi.
 * Muncul sekali per fitur, dismiss dengan klik.
 * Disimpan di localStorage agar tidak muncul lagi.
 */
import React, { useState, useEffect } from 'react';

interface Step {
  id: string;
  selector: string;
  title: string;
  text: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: Step[] = [
  {
    id: 'lang-switch',
    selector: '.m-lang-wrap',
    title: 'Ganti Bahasa',
    text: 'Klik untuk ganti bahasa dictation. Tersedia: Indonesia, English, 日本語, 한국어, 中文.',
    position: 'bottom',
  },
  {
    id: 'model-switch',
    selector: '.m-model-wrap',
    title: 'Ganti Model AI',
    text: 'Klik untuk ganti model Whisper. Model lebih besar = lebih akurat, tapi lebih lambat.',
    position: 'bottom',
  },
  {
    id: 'vad-settings',
    selector: '[class*="vad"]',
    title: 'VAD Sensitivity',
    text: 'Atur sensitivitas Voice Activity Detection di Settings > Recording. Low untuk tempat tenang, High untuk tempat ramai.',
    position: 'top',
  },
  {
    id: 'presets',
    selector: '.m-orb-btn.m-spark-btn',
    title: 'Recording Presets',
    text: 'Simpan kombinasi setting (bahasa + model + VAD) sebagai preset. Akses cepat di Settings > Presets.',
    position: 'top',
  },
  {
    id: 'smart-suggestions',
    selector: '.suggestions-box, .m-result-text',
    title: 'Smart Suggestions',
    text: 'Kata yang mungkin typo akan muncul saran perbaikan. Klik saran untuk replace kata.',
    position: 'top',
  },
  {
    id: 'history-playback',
    selector: '[class*="history"]',
    title: 'Audio Playback',
    text: 'Hasil rekaman bisa diputar ulang dari History. Klik tombol speaker di samping teks.',
    position: 'top',
  },
];

export function OnboardingPopover({ isMini }: { isMini: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const done = getCompletedSteps();
    const nextIdx = STEPS.findIndex(s => s.selector && !done.has(s.id) && document.querySelector(s.selector));
    if (nextIdx >= 0) {
      updatePosition(STEPS[nextIdx]);
      setCurrentIndex(nextIdx);
    }
  }, []);

  const getCompletedSteps = (): Set<string> => {
    try {
      const raw = localStorage.getItem('voiceflow_onboarding_done');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  };

  const markDone = (id: string) => {
    try {
      const done = getCompletedSteps();
      done.add(id);
      localStorage.setItem('voiceflow_onboarding_done', JSON.stringify([...done]));
    } catch {}
  };

  const updatePosition = (step: Step) => {
    const el = document.querySelector(step.selector);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    let top = 0, left = 0;
    switch (step.position) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2;
        break;
      case 'top':
        top = rect.top - gap;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - gap;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + gap;
        break;
    }
    setPos({ top, left });
  };

  const dismiss = () => {
    if (currentIndex < 0) return;
    markDone(STEPS[currentIndex].id);
    // Cari step berikutnya
    const done = getCompletedSteps();
    const nextIdx = STEPS.findIndex((s, i) => i > currentIndex && !done.has(s.id) && document.querySelector(s.selector));
    if (nextIdx >= 0) {
      updatePosition(STEPS[nextIdx]);
      setCurrentIndex(nextIdx);
    } else {
      setCurrentIndex(-1);
    }
  };

  if (currentIndex < 0) return null;

  const step = STEPS[currentIndex];

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 9999,
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, 0)',
        maxWidth: 280,
        background: isMini
          ? 'rgba(15, 23, 42, 0.95)'
          : 'var(--bg-card)',
        backdropFilter: 'blur(20px)',
        border: isMini ? '1px solid rgba(255,255,255,0.1)' : 'var(--glass-border)',
        borderRadius: 12,
        padding: '12px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        color: isMini ? '#e2e8f0' : 'var(--text)',
        fontSize: 13,
        lineHeight: 1.5,
        animation: 'tooltipIn 0.25s ease',
      }}
      onClick={dismiss}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: isMini ? '#93c5fd' : 'var(--accent)' }}>
        {step.title}
      </div>
      <div style={{ opacity: 0.85 }}>{step.text}</div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          opacity: 0.5,
          textAlign: 'right',
        }}
      >
        Klik untuk dismiss
      </div>
    </div>
  );
}
