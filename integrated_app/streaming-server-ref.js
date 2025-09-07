const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const ip = require('ip');
const QRCode = require('qrcode');
const cors = require('cors');
const compression = require('compression');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8, // 100MB
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const LOCAL_IP = ip.address();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store active connections
const connections = new Map();
let streamingActive = false;
let currentMode = 'websocket'; // websocket, webrtc, hls

// Performance metrics
const metrics = {
  framesSent: 0,
  bytesTransferred: 0,
  averageLatency: 0,
  connectedClients: 0,
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
  
  // Generate QR codes
  const qrCodes = {};
  for (const [key, url] of Object.entries(urls)) {
    qrCodes[key] = await QRCode.toDataURL(`${url}/mobile`);
  }
  
  res.json({
    urls,
    qrCodes,
    metrics,
    mode: currentMode,
    streaming: streamingActive
  });
});

app.get('/api/metrics', (req, res) => {
  res.json({
    ...metrics,
    uptime: Date.now() - metrics.startTime,
    fps: metrics.framesSent / ((Date.now() - metrics.startTime) / 1000)
  });
});

// Test video streaming
app.get('/api/video/:filename', (req, res) => {
  const videoPath = path.join(__dirname, 'public', req.params.filename);
  
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

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  connections.set(socket.id, {
    socket,
    connectedAt: Date.now(),
    framesReceived: 0,
    latencies: []
  });
  
  metrics.connectedClients = connections.size;
  
  // Send initial configuration
  socket.emit('config', {
    mode: currentMode,
    streaming: streamingActive,
    serverTime: Date.now()
  });
  
  // Handle streaming mode changes
  socket.on('set-mode', (mode) => {
    currentMode = mode;
    console.log(`Streaming mode changed to: ${mode}`);
    io.emit('mode-changed', mode);
  });
  
  // Handle frame streaming (from desktop to mobile)
  socket.on('stream-frame', (data) => {
    if (!streamingActive) return;
    
    metrics.framesSent++;
    metrics.bytesTransferred += data.buffer ? data.buffer.byteLength : 0;
    
    // Broadcast to all connected mobile clients
    socket.broadcast.emit('frame', data);
  });
  
  // Handle latency ping
  socket.on('ping', (timestamp) => {
    socket.emit('pong', {
      clientTime: timestamp,
      serverTime: Date.now()
    });
  });
  
  // Handle metrics update
  socket.on('client-metrics', (data) => {
    const client = connections.get(socket.id);
    if (client) {
      client.latencies.push(data.latency);
      if (client.latencies.length > 10) {
        client.latencies.shift();
      }
      
      // Calculate average latency across all clients
      let totalLatency = 0;
      let count = 0;
      connections.forEach(c => {
        if (c.latencies.length > 0) {
          const avg = c.latencies.reduce((a, b) => a + b, 0) / c.latencies.length;
          totalLatency += avg;
          count++;
        }
      });
      
      if (count > 0) {
        metrics.averageLatency = Math.round(totalLatency / count);
      }
    }
  });
  
  // Start/stop streaming
  socket.on('start-stream', () => {
    streamingActive = true;
    console.log('Streaming started');
    io.emit('stream-status', true);
  });
  
  socket.on('stop-stream', () => {
    streamingActive = false;
    console.log('Streaming stopped');
    io.emit('stream-status', false);
  });
  
  // WebRTC signaling
  socket.on('webrtc-offer', (offer) => {
    socket.broadcast.emit('webrtc-offer', offer);
  });
  
  socket.on('webrtc-answer', (answer) => {
    socket.broadcast.emit('webrtc-answer', answer);
  });
  
  socket.on('webrtc-ice', (candidate) => {
    socket.broadcast.emit('webrtc-ice', candidate);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    connections.delete(socket.id);
    metrics.connectedClients = connections.size;
  });
});

// Start server
server.listen(PORT, () => {
  console.log('');
  console.log('🚀 Pocket Soul Streaming Test Server');
  console.log('=====================================');
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`📱 Network URL: http://${LOCAL_IP}:${PORT}`);
  console.log(`📱 Mobile Interface: http://${LOCAL_IP}:${PORT}/mobile`);
  console.log('');
  console.log('📝 Instructions:');
  console.log('1. Open the desktop control panel in your browser');
  console.log('2. Scan the QR code with your phone or enter the mobile URL');
  console.log('3. Test different streaming modes');
  console.log('');
  console.log('🔧 Tunnel Options:');
  console.log(`   ngrok: ngrok http ${PORT}`);
  console.log(`   localtunnel: npx localtunnel --port ${PORT}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});