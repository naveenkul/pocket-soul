require('dotenv').config({ path: '../.env' });
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const ip = require('ip');
const QRCode = require('qrcode');

// Import services
const GeminiService = require('./lib/gemini-service');
const ElevenLabsStream = require('./lib/elevenlabs-stream');
const WhisperService = require('./lib/whisper-service');
const VideoEmotionMapper = require('./lib/video-emotion-mapper');
const CustomCharacterGenerator = require('./lib/custom-character-generator');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8,
  transports: ['websocket', 'polling']
});

const PORT = process.env.INTEGRATED_PORT || 4000;
const LOCAL_IP = ip.address();

// Initialize services
const geminiService = new GeminiService();
const elevenLabsStream = new ElevenLabsStream();
const whisperService = new WhisperService();
const videoEmotionMapper = new VideoEmotionMapper();
const customCharacterGenerator = new CustomCharacterGenerator();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/generated_files', express.static(path.join(__dirname, '../generated_files')));
app.use('/videos', express.static(path.join(__dirname, '../public/videos')));
app.use(express.json());

// Store active sessions
const sessions = new Map();
const activeStreams = new Map();
const connections = new Map();
const activeCustomCharacters = new Map(); // Track active custom character per session

// Performance metrics
const metrics = {
  framesSent: 0,
  bytesTransferred: 0,
  averageLatency: 0,
  connectedClients: 0,
  conversationsProcessed: 0,
  videosStreamed: 0,
  startTime: Date.now()
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

app.get('/api/info', async (req, res) => {
  const urls = {
    local: `http://${LOCAL_IP}:${PORT}`,
    localhost: `http://localhost:${PORT}`
  };
  
  const qrCodes = {};
  for (const [key, url] of Object.entries(urls)) {
    qrCodes[key] = await QRCode.toDataURL(`${url}/mobile`);
  }
  
  res.json({
    urls,
    qrCodes,
    metrics: {
      ...metrics,
      uptime: Date.now() - metrics.startTime,
      availableEmotions: videoEmotionMapper.getAllEmotions(),
      videoStats: videoEmotionMapper.getStats()
    },
    services: {
      gemini: geminiService.isReady(),
      elevenlabs: elevenLabsStream.isReady(),
      whisper: true,
      videoMapper: videoEmotionMapper.initialized
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      gemini: geminiService.isReady(),
      elevenlabs: elevenLabsStream.isReady(),
      whisper: true,
      videoMapper: videoEmotionMapper.initialized
    }
  });
});

// Video streaming endpoint with range support
app.get('/api/video/:filename', (req, res) => {
  const videoPath = path.join(__dirname, '../generated_files', req.params.filename);
  
  if (!fs.existsSync(videoPath)) {
    return res.status(404).send('Video not found');
  }
  
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

// API endpoint to get available videos by emotion
app.get('/api/videos/:emotion', (req, res) => {
  const emotion = req.params.emotion;
  const video = videoEmotionMapper.getVideoForEmotion(emotion);
  
  if (video) {
    res.json({
      success: true,
      video: {
        filename: video.filename,
        emotion: video.emotion,
        url: `/generated_files/${video.filename}`,
        path: video.path
      }
    });
  } else {
    res.status(404).json({
      success: false,
      message: `No video found for emotion: ${emotion}`,
      availableEmotions: videoEmotionMapper.getAllEmotions()
    });
  }
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Create session for this client
  sessions.set(socket.id, {
    conversationHistory: [],
    isProcessing: false,
    currentAudioStream: null,
    currentVideoStream: null,
    clientType: 'unknown'
  });
  
  connections.set(socket.id, {
    socket,
    connectedAt: Date.now(),
    isHologram: false,
    metrics: {
      framesReceived: 0,
      latencies: []
    }
  });
  
  metrics.connectedClients = connections.size;
  
  // Send initial configuration
  socket.emit('config', {
    serverTime: Date.now(),
    availableEmotions: videoEmotionMapper.getAllEmotions(),
    videoStats: videoEmotionMapper.getStats()
  });
  
  // Client identification
  socket.on('identify', (type) => {
    const session = sessions.get(socket.id);
    const connection = connections.get(socket.id);
    if (session && connection) {
      session.clientType = type;
      connection.isHologram = (type === 'hologram' || type === 'mobile');
      console.log(`Client ${socket.id} identified as: ${type}`);
    }
  });

  // Handle audio transcription using Whisper
  socket.on('audio-for-transcription', async (data) => {
    try {
      const { audio, format } = data;
      const session = sessions.get(socket.id);
      
      if (!session || session.isProcessing) {
        return;
      }
      
      console.log('Processing audio for conversation with video response...');
      
      let audioBuffer;
      if (typeof audio === 'string') {
        audioBuffer = Buffer.from(audio, 'base64');
      } else {
        audioBuffer = Buffer.from(audio);
      }
      
      session.isProcessing = true;
      socket.emit('status', { state: 'transcribing' });
      
      // Transcribe using Whisper
      const transcription = await whisperService.transcribeAudio(audioBuffer, {
        language: 'en',
        temperature: 0
      });
      
      console.log(`Transcription: ${transcription.text}`);
      
      socket.emit('transcription-result', {
        text: transcription.text,
        confidence: transcription.confidence || 1.0
      });
      
      if (transcription.text && transcription.text.trim()) {
        // Add to conversation history
        session.conversationHistory.push({
          role: 'user',
          content: transcription.text,
          timestamp: new Date()
        });
        
        // Generate AI response
        socket.emit('status', { state: 'thinking' });
        const startTime = Date.now();
        
        const response = await geminiService.generateResponse(
          transcription.text,
          session.conversationHistory
        );
        
        const responseTime = Date.now() - startTime;
        console.log(`AI response (${responseTime}ms): ${response.substring(0, 100)}...`);
        
        // Add AI response to history
        session.conversationHistory.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });
        
        // Check for custom character request
        const customCharacterRequest = detectCustomCharacterRequest(transcription.text);
        let video = null;
        let customVideo = null;
        let detectedEmotion = detectEmotionFromText(transcription.text, response);
        
        // Check if we have an active custom character for this session
        const activeCustomChar = activeCustomCharacters.get(socket.id);
        
        if (customCharacterRequest) {
          // New custom character request - generate or retrieve
          console.log(`🎭 New custom character request: ${customCharacterRequest}`);
          socket.emit('status', { state: 'generating-character' });
          
          try {
            const customResult = await customCharacterGenerator.getOrCreateVariant(detectedEmotion, customCharacterRequest);
            
            if (customResult.success) {
              customVideo = {
                url: customResult.path,
                emotion: detectedEmotion,
                description: customCharacterRequest,
                cached: customResult.cached
              };
              // Store as active custom character for this session
              activeCustomCharacters.set(socket.id, customVideo);
              console.log(`✅ Custom character ${customResult.cached ? 'retrieved' : 'generated'}: ${customCharacterRequest}`);
            } else {
              console.log('❌ Custom character generation failed, using standard emotion');
              video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
            }
          } catch (error) {
            console.error('Custom character generation error:', error);
            video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
          }
        } else if (activeCustomChar && activeCustomChar.description) {
          // Continue with existing custom character but update emotion
          console.log(`🎭 Continuing with custom character: ${activeCustomChar.description} (emotion: ${detectedEmotion})`);
          
          try {
            const customResult = await customCharacterGenerator.getOrCreateVariant(detectedEmotion, activeCustomChar.description);
            
            if (customResult.success) {
              customVideo = {
                url: customResult.path,
                emotion: detectedEmotion,
                description: activeCustomChar.description,
                cached: customResult.cached
              };
              // Update the stored custom character with new emotion
              activeCustomCharacters.set(socket.id, customVideo);
              console.log(`✅ Updated custom character emotion: ${activeCustomChar.description} → ${detectedEmotion}`);
            } else {
              console.log('❌ Custom character update failed, using standard emotion');
              video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
            }
          } catch (error) {
            console.error('Custom character update error:', error);
            video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
          }
        } else {
          // Standard emotion detection and video selection
          console.log(`Detected emotion: ${detectedEmotion}`);
          video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
        }
        
        // Generate audio
        socket.emit('status', { state: 'generating-audio' });
        const audioStartTime = Date.now();
        
        try {
          const audioBuffer = await elevenLabsStream.generateAudioREST(response);
          const audioTime = Date.now() - audioStartTime;
          
          const videoData = customVideo ? customVideo : (video ? {
            filename: video.filename,
            url: `/generated_files/${video.filename}`,
            emotion: video.emotion
          } : null);
          
          // Send complete response with video
          socket.emit('conversation-complete', {
            transcription: transcription.text,
            response: response,
            emotion: customVideo ? customVideo.emotion : detectedEmotion,
            audio: audioBuffer.toString('base64'),
            video: videoData,
            customCharacter: customVideo ? {
              description: customVideo.description,
              cached: customVideo.cached
            } : null,
            timing: {
              transcription: 0,
              response: responseTime,
              audio: audioTime,
              total: Date.now() - startTime
            }
          });
          
          // Broadcast to hologram displays
          const hologramConnections = Array.from(connections.values())
            .filter(c => c.isHologram);
          
          hologramConnections.forEach(conn => {
            conn.socket.emit('display-content', {
              audio: audioBuffer.toString('base64'),
              video: videoData,
              text: response,
              emotion: customVideo ? customVideo.emotion : detectedEmotion,
              customCharacter: customVideo ? {
                description: customVideo.description,
                cached: customVideo.cached
              } : null
            });
          });
          
          metrics.conversationsProcessed++;
          if (video) metrics.videosStreamed++;
          
          socket.emit('status', { state: 'idle' });
          session.isProcessing = false;
          
        } catch (audioError) {
          console.error('Audio generation error:', audioError);
          socket.emit('error', {
            message: 'Failed to generate audio',
            error: audioError.message
          });
          socket.emit('status', { state: 'idle' });
          session.isProcessing = false;
        }
      }
      
    } catch (error) {
      console.error('Transcription error:', error);
      const session = sessions.get(socket.id);
      if (session) session.isProcessing = false;
      
      socket.emit('error', {
        message: 'Failed to process audio',
        error: error.message
      });
      socket.emit('status', { state: 'idle' });
    }
  });
  
  // Handle text input (for testing)
  socket.on('text-input', async (data) => {
    try {
      const { text } = data;
      const session = sessions.get(socket.id);
      
      if (!session || session.isProcessing || !text || !text.trim()) {
        return;
      }
      
      session.isProcessing = true;
      socket.emit('status', { state: 'thinking' });
      
      // Add to conversation history
      session.conversationHistory.push({
        role: 'user',
        content: text,
        timestamp: new Date()
      });
      
      const startTime = Date.now();
      const response = await geminiService.generateResponse(text, session.conversationHistory);
      
      // Add AI response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });
      
      // Check for reset commands first
      const resetCommands = ['go back to normal', 'be normal', 'reset character', 'default character', 'stop being', 'go back to default'];
      const isResetCommand = resetCommands.some(cmd => text.toLowerCase().includes(cmd));
      
      if (isResetCommand) {
        console.log(`🔄 Reset command detected, clearing custom character for session ${socket.id}`);
        activeCustomCharacters.delete(socket.id);
      }
      
      // Check for custom character request
      const customCharacterRequest = detectCustomCharacterRequest(text);
      let video = null;
      let customVideo = null;
      let detectedEmotion = detectEmotionFromText(text, response);
      
      // Check if we have an active custom character for this session
      const activeCustomChar = activeCustomCharacters.get(socket.id);
      
      if (customCharacterRequest) {
        // New custom character request - generate or retrieve
        console.log(`🎭 Generating custom character: ${customCharacterRequest}`);
        socket.emit('status', { state: 'generating-character' });
        
        try {
          const customResult = await customCharacterGenerator.getOrCreateVariant(detectedEmotion, customCharacterRequest);
          
          if (customResult.success) {
            customVideo = {
              url: customResult.path,
              emotion: detectedEmotion,
              description: customCharacterRequest,
              cached: customResult.cached
            };
            // Store the custom character for this session
            activeCustomCharacters.set(socket.id, customVideo);
            console.log(`✅ Custom character ${customResult.cached ? 'retrieved' : 'generated'}: ${customCharacterRequest}`);
          } else {
            console.log('❌ Custom character generation failed, using standard emotion');
            video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
          }
        } catch (error) {
          console.error('Custom character generation error:', error);
          video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
        }
      } else if (activeCustomChar && activeCustomChar.description && !isResetCommand) {
        // Continue with existing custom character but update emotion
        console.log(`🎭 Continuing with custom character: ${activeCustomChar.description} (emotion: ${detectedEmotion})`);
        socket.emit('status', { state: 'generating-character' });
        
        try {
          const customResult = await customCharacterGenerator.getOrCreateVariant(detectedEmotion, activeCustomChar.description);
          
          if (customResult.success) {
            customVideo = {
              url: customResult.path,
              emotion: detectedEmotion,
              description: activeCustomChar.description,
              cached: customResult.cached
            };
            // Update the stored character with new emotion
            activeCustomCharacters.set(socket.id, customVideo);
            console.log(`✅ Updated custom character emotion: ${activeCustomChar.description} -> ${detectedEmotion}`);
          } else {
            console.log('❌ Custom character emotion update failed, using standard emotion');
            video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
          }
        } catch (error) {
          console.error('Custom character emotion update error:', error);
          video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
        }
      } else {
        // Standard emotion detection and video selection
        video = videoEmotionMapper.getVideoForEmotion(detectedEmotion);
      }
      
      // Generate audio
      socket.emit('status', { state: 'generating-audio' });
      
      try {
        const audioBuffer = await elevenLabsStream.generateAudioREST(response);
        
        const videoData = customVideo ? customVideo : (video ? {
          filename: video.filename,
          url: `/generated_files/${video.filename}`,
          emotion: video.emotion
        } : null);
        
        socket.emit('conversation-complete', {
          transcription: text,
          response: response,
          emotion: customVideo ? customVideo.emotion : detectedEmotion,
          audio: audioBuffer.toString('base64'),
          video: videoData,
          customCharacter: customVideo ? {
            description: customVideo.description,
            cached: customVideo.cached
          } : null,
          timing: {
            total: Date.now() - startTime
          }
        });
        
        // Broadcast to hologram displays (mobile)
        const hologramConnections = Array.from(connections.values())
          .filter(c => c.isHologram);
        
        hologramConnections.forEach(conn => {
          conn.socket.emit('display-content', {
            audio: audioBuffer.toString('base64'),
            video: videoData,
            text: response,
            emotion: customVideo ? customVideo.emotion : detectedEmotion,
            customCharacter: customVideo ? {
              description: customVideo.description,
              cached: customVideo.cached
            } : null
          });
        });
        
        console.log(`📱 Sent content to ${hologramConnections.length} mobile displays`);
        
        metrics.conversationsProcessed++;
        if (video) metrics.videosStreamed++;
        
      } catch (audioError) {
        console.error('Audio generation error:', audioError);
        socket.emit('conversation-complete', {
          transcription: text,
          response: response,
          emotion: detectedEmotion,
          audio: null,
          video: video ? {
            filename: video.filename,
            url: `/generated_files/${video.filename}`,
            emotion: video.emotion
          } : null,
          error: 'Failed to generate audio'
        });
        
        // Still broadcast to mobile displays (without audio)
        const hologramConnections = Array.from(connections.values())
          .filter(c => c.isHologram);
        
        hologramConnections.forEach(conn => {
          conn.socket.emit('display-content', {
            audio: null,
            video: video ? {
              filename: video.filename,
              url: `/generated_files/${video.filename}`,
              emotion: video.emotion
            } : null,
            text: response,
            emotion: detectedEmotion
          });
        });
        
        console.log(`📱 Sent content (no audio) to ${hologramConnections.length} mobile displays`);
      }
      
      socket.emit('status', { state: 'idle' });
      session.isProcessing = false;
      
    } catch (error) {
      console.error('Text processing error:', error);
      const session = sessions.get(socket.id);
      if (session) session.isProcessing = false;
      
      socket.emit('error', {
        message: 'Failed to process text',
        error: error.message
      });
      socket.emit('status', { state: 'idle' });
    }
  });
  
  // Handle interruption
  socket.on('interrupt', () => {
    const session = sessions.get(socket.id);
    if (session) {
      session.isProcessing = false;
      socket.emit('status', { state: 'idle' });
    }
  });
  
  // Handle conversation reset
  socket.on('reset', () => {
    const session = sessions.get(socket.id);
    if (session) {
      session.conversationHistory = [];
      session.isProcessing = false;
      console.log('Conversation reset');
      socket.emit('reset-complete');
    }
  });
  
  // Handle latency ping
  socket.on('ping', (timestamp) => {
    socket.emit('pong', {
      clientTime: timestamp,
      serverTime: Date.now()
    });
  });
  
  // Clean up on disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    sessions.delete(socket.id);
    connections.delete(socket.id);
    metrics.connectedClients = connections.size;
  });
});

