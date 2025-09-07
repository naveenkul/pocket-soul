// Integrated Pocket Soul - Client-side JavaScript
class IntegratedPocketSoul {
  constructor() {
    this.socket = null;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.conversationCount = 0;
    this.videoCount = 0;
    
    this.init();
  }
  
  async init() {
    console.log('Initializing Integrated Pocket Soul...');
    
    // Initialize socket connection
    this.initSocket();
    
    // Initialize DOM elements
    this.initElements();
    
    // Load connection info
    await this.loadConnectionInfo();
    
    console.log('✅ Initialization complete');
  }
  
  initSocket() {
    this.socket = io();
    
    // Identify this client
    this.socket.emit('identify', 'control-panel');
    
    // Socket event listeners
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.updateStatus('Connected - Ready to start conversation', 'idle');
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.updateStatus('Disconnected from server', 'error');
    });
    
    this.socket.on('config', (config) => {
      console.log('Received config:', config);
      this.updateEmotionsList(config.availableEmotions);
      this.updateVideoStats(config.videoStats);
    });
    
    this.socket.on('status', (data) => {
      this.updateStatus(this.getStatusMessage(data.state), data.state);
    });
    
    this.socket.on('transcription-result', (data) => {
      console.log('Transcription:', data.text);
      this.addConversationMessage('user', data.text);
    });
    
    this.socket.on('conversation-complete', (data) => {
      console.log('Conversation complete:', data);
      this.handleConversationComplete(data);
    });
    
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.showToast('Error: ' + error.message, 'error');
      this.updateStatus('Error: ' + error.message, 'error');
    });
    
    this.socket.on('reset-complete', () => {
      this.clearConversation();
      this.updateStatus('Conversation reset', 'idle');
    });
  }
  
  initElements() {
    // Buttons
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.interruptBtn = document.getElementById('interruptBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.sendTextBtn = document.getElementById('sendTextBtn');
    
    // Inputs
    this.textInput = document.getElementById('textInput');
    
    // Display elements
    this.statusElement = document.getElementById('status');
    this.conversationContainer = document.getElementById('conversationContainer');
    this.emotionVideo = document.getElementById('emotionVideo');
    this.emotionIndicator = document.getElementById('emotionIndicator');
    this.videoInfo = document.getElementById('videoInfo');
    this.responseAudio = document.getElementById('responseAudio');
    this.currentEmotion = document.getElementById('currentEmotion');
    
    // Metrics
    this.conversationCountElement = document.getElementById('conversation-count');
    this.videoCountElement = document.getElementById('video-count');
    this.clientCountElement = document.getElementById('client-count');
    
    // Event listeners
    this.startBtn.addEventListener('click', () => this.startRecording());
    this.stopBtn.addEventListener('click', () => this.stopRecording());
    this.interruptBtn.addEventListener('click', () => this.interrupt());
    this.resetBtn.addEventListener('click', () => this.reset());
    this.sendTextBtn.addEventListener('click', () => this.sendText());
    
    this.textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendText();
      }
    });
    
    // Video event listeners
    this.emotionVideo.addEventListener('loadstart', () => {
      this.videoInfo.textContent = 'Loading video...';
    });
    
    this.emotionVideo.addEventListener('loadeddata', () => {
      this.videoInfo.textContent = 'Video ready';
    });
    
    this.emotionVideo.addEventListener('error', (e) => {
      console.error('Video error:', e);
      this.videoInfo.textContent = 'Video error';
    });
    
    // Keyboard event listeners for spacebar push-to-talk
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && !this.isRecording && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        this.startRecording();
        // Visual feedback - highlight the start button
        this.startBtn.style.transform = 'scale(0.95)';
        this.startBtn.style.opacity = '0.8';
      }
    });
    
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.isRecording) {
        e.preventDefault();
        this.stopRecording();
        // Reset visual feedback
        this.startBtn.style.transform = '';
        this.startBtn.style.opacity = '';
      }
    });
    
    // Prevent spacebar from triggering buttons when focused
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
      }
    });
  }
  
  async loadConnectionInfo() {
    try {
      const response = await fetch('/api/info');
      const info = await response.json();
      
      this.displayConnectionInfo(info);
      this.updateMetrics(info.metrics);
      
    } catch (error) {
      console.error('Failed to load connection info:', error);
    }
  }
  
  displayConnectionInfo(info) {
    const connectionInfo = document.getElementById('connectionInfo');
    const qrContainer = document.getElementById('qrContainer');
    
    // Connection info
    connectionInfo.innerHTML = `
      <p><strong>Local:</strong> <a href="${info.urls.localhost}" target="_blank">${info.urls.localhost}</a></p>
      <p><strong>Network:</strong> <a href="${info.urls.local}" target="_blank">${info.urls.local}</a></p>
      <p><strong>Mobile:</strong> <a href="${info.urls.local}/mobile" target="_blank">${info.urls.local}/mobile</a></p>
    `;
    
    // QR codes
    qrContainer.innerHTML = '';
    Object.entries(info.qrCodes).forEach(([key, qrCode]) => {
      const qrItem = document.createElement('div');
      qrItem.className = 'qr-item';
      qrItem.innerHTML = `
        <h4>${key.charAt(0).toUpperCase() + key.slice(1)} Access</h4>
        <img src="${qrCode}" alt="${key} QR Code" width="150" height="150">
      `;
      qrContainer.appendChild(qrItem);
    });
  }
  
  updateMetrics(metrics) {
    if (this.conversationCountElement) {
      this.conversationCountElement.textContent = metrics.conversationsProcessed || 0;
    }
    if (this.videoCountElement) {
      this.videoCountElement.textContent = metrics.videosStreamed || 0;
    }
    if (this.clientCountElement) {
      this.clientCountElement.textContent = metrics.connectedClients || 0;
    }
  }
  
  updateEmotionsList(emotions) {
    const emotionsList = document.getElementById('emotionsList');
    if (!emotions || emotions.length === 0) {
      emotionsList.innerHTML = '<p>No emotions available</p>';
      return;
    }
    
    emotionsList.innerHTML = emotions.map(emotion => 
      `<span class="emotion-tag" onclick="app.testEmotion('${emotion}')">${emotion}</span>`
    ).join('');
  }
  
  updateVideoStats(stats) {
    if (!stats) return;
    
    const emotionsList = document.getElementById('emotionsList');
    const existingText = emotionsList.innerHTML;
    
    if (stats.totalVideos) {
      emotionsList.innerHTML = `
        <p style="color: var(--text-secondary); margin-bottom: 10px;">
          ${stats.totalVideos} videos available across ${stats.emotions?.length || 0} emotions
        </p>
        ${existingText}
      `;
    }
  }
  
  updateStatus(message, state) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
      this.statusElement.className = `status ${state}`;
    }
  }
  
  getStatusMessage(state) {
    const messages = {
      'idle': 'Ready for conversation',
      'transcribing': 'Transcribing speech...',
      'thinking': 'AI is thinking...',
      'generating-audio': 'Generating voice response...',
      'error': 'Error occurred'
    };
    return messages[state] || `Status: ${state}`;
  }
  
  async startRecording() {
    if (this.isRecording) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      this.recordedChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        this.processRecording();
        stream.getTracks().forEach(track => track.stop());
      };
      
      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;
      
      this.startBtn.disabled = true;
      this.stopBtn.disabled = false;
      this.updateStatus('Recording... Click stop when done', 'recording');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.showToast('Failed to access microphone: ' + error.message, 'error');
    }
  }
  
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    
    this.mediaRecorder.stop();
    this.isRecording = false;
    
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.updateStatus('Processing recording...', 'transcribing');
  }
  
  async processRecording() {
    if (this.recordedChunks.length === 0) {
      this.showToast('No audio recorded', 'error');
      this.updateStatus('Ready for conversation', 'idle');
      return;
    }
    
    try {
      const blob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' });
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to base64
      const base64Audio = btoa(String.fromCharCode(...uint8Array));
      
      console.log('Sending audio for transcription...');
      this.socket.emit('audio-for-transcription', {
        audio: base64Audio,
        format: 'webm'
      });
      
    } catch (error) {
      console.error('Failed to process recording:', error);
      this.showToast('Failed to process recording: ' + error.message, 'error');
      this.updateStatus('Ready for conversation', 'idle');
    }
  }
  
  sendText() {
    const text = this.textInput.value.trim();
    if (!text) return;
    
    console.log('Sending text:', text);
    this.socket.emit('text-input', { text });
    
    this.textInput.value = '';
    this.addConversationMessage('user', text);
    this.updateStatus('Processing text input...', 'thinking');
  }
  
  handleConversationComplete(data) {
    console.log('Handling conversation completion:', data);
    
    // Add AI response to conversation
    this.addConversationMessage('assistant', data.response);
    
    // Update emotion display
    if (data.emotion) {
      this.updateCurrentEmotion(data.emotion);
    }
    
    // Play audio if available
    if (data.audio) {
      this.playAudio(data.audio);
    }
    
    // Display video if available
    if (data.video) {
      this.playVideo(data.video);
    }
    
    // Update metrics
    this.conversationCount++;
    if (data.video) this.videoCount++;
    this.updateLocalMetrics();
    
    // Show timing info if available
    if (data.timing) {
      console.log('Timing:', data.timing);
    }
    
    this.updateStatus('Conversation complete - Ready for next input', 'idle');
    this.showToast('Response generated successfully!', 'success');
  }
  
  addConversationMessage(type, message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `conversation-item ${type}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message';
    messageContent.textContent = message;
    
    messageDiv.appendChild(messageContent);
    this.conversationContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    this.conversationContainer.scrollTop = this.conversationContainer.scrollHeight;
  }
  
  updateCurrentEmotion(emotion) {
    if (this.currentEmotion) {
      this.currentEmotion.textContent = emotion;
    }
    if (this.emotionIndicator) {
      this.emotionIndicator.textContent = emotion;
    }
    
    // Highlight the emotion in the emotions list
    const emotionTags = document.querySelectorAll('.emotion-tag');
    emotionTags.forEach(tag => {
      tag.classList.remove('active');
      if (tag.textContent === emotion) {
        tag.classList.add('active');
      }
    });
  }
  
  playAudio(audioBase64) {
    try {
      const audioBlob = new Blob([Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))], {
        type: 'audio/mpeg'
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      this.responseAudio.src = audioUrl;
      this.responseAudio.play().catch(e => {
        console.error('Failed to play audio:', e);
      });
      
      // Clean up URL after playing
      this.responseAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }
  
  playVideo(video) {
    try {
      console.log('Playing video:', video);
      
      this.emotionVideo.src = video.url;
      this.emotionVideo.load();
      
      this.updateCurrentEmotion(video.emotion);
      this.videoInfo.textContent = `${video.filename} (${video.emotion})`;
      
      this.emotionVideo.play().catch(e => {
        console.error('Failed to play video:', e);
        this.videoInfo.textContent = 'Failed to play video';
      });
      
    } catch (error) {
      console.error('Failed to setup video:', error);
      this.videoInfo.textContent = 'Video setup failed';
    }
  }
  
  testEmotion(emotion) {
    console.log('Testing emotion:', emotion);
    
    // Send a test message with this emotion
    const testMessage = `Show me the ${emotion} emotion`;
    this.socket.emit('text-input', { text: testMessage });
    
    this.addConversationMessage('user', testMessage);
    this.updateStatus(`Testing ${emotion} emotion...`, 'thinking');
  }
  
  interrupt() {
    console.log('Interrupting...');
    this.socket.emit('interrupt');
    
    if (this.isRecording) {
      this.stopRecording();
    }
    
    // Stop audio and video
    if (this.responseAudio) {
      this.responseAudio.pause();
    }
    
    this.updateStatus('Interrupted - Ready for new input', 'idle');
  }
  
  reset() {
    console.log('Resetting conversation...');
    this.socket.emit('reset');
    
    this.interrupt();
    
    // Reset local state
    this.conversationCount = 0;
    this.videoCount = 0;
    this.updateLocalMetrics();
  }
  
  clearConversation() {
    // Keep only the system message
    const systemMessage = this.conversationContainer.querySelector('.conversation-item.system');
    this.conversationContainer.innerHTML = '';
    if (systemMessage) {
      this.conversationContainer.appendChild(systemMessage);
    }
  }
  
  updateLocalMetrics() {
    if (this.conversationCountElement) {
      this.conversationCountElement.textContent = this.conversationCount;
    }
    if (this.videoCountElement) {
      this.videoCountElement.textContent = this.videoCount;
    }
  }
  
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `message-toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// Initialize the application when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new IntegratedPocketSoul();
});

// Export for global access
window.app = app;