require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const compression = require('compression');

// Import custom modules
const MoodPipeline = require('./lib/mood-pipeline');
const VoiceSync = require('./lib/voice-sync');
const StreamManager = require('./lib/stream-manager');
const NetworkDiscovery = require('./lib/network-discovery');
const VisionProcessor = require('./lib/vision-processor');
const AudioConversation = require('./lib/audio-conversation');
const CustomCharacterGenerator = require('./lib/custom-character-generator');
const customCharacterAPI = require('./api/custom-character');

// Initialize Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8, // 100MB for video chunks
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Initialize modules
const moodPipeline = new MoodPipeline();
const voiceSync = new VoiceSync();
const streamManager = new StreamManager(io);
const networkDiscovery = new NetworkDiscovery(PORT);
const visionProcessor = new VisionProcessor();
const audioConversation = new AudioConversation(moodPipeline);
const customCharacterGenerator = new CustomCharacterGenerator();

// Vision processor event handlers
visionProcessor.on('connected', () => {
  console.log('📷 Vision service connected');
  io.emit('vision-status', { connected: true });
});

visionProcessor.on('disconnected', () => {
  console.log('📷 Vision service disconnected');
  io.emit('vision-status', { connected: false });
});

visionProcessor.on('face-detected', () => {
  io.emit('user-presence', { present: true });
});

visionProcessor.on('face-lost', () => {
  io.emit('user-presence', { present: false });
});

visionProcessor.on('finger-count-changed', (count) => {
  io.emit('finger-count', { count });
});

visionProcessor.on('gesture-detected', (gesture) => {
  io.emit('gesture', { type: gesture });
});

// Audio conversation event handlers
audioConversation.on('transcription', (data) => {
  io.emit('audio-transcription', data);
});

audioConversation.on('conversation-complete', (result) => {
  io.emit('audio-response', result);
});

audioConversation.on('status', (status) => {
  io.emit('audio-status', status);
});

audioConversation.on('error', (error) => {
  io.emit('audio-error', error);
});

// Middleware
app.use(cors());
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
// Also serve generated content - fix the path to generated_files
app.use('/generated_files', express.static(path.join(__dirname, 'generated_files')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active connections
const connections = new Map();
const activeStreams = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/hologram', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hologram.html'));
});

// API endpoint for connection info
app.get('/api/connection', async (req, res) => {
  const info = await networkDiscovery.getConnectionInfo();
  res.json(info);
});

// Custom character API
app.use((req, res, next) => {
  req.io = io; // Pass io instance to routes
  next();
});
app.use('/api/custom-character', customCharacterAPI);

// API endpoint for vision status
app.get('/api/vision', (req, res) => {
  res.json({
    connected: visionProcessor.isConnected(),
    state: visionProcessor.getState()
  });
});

// Test endpoint to stream a simple video
app.post('/api/test-stream', (req, res) => {
  const videoPath = req.body.videoPath || '/videos/base_emotions/joy_transition.mp4';
  
  console.log(`🎬 Streaming test video: ${videoPath}`);
  
  // Get all hologram display clients
  const hologramClients = Array.from(connections.values())
    .filter(c => c.isHologram)
    .map(c => c.socket);
  
  console.log(`📱 Found ${hologramClients.length} hologram clients`);
  
  // Send video to all hologram displays
  hologramClients.forEach(socket => {
    console.log(`📹 Sending video to hologram: ${socket.id}`);
    
    socket.emit('custom-character-ready', {
      emotion: 'joy',
      description: 'test video',
      videoPath: videoPath,
      cached: true,
      audio: null,
      response: 'Test video streaming'
    });
  });
  
  res.json({
    success: true,
    message: `Video sent to ${hologramClients.length} hologram displays`,
    videoPath: videoPath
  });
});

// Electron audio recording endpoints
let activeRecording = null;
let recordingBuffer = [];

app.post('/api/electron/start-recording', (req, res) => {
  console.log('Starting audio recording from Electron...');
  recordingBuffer = [];
  activeRecording = true;
  res.json({ success: true, message: 'Recording started' });
});