// Custom character request detection
function detectCustomCharacterRequest(userInput) {
  const text = userInput.toLowerCase();
  
  // Custom character triggers
  const customTriggers = [
    'be a', 'become a', 'turn into', 'transform into',
    'can you be', 'could you be', 'please be',
    'show me a', 'let me see a', 'i want a',
    'be like a', 'act like a'
  ];

  const hasCustomRequest = customTriggers.some(trigger => text.includes(trigger));
  
  if (!hasCustomRequest) {
    return null;
  }

  // Extract the character description
  let characterDescription = text;
  for (const trigger of customTriggers) {
    if (text.includes(trigger)) {
      const parts = text.split(trigger);
      if (parts.length > 1) {
        characterDescription = parts[1].trim();
        // Clean punctuation
        characterDescription = characterDescription.replace(/[?!.,;:]/g, '').trim();
        // Extract character description - take first 1-3 meaningful words
        const words = characterDescription.split(' ');
        const stopWords = ['and', 'tell', 'show', 'me', 'the', 'a', 'an', 'that', 'can', 'will', 'would', 'should', 'please', 'now', 'today', 'tomorrow', 'about', 'what', 'how', 'why', 'when', 'where'];
        
        // Find meaningful character words (skip common stop words)
        let characterWords = [];
        for (let i = 0; i < Math.min(4, words.length); i++) {
          const word = words[i].toLowerCase();
          if (!stopWords.includes(word) && word.length > 1) {
            characterWords.push(word);
            // Stop at 2-3 character words or if we hit a stop word after getting at least one word
            if (characterWords.length >= 2 || (characterWords.length >= 1 && i < words.length - 1 && stopWords.includes(words[i + 1]))) {
              break;
            }
          }
        }
        
        // Use the character words we found, or fallback to first word
        if (characterWords.length > 0) {
          characterDescription = characterWords.join(' ');
        } else {
          characterDescription = words[0] || 'character';
        }
        break;
      }
    }
  }

  console.log(`🎯 Custom character request detected: "${characterDescription}"`);
  return characterDescription;
}

