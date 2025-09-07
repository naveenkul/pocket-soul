const WebSocket = require('ws');
const EventEmitter = require('events');

class VisionProcessor extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.visionServiceUrl = 'ws://localhost:8001/vision/stream';
    
    // Current vision state
    this.currentState = {
      faceDetected: false,
      fingerCount: 0,
      handsDetected: 0,
      gesture: null,
      lastUpdate: null
    };
    
    // Connection retry settings
    this.reconnectInterval = 5000;
    this.maxReconnectAttempts = 3;
    this.reconnectAttempts = 0;
    
    // Start connection attempt
    this.connect();
  }
  
  connect() {
    try {
      console.log('Attempting to connect to vision service...');
      
      this.ws = new WebSocket(this.visionServiceUrl);
      
      this.ws.on('open', () => {
        console.log('✅ Connected to vision service');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
      });
      
      this.ws.on('message', (data) => {
        try {
          const visionData = JSON.parse(data);
          this.updateState(visionData);
        } catch (error) {
          console.error('Error parsing vision data:', error);
        }
      });
      
      this.ws.on('error', (error) => {
        console.warn('Vision service connection error:', error.message);
        this.connected = false;
      });
      
      this.ws.on('close', () => {
        console.log('Vision service connection closed');
        this.connected = false;
        this.emit('disconnected');
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`Reconnecting in ${this.reconnectInterval/1000}s... (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectInterval);
        } else {
          console.log('Max reconnection attempts reached. Vision service unavailable.');
          this.emit('unavailable');
        }
      });
      
    } catch (error) {
      console.warn('Could not connect to vision service:', error.message);
      this.connected = false;
      
      // Retry connection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    }
  }
  
  updateState(data) {
    // Update current state
    this.currentState = {
      ...data,
      lastUpdate: new Date()
    };
    
    // Emit specific events based on changes
    if (data.faceDetected && !this.previousFaceDetected) {
      this.emit('face-detected');
    } else if (!data.faceDetected && this.previousFaceDetected) {
      this.emit('face-lost');
    }
    
    if (data.fingerCount !== this.previousFingerCount) {
      this.emit('finger-count-changed', data.fingerCount);
    }
    
    if (data.gesture && data.gesture !== this.previousGesture) {
      this.emit('gesture-detected', data.gesture);
    }
    
    // Store previous values for comparison
    this.previousFaceDetected = data.faceDetected;
    this.previousFingerCount = data.fingerCount;
    this.previousGesture = data.gesture;
    
    // Emit general update
    this.emit('update', this.currentState);
  }
  
  getState() {
    return this.currentState;
  }
  
  isConnected() {
    return this.connected;
  }
  
  getContext() {
    // Return simplified context for AI modules
    return {
      userPresent: this.currentState.faceDetected,
      fingerCount: this.currentState.fingerCount,
      gesture: this.currentState.gesture,
      engagement: this.calculateEngagement()
    };
  }
  
  calculateEngagement() {
    // Simple engagement calculation
    if (!this.currentState.faceDetected) return 'absent';
    if (this.currentState.handsDetected > 0) return 'active';
    return 'present';
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

module.exports = VisionProcessor;