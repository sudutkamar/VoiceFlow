import React, { useState, useEffect, useRef, useCallback } from 'react';

interface HomeProps {
  appState: string;
  onSuccess: (message: string) => void;
}

function Home({ appState, onSuccess }: HomeProps) {
  const [transcript, setTranscript] = useState<{ raw: string; cleaned: string; wordCount: number; charCount: number } | null>(null);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [hotkey, setHotkey] = useState<string>('Ctrl+Shift+Space');
  const [isRecording, setIsRecording] = useState(false);
  const [wpm, setWpm] = useState(0);
  const [partialText, setPartialText] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings.hotkey) {
          setHotkey(settings.hotkey.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl'));
        }
      } catch {}
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const unsubTranscript = window.electronAPI.onTranscriptReady((data: any) => {
      setTranscript({ 
        raw: data.raw, 
        cleaned: data.cleaned,
        wordCount: data.wordCount || 0,
        charCount: data.charCount || 0,
      });
      setPartialText('');
    });

    const unsubPartial = window.electronAPI.onPartialTranscript((text) => {
      setPartialText(text);
    });

    const unsubWpm = window.electronAPI.onWpmUpdate((newWpm) => {
      setWpm(newWpm);
    });

    return () => {
      unsubTranscript();
      unsubPartial();
      unsubWpm();
    };
  }, []);

  useEffect(() => {
    const unsubToggle = window.electronAPI.onStateChange((state) => {
      if (state === 'recording' && !isRecording) {
        startRecording();
      } else if (state === 'idle' && isRecording) {
        stopRecording();
      }
    });

    return () => {
      unsubToggle();
    };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      // Get selected microphone from settings
      const settings = await window.electronAPI.getSettings();
      const selectedMic = settings.selected_mic || '';
      
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      };
      
      // Use specific device if selected
      if (selectedMic) {
        audioConstraints.deviceId = { exact: selectedMic };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { 
        mimeType: 'audio/webm;codecs=opus' 
      });

      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        const arrayBuffer = await blob.arrayBuffer();
        const duration = Date.now() - startTimeRef.current;

        stream.getTracks().forEach(track => track.stop());

        const uint8Array = new Uint8Array(arrayBuffer);
        const buffer = Array.from(uint8Array);

        window.electronAPI.sendAudioData({
          buffer: buffer,
          mimeType: 'audio/webm',
          duration: duration
        });
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setTranscript(null);
      setPartialText('');
      setWpm(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(Date.now() - startTimeRef.current);
      }, 100);

    } catch (err: any) {
      console.error('Failed to start recording:', err);
      if (err.name === 'NotAllowedError') {
        alert('Izin microphone ditolak. Silakan berikan izin microphone di pengaturan Windows.');
      } else if (err.name === 'NotFoundError') {
        alert('Microphone tidak ditemukan. Pastikan microphone terhubung.');
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  const handleMicClick = async () => {
    if (isRecording) {
      window.electronAPI.stopRecording();
      stopRecording();
    } else {
      window.electronAPI.startRecording();
      await startRecording();
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = async () => {
    if (transcript?.cleaned) {
      try {
        await navigator.clipboard.writeText(transcript.cleaned);
        onSuccess('Teks berhasil dicopy!');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handlePaste = async () => {
    if (transcript?.cleaned) {
      try {
        await window.electronAPI.minimizeToTray();
        setTimeout(async () => {
          await navigator.clipboard.writeText(transcript.cleaned);
          document.execCommand('paste');
        }, 300);
      } catch (err) {
        console.error('Failed to paste:', err);
      }
    }
  };

  const getStateText = (): string => {
    switch (appState) {
      case 'recording':
        return 'Merekam... Tekan hotkey untuk berhenti';
      case 'converting':
        return 'Mengkonversi audio...';
      case 'transcribing':
        return 'Mengubah suara menjadi teks...';
      case 'cleaning':
        return 'Membersihkan teks...';
      case 'pasting':
        return 'Menempel ke aplikasi aktif...';
      case 'done':
        return 'Selesai! Teks sudah ditempel.';
      case 'error':
        return 'Terjadi error. Coba lagi.';
      default:
        return 'Tekan tombol atau hotkey untuk mulai merekam';
    }
  };

  const isBusy = ['converting', 'transcribing', 'cleaning', 'pasting'].includes(appState);

  return (
    <div className="home-page">
      <div className={`mic-container ${isRecording ? 'recording' : ''}`}>
        <div className="mic-ring"></div>
        <button
          className={`mic-button ${isRecording ? 'recording' : ''}`}
          onClick={handleMicClick}
          disabled={isBusy}
        >
          {isRecording ? (
            <svg className="mic-icon" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg className="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      </div>

      {isRecording && (
        <div className="recording-info">
          <div className="recording-timer">{formatTime(recordingTime)}</div>
          {wpm > 0 && <div className="recording-wpm">{wpm} WPM</div>}
        </div>
      )}

      <div className={`state-label ${isRecording ? 'recording' : ''} ${isBusy ? 'processing' : ''}`}>
        {getStateText()}
      </div>

      <div className="hotkey-hint">
        <span>Hotkey:</span>
        {hotkey.split('+').map((key, i) => (
          <span key={i} className="hotkey-key">{key}</span>
        ))}
      </div>

      {isRecording && partialText && (
        <div className="partial-transcript">
          <div className="partial-label">Live Preview:</div>
          <div className="partial-text">{partialText}</div>
        </div>
      )}

      {transcript && (
        <div className="transcript-box">
          <div className="transcript-header">
            <h3>Hasil Transkripsi</h3>
            <div className="transcript-meta">
              <span>{transcript.wordCount} kata</span>
              <span>•</span>
              <span>{transcript.charCount} karakter</span>
            </div>
            <div className="transcript-actions">
              <button
                className="transcript-action-btn"
                onClick={handleCopy}
                title="Copy"
              >
                📋 Copy
              </button>
              <button
                className="transcript-action-btn"
                onClick={handlePaste}
                title="Paste to active app"
              >
                📌 Paste
              </button>
            </div>
          </div>
          <div className="transcript-content">
            {transcript.cleaned || <span className="transcript-placeholder">Tidak ada teks</span>}
          </div>
          {transcript.raw !== transcript.cleaned && (
            <details className="transcript-raw">
              <summary>Original Text</summary>
              <div className="transcript-raw-content">{transcript.raw}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default Home;