app.post('/api/electron/stop-recording', async (req, res) => {
  console.log('Stopping audio recording from Electron...');
  activeRecording = false;
  
  try {
    // Process the recorded audio if we have data
    if (recordingBuffer.length > 0) {
      const audioData = Buffer.concat(recordingBuffer);
      recordingBuffer = [];
      
      // Get vision context
      const visionContext = visionProcessor.getContext();
      
      // Process audio through conversation pipeline
      const result = await audioConversation.processAudioInput(audioData, visionContext);
      
      // If custom character was generated, stream it to hologram displays
      if (result && result.customCharacter && result.customCharacter.success) {
        console.log('🎭 Streaming custom character to hologram displays...');
        
        // Get all hologram display clients
        const hologramClients = Array.from(connections.values())
          .filter(c => c.isHologram)
          .map(c => c.socket);
        
        // Emit custom character ready event to all hologram displays
        hologramClients.forEach(socket => {
          // Ensure video path is properly formatted for serving
          const videoPath = result.customCharacter.path.startsWith('/') ? 
                           result.customCharacter.path : 
                           '/' + result.customCharacter.path;
          
          console.log('📹 Sending video to hologram:', videoPath);
          
          socket.emit('custom-character-ready', {
            emotion: result.customCharacter.metadata?.emotion || result.mood,
            description: result.customCharacter.metadata?.customDescription,
            videoPath: videoPath,
            cached: result.customCharacter.cached,
            audio: result.audio ? result.audio.toString('base64') : null,
            response: result.response
          });
        });
        
        // Also emit to control panel for status
        io.emit('custom-character-status', {
          generated: true,
          emotion: result.customCharacter.metadata?.emotion || result.mood,
          description: result.customCharacter.metadata?.customDescription,
          cached: result.customCharacter.cached
        });
      }
      
      res.json({ 
        success: true, 
        result: result 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No audio data recorded' 
      });
    }
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint to receive audio chunks
app.post('/api/electron/audio-chunk', express.raw({ type: 'audio/*', limit: '50mb' }), (req, res) => {
  if (activeRecording && req.body) {
    recordingBuffer.push(req.body);
    res.json({ success: true, received: req.body.length });
  } else {
    res.status(400).json({ success: false, message: 'Not recording' });
  }
});

// API endpoint for audio processing (browser push-to-talk)
app.post('/api/audio/process', async (req, res) => {
  try {
    const { audio, mood } = req.body;
    
    if (!audio) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio data provided' 
      });
    }
    
    console.log('Processing browser audio input...');
    
    // Convert base64 to buffer
    const audioData = Buffer.from(audio, 'base64');
    console.log('Audio buffer size:', audioData.length);
    
    // Check minimum audio length
    if (audioData.length < 1000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Audio recording too short. Please hold the record button longer (at least 0.5 seconds).' 
      });
    }
    
    // Get vision context
    const visionContext = visionProcessor.getContext();
    
    // Process audio through conversation pipeline (uses Whisper for transcription)
    const result = await audioConversation.processAudioInput(audioData, visionContext);
    
    if (!result) {
      return res.json({ 
        success: false, 
        error: 'No speech detected' 
      });
    }
    
    // Stream to hologram displays if custom character was generated
    if (result && result.customCharacter && result.customCharacter.success) {
      console.log('🎭 Streaming custom character to hologram displays...');
      
      const hologramClients = Array.from(connections.values())
        .filter(c => c.isHologram)
        .map(c => c.socket);
      
      hologramClients.forEach(socket => {
        const videoPath = result.customCharacter.path.startsWith('/') ? 
                         result.customCharacter.path : 
                         '/' + result.customCharacter.path;
        
        socket.emit('custom-character-ready', {
          emotion: result.customCharacter.metadata?.emotion || result.mood,
          description: result.customCharacter.metadata?.customDescription,
          videoPath: videoPath,
          cached: result.customCharacter.cached,
          audio: result.audio ? result.audio.toString('base64') : null,
          response: result.response
        });
      });
    }
    
    // Return response with transcription and audio
    res.json({ 
      success: true,
      transcription: result.transcription,
      response: result.response,
      mood: result.mood,
      audio: result.audio ? result.audio.toString('base64') : null
    });
    
  } catch (error) {
    console.error('Audio processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API endpoint for mood generation
app.post('/api/generate', async (req, res) => {
  try {
    const { text, mood } = req.body;
    
    if (!text) {
      return res.status(400).json({ 
        success: false, 
        error: 'No text provided' 
      });
    }
    
    console.log('Processing text input:', text);
    
    // Get vision context
    const visionContext = visionProcessor.getContext();
    
    // Detect or use provided mood with vision context
    const detectedMood = mood || moodPipeline.detectMood(text, visionContext);
    
    // Generate custom character
    const customCharacter = await customCharacterGenerator.getOrCreateVariant(detectedMood, text);
    
    // Generate voice
    const audioBuffer = await voiceSync.generateAudio(text, detectedMood);
    
    // Send to hologram displays
    const hologramClients = Array.from(connections.values())
      .filter(c => c.isHologram)
      .map(c => c.socket);
    
    if (customCharacter && customCharacter.success) {
      console.log('🎭 Sending custom character to hologram displays...');
      
      hologramClients.forEach(socket => {
        const videoPath = customCharacter.path.startsWith('/') ? 
                         customCharacter.path : 
                         '/' + customCharacter.path;
        
        console.log('📹 Sending video to hologram:', videoPath);
        
        socket.emit('custom-character-ready', {
          emotion: customCharacter.metadata?.emotion || detectedMood,
          description: customCharacter.metadata?.customDescription,
          videoPath: videoPath,
          cached: customCharacter.cached,
          audio: audioBuffer ? audioBuffer.toString('base64') : null,
          response: text
        });
      });
    }
    
    // Return response
    res.json({
      success: true,
      mood: detectedMood,
      generationCount: moodPipeline.generationCount,
      customCharacter: customCharacter ? {
        path: customCharacter.path,
        cached: customCharacter.cached
      } : null
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  connections.set(socket.id, {
    socket,
    connectedAt: Date.now(),
    isHologram: false,
    visionContext: null,
    metrics: {
      framesReceived: 0,
      latencies: []
    }
  });
  
  // Send initial vision status
  socket.emit('vision-status', { 
    connected: visionProcessor.isConnected(),
    state: visionProcessor.getState()
  });
  
  // Identify hologram display vs control panel
  socket.on('identify', (type) => {
    const connection = connections.get(socket.id);
    if (connection) {
      connection.isHologram = (type === 'hologram');
      console.log(`Client ${socket.id} identified as: ${type}`);
    }
  });
  
  // Handle user input for real-time generation
  socket.on('user-input', async (data) => {
    try {
      const { text, audio } = data;
      
      // Get vision context for this connection
      const visionContext = visionProcessor.getContext();
      const connection = connections.get(socket.id);
      if (connection) {
        connection.visionContext = visionContext;
      }
      
      // Process input through mood pipeline with vision context
      const result = await moodPipeline.processUserInput(text || audio, '', visionContext);
      
      // Get or generate video
      if (result.video && result.video.url) {
        // Start streaming video to hologram displays
        const hologramClients = Array.from(connections.values())
          .filter(c => c.isHologram)
          .map(c => c.socket.id);
        
        if (hologramClients.length > 0) {
          // Stream video
          const videoStream = await streamManager.startVideoStream(
            result.video.url,
            hologramClients
          );
          activeStreams.set(socket.id, videoStream);
          
          // Generate and stream audio
          const audioBuffer = await voiceSync.generateAudio(text, result.mood);
          await streamManager.streamAudio(audioBuffer, hologramClients);
        }
      }
      
      // Send response
      socket.emit('generation-complete', {
        mood: result.mood,
        generationCount: result.generationCount
      });
      
    } catch (error) {
      console.error('Processing error:', error);
      socket.emit('error', { message: error.message });
    }
  });
  
  // Stream control
  socket.on('start-stream', async (data) => {
    const { videoUrl, audioBuffer } = data;
    
    // Get all hologram displays
    const hologramClients = Array.from(connections.values())
      .filter(c => c.isHologram)
      .map(c => c.socket.id);
    
    if (videoUrl) {
      const stream = await streamManager.startVideoStream(videoUrl, hologramClients);
      activeStreams.set(socket.id, stream);
    }
    
    if (audioBuffer) {
      await streamManager.streamAudio(audioBuffer, hologramClients);
    }
  });
  
  socket.on('stop-stream', () => {
    const stream = activeStreams.get(socket.id);
    if (stream) {
      streamManager.stopStream(stream);
      activeStreams.delete(socket.id);
    }
  });
  
  // Latency measurement
  socket.on('ping', (timestamp) => {
    socket.emit('pong', {
      clientTime: timestamp,
      serverTime: Date.now()
    });
  });
  
  // Metrics reporting
  socket.on('metrics', (data) => {
    const connection = connections.get(socket.id);
    if (connection) {
      connection.metrics.framesReceived = data.framesReceived || 0;
      connection.metrics.latencies.push(data.latency || 0);
      
      // Keep only last 10 latencies
      if (connection.metrics.latencies.length > 10) {
        connection.metrics.latencies.shift();
      }
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Clean up streams
    const stream = activeStreams.get(socket.id);
    if (stream) {
      streamManager.stopStream(stream);
      activeStreams.delete(socket.id);
    }
    
    connections.delete(socket.id);
  });
});

// Initialize services
async function initialize() {
  try {
    // Initialize mood pipeline
    await moodPipeline.initialize();
    console.log('✅ Mood pipeline initialized');
    
    // Start network discovery
    await networkDiscovery.start();
    console.log('✅ Network discovery started');
    
    // Start server
    server.listen(PORT, () => {
      console.log('');
      console.log('🚀 Pocket Soul - Holographic AI Companion');
      console.log('==========================================');
      console.log(`📡 Local: http://localhost:${PORT}`);
      console.log(`📱 Network: ${networkDiscovery.urls.local}`);
      console.log(`🔮 Hologram Display: ${networkDiscovery.urls.local}/hologram`);
      console.log('');
      console.log('💡 Powered by:');
      console.log('   - Gemini 2.5 Flash Image (Avatar Generation)');
      console.log('   - Veo3 via fal.ai (Animation)');
      console.log('   - ElevenLabs (Voice Synthesis)');
      console.log('');
      console.log('📱 Scan QR code or visit URL on phone for hologram display');
      console.log('');
    });
    
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  
  // Stop all active streams
  activeStreams.forEach(stream => {
    streamManager.stopStream(stream);
  });
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the application
initialize();