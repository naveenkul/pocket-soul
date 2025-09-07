class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.onDataAvailable = null;
    this.onStop = null;
    this.startTime = null;
    this.minRecordingDuration = 500; // Minimum 500ms recording
  }
  
  async initialize() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });
      
      // Create MediaRecorder with webm format (compatible with Whisper)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 
                      'audio/webm;codecs=opus' : 
                      'audio/webm';
      
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });
      
      // Handle data available
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          if (this.onDataAvailable) {
            this.onDataAvailable(event.data);
          }
        }
      };
      
      // Handle stop
      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];
        
        if (this.onStop) {
          this.onStop(audioBlob);
        }
      };
      
      console.log('✅ Audio recorder initialized');
      return true;
      
    } catch (error) {
      console.error('Failed to initialize audio recorder:', error);
      return false;
    }
  }
  
  async start() {
    if (!this.mediaRecorder) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }
    
    if (this.mediaRecorder.state === 'recording') {
      console.warn('Already recording');
      return false;
    }
    
    this.audioChunks = [];
    this.startTime = Date.now();
    this.mediaRecorder.start(100); // Collect data every 100ms
    this.isRecording = true;
    console.log('🔴 Recording started');
    return true;
  }
  
  stop() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      console.warn('Not recording');
      return false;
    }
    
    const recordingDuration = Date.now() - this.startTime;
    if (recordingDuration < this.minRecordingDuration) {
      console.warn(`Recording too short: ${recordingDuration}ms (minimum ${this.minRecordingDuration}ms)`);
      // Continue recording for minimum duration
      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
          this.isRecording = false;
          console.log('⏹️ Recording stopped (minimum duration enforced)');
        }
      }, this.minRecordingDuration - recordingDuration);
      return false;
    }
    
    this.mediaRecorder.stop();
    this.isRecording = false;
    console.log(`⏹️ Recording stopped (${recordingDuration}ms)`);
    return true;
  }
  
  async getAudioBlob() {
    return new Promise((resolve) => {
      const originalOnStop = this.onStop;
      this.onStop = (blob) => {
        this.onStop = originalOnStop;
        resolve(blob);
      };
      this.stop();
    });
  }
  
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
  }
}