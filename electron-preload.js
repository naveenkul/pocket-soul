const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Recording controls
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording: () => ipcRenderer.send('stop-recording'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  
  // Audio events
  onAudioData: (callback) => {
    ipcRenderer.on('audio-data', (event, data) => callback(data));
  },
  
  onTranscription: (callback) => {
    ipcRenderer.on('transcription', (event, data) => callback(data));
  },
  
  onResponse: (callback) => {
    ipcRenderer.on('response', (event, data) => callback(data));
  },
  
  onStatus: (callback) => {
    ipcRenderer.on('status', (event, data) => callback(data));
  },
  
  // System info
  platform: process.platform,
  isElectron: true
});