import '@testing-library/jest-dom';

// Mock electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    // Dictation
    startRecording: () => Promise.resolve({ success: true }),
    stopRecording: () => Promise.resolve({ success: true }),
    sendAudioData: () => {},
    
    // Settings
    getSettings: () => Promise.resolve({}),
    updateSetting: () => Promise.resolve({ success: true }),
    
    // History
    getHistory: () => Promise.resolve([]),
    searchHistory: () => Promise.resolve([]),
    exportHistory: () => Promise.resolve({ success: true }),
    
    // Dictionary
    getDictionary: () => Promise.resolve([]),
    addDictionaryEntry: () => Promise.resolve({ success: true }),
    deleteDictionaryEntry: () => Promise.resolve({ success: true }),
    
    // Events
    onStateChange: () => () => {},
    onTranscriptReady: () => () => {},
    onError: () => () => {},
    onStartRecording: () => () => {},
    onStopRecording: () => () => {},
    onCancelRecording: () => () => {},
    onPartialTranscript: () => () => {},
    onThemeChange: () => () => {},
  },
});

// Mock MediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: () => Promise.resolve(new MediaStream()),
    enumerateDevices: () => Promise.resolve([]),
  },
});
