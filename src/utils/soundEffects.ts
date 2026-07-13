/**
 * Shared audio utility for VoiceFlow.
 * Singleton AudioContext — prevents memory leaks.
 */

let _soundCtx: AudioContext | null = null;

function getSoundCtx(): AudioContext {
  if (!_soundCtx || _soundCtx.state === 'closed') {
    _soundCtx = new AudioContext();
  }
  if (_soundCtx.state === 'suspended') {
    _soundCtx.resume();
  }
  return _soundCtx;
}

/**
 * Close the existing AudioContext to free resources.
 * Call this when the component unmounts or when switching views.
 */
export function cleanupSoundCtx(): void {
  if (_soundCtx && _soundCtx.state !== 'closed') {
    try { _soundCtx.close(); } catch {}
  }
  _soundCtx = null;
}

export function playSound(type: 'start' | 'stop' | 'done' | 'error'): void {
  if (window.voiceflowSoundEnabled === false) return;
  try {
    const ctx = getSoundCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;
    switch (type) {
      case 'start':
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        break;
      case 'stop':
        osc.frequency.value = 400;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;
      case 'done':
        osc.frequency.value = 600;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
        setTimeout(() => {
          try {
            const ctx2 = getSoundCtx();
            const osc2 = ctx2.createOscillator();
            const gain2 = ctx2.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx2.destination);
            gain2.gain.value = 0.15;
            osc2.frequency.value = 900;
            osc2.type = 'sine';
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.15);
            osc2.start(ctx2.currentTime);
            osc2.stop(ctx2.currentTime + 0.15);
          } catch {}
        }, 100);
        break;
      case 'error':
        osc.frequency.value = 200;
        osc.type = 'sawtooth';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;
    }
  } catch {}
}
