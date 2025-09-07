const record = require('node-record-lpcm16');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ElectronAudioRecorder {
  constructor() {
    this.recording = false;
    this.recordingStream = null;
    this.audioChunks = [];
    this.fileStream = null;
    this.outputPath = null;
  }
  
  async startRecording() {
    if (this.recording) {
      console.log('Already recording');
      return false;
    }
    
    this.recording = true;
    this.audioChunks = [];
    
    // Create temp file for recording
    const tempDir = app.getPath('temp');
    this.outputPath = path.join(tempDir, `recording_${Date.now()}.wav`);
    
    try {
      // Start recording with node-record-lpcm16
      this.recordingStream = record.record({
        sampleRate: 16000,
        channels: 1,
        audioType: 'wav',
        recorder: process.platform === 'darwin' ? 'sox' : 'rec', // Use sox on macOS
        silence: '0.0', // Don't stop on silence
        thresholdStart: null,
        thresholdEnd: null,
        keepSilence: true
      });
      
      // Create write stream for the output file
      this.fileStream = fs.createWriteStream(this.outputPath);
      
      // Pipe the recording to the file
      this.recordingStream.stream()
        .on('error', (err) => {
          console.error('Recording stream error:', err);
          this.recording = false;
        })
        .pipe(this.fileStream);
      
      console.log('Started recording audio with node-record-lpcm16');
      return true;
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.recording = false;
      return false;
    }
  }
  
  async stopRecording() {
    if (!this.recording || !this.recordingStream) {
      console.log('Not recording');
      return null;
    }
    
    return new Promise((resolve) => {
      // Stop the recording
      this.recordingStream.stop();
      this.recording = false;
      
      // Wait for the file stream to finish
      this.fileStream.on('finish', () => {
        // Read the recorded file
        fs.readFile(this.outputPath, (err, data) => {
          if (err) {
            console.error('Failed to read recording:', err);
            resolve(null);
          } else {
            // Clean up temp file
            fs.unlink(this.outputPath, (unlinkErr) => {
              if (unlinkErr) console.error('Failed to delete temp file:', unlinkErr);
            });
            
            console.log('Stopped recording, file size:', data.length);
            resolve(data);
          }
        });
      });
      
      // End the file stream
      this.fileStream.end();
    });
  }
  
  isRecording() {
    return this.recording;
  }
}

module.exports = ElectronAudioRecorder;