// Enhanced emotion detection from user input and AI response
function detectEmotionFromText(userInput, aiResponse) {
  // Combine both user input and AI response for analysis
  const combinedText = `${userInput} ${aiResponse}`.toLowerCase();
  
  const emotionPatterns = {
    'anger': ['angry', 'mad', 'furious', 'rage', 'pissed', 'irritated', 'annoyed', 'frustrated', 'upset', 'hate', 'disgusting', 'terrible', 'awful', 'stupid', 'damn', 'shit', 'fuck'],
    'sadness': ['sad', 'crying', 'depressed', 'miserable', 'heartbroken', 'grief', 'sorrow', 'melancholy', 'blue', 'down', 'disappointed', 'sorry', 'unfortunately', 'tragic', 'loss'],
    'happiness': ['happy', 'joy', 'joyful', 'cheerful', 'delighted', 'pleased', 'glad', 'content', 'satisfied', 'great', 'wonderful', 'amazing', 'fantastic', 'awesome', 'excellent', 'perfect', 'love', 'smile', 'laugh'],
    'fear': ['afraid', 'scared', 'terrified', 'frightened', 'nervous', 'worried', 'anxious', 'panic', 'dread', 'horror', 'concern', 'stress'],
    'surprise': ['wow', 'omg', 'whoa', 'incredible', 'unbelievable', 'shocking', 'amazing', 'astonishing', 'unexpected', 'sudden', 'surprise'],
    'disgust': ['disgusting', 'gross', 'yuck', 'eww', 'revolting', 'repulsive', 'nasty', 'sick', 'vomit'],
    'excitement': ['excited', 'thrilled', 'enthusiastic', 'pumped', 'energetic', 'hyped', 'eager', 'fired up', 'ready', "let's go"],
    'calm': ['calm', 'peaceful', 'relaxed', 'serene', 'tranquil', 'quiet', 'still', 'zen', 'meditation', 'breathe'],
    'anxiety': ['anxious', 'stressed', 'nervous', 'worried', 'tense', 'overwhelmed', 'panic', 'restless'],
    'joy': ['joy', 'bliss', 'elated', 'euphoric', 'ecstatic', 'overjoyed', 'celebration', 'party', 'fun']
  };
  
  // Score-based detection for better accuracy
  let emotionScores = {};
  
  for (const [emotion, patterns] of Object.entries(emotionPatterns)) {
    emotionScores[emotion] = 0;
    for (const pattern of patterns) {
      // Count occurrences of each pattern
      const matches = (combinedText.match(new RegExp(pattern, 'g')) || []).length;
      emotionScores[emotion] += matches;
    }
  }
  
  // Find the emotion with the highest score
  let maxEmotion = 'neutral';
  let maxScore = 0;
  
  for (const [emotion, score] of Object.entries(emotionScores)) {
    if (score > maxScore) {
      maxScore = score;
      maxEmotion = emotion;
    }
  }
  
  console.log('🎭 Emotion detection scores:', emotionScores, 'Selected:', maxEmotion);
  
  return maxScore > 0 ? maxEmotion : 'neutral';
}

// Initialize services
async function initialize() {
  try {
    console.log('🚀 Initializing Integrated Pocket Soul App...');
    
    // Initialize video emotion mapper
    await videoEmotionMapper.initialize();
    
    // Start server
    server.listen(PORT, () => {
      console.log('');
      console.log('🎙️🎬 Integrated Pocket Soul - Audio + Video Streaming');
      console.log('=====================================================');
      console.log(`📡 Local URL: http://localhost:${PORT}`);
      console.log(`📱 Network URL: http://${LOCAL_IP}:${PORT}`);
      console.log(`📱 Mobile Interface: http://${LOCAL_IP}:${PORT}/mobile`);
      console.log('');
      console.log('🎯 Features:');
      console.log('   - Real-time voice conversations with AI');
      console.log('   - Emotion-based video streaming');
      console.log('   - Mobile hologram display support');
      console.log('');
      console.log('💡 Services:');
      console.log(`   - Gemini 2.5 Flash: ${geminiService.isReady() ? '✅' : '❌'}`);
      console.log(`   - ElevenLabs TTS: ${elevenLabsStream.isReady() ? '✅' : '❌'}`);
      console.log(`   - Whisper STT: ✅`);
      console.log(`   - Video Mapper: ${videoEmotionMapper.initialized ? '✅' : '❌'}`);
      console.log(`   - Available Videos: ${videoEmotionMapper.getStats().totalVideos}`);
      console.log(`   - Available Emotions: ${videoEmotionMapper.getAllEmotions().join(', ')}`);
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
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the application
initialize();