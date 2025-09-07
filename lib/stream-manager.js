const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class StreamManager {
  constructor(io) {
    this.io = io;
    this.activeStreams = new Map();
    this.frameBuffers = new Map();
    
    this.streamConfig = {
      fps: 30,
      quality: 0.8,
      chunkSize: 16384, // 16KB chunks
      maxBufferSize: 100 // Max frames to buffer
    };
    
    this.metrics = {
      totalFramesSent: 0,
      totalBytesSent: 0,
      activeStreams: 0
    };
  }
  
  async startVideoStream(videoUrl, clientIds) {
    const streamId = this.generateStreamId();
    
    console.log(`📹 Starting video stream ${streamId} to ${clientIds.length} clients`);
    
    const stream = {
      id: streamId,
      url: videoUrl,
      clients: new Set(clientIds),
      active: true,
      frameCount: 0,
      startTime: Date.now()
    };
    
    this.activeStreams.set(streamId, stream);
    this.metrics.activeStreams++;
    
    // Start streaming the video
    this.streamVideo(stream);
    
    return streamId;
  }
  
  async streamVideo(stream) {
    try {
      // For local files
      if (stream.url.startsWith('/')) {
        await this.streamLocalVideo(stream);
      } 
      // For remote URLs
      else if (stream.url.startsWith('http')) {
        await this.streamRemoteVideo(stream);
      }
      // For base64 data
      else if (stream.url.startsWith('data:')) {
        await this.streamBase64Video(stream);
      }
    } catch (error) {
      console.error(`Stream error ${stream.id}:`, error);
      this.stopStream(stream.id);
    }
  }
  
  async streamLocalVideo(stream) {
    const videoPath = path.join(__dirname, '..', 'public', stream.url);
    
    try {
      const videoData = await fs.readFile(videoPath);
      
      // For now, send as chunks
      // In production, you'd extract frames using ffmpeg
      const chunks = this.chunkData(videoData);
      
      for (const chunk of chunks) {
        if (!stream.active) break;
        
        // Send to all clients in the stream
        stream.clients.forEach(clientId => {
          this.io.to(clientId).emit('video-chunk', {
            streamId: stream.id,
            chunk: chunk,
            frameNumber: stream.frameCount++,
            timestamp: Date.now()
          });
        });
        
        this.metrics.totalFramesSent++;
        this.metrics.totalBytesSent += chunk.length;
        
        // Control frame rate
        await this.delay(1000 / this.streamConfig.fps);
      }
      
      // Loop the video
      if (stream.active) {
        stream.frameCount = 0;
        this.streamLocalVideo(stream);
      }
      
    } catch (error) {
      console.error(`Failed to stream local video:`, error);
    }
  }
  
  async streamRemoteVideo(stream) {
    try {
      // Download video from URL
      console.log(`Downloading video from: ${stream.url}`);
      const response = await axios.get(stream.url, {
        responseType: 'arraybuffer'
      });
      
      const videoBuffer = Buffer.from(response.data);
      
      // Process and stream
      await this.streamBuffer(stream, videoBuffer);
      
    } catch (error) {
      console.error(`Failed to stream remote video:`, error);
    }
  }
  
  async streamBase64Video(stream) {
    // Extract base64 data
    const base64Data = stream.url.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');
    
    await this.streamBuffer(stream, videoBuffer);
  }
  
  async streamBuffer(stream, buffer) {
    const chunks = this.chunkData(buffer);
    
    for (const chunk of chunks) {
      if (!stream.active) break;
      
      stream.clients.forEach(clientId => {
        this.io.to(clientId).emit('video-chunk', {
          streamId: stream.id,
          chunk: chunk,
          frameNumber: stream.frameCount++,
          timestamp: Date.now(),
          isVideo: true
        });
      });
      
      this.metrics.totalFramesSent++;
      this.metrics.totalBytesSent += chunk.length;
      
      await this.delay(1000 / this.streamConfig.fps);
    }
    
    // Loop if still active
    if (stream.active) {
      stream.frameCount = 0;
      await this.streamBuffer(stream, buffer);
    }
  }
  
  async streamAudio(audioBuffer, clientIds) {
    if (!audioBuffer) return;
    
    const streamId = this.generateStreamId();
    
    console.log(`🔊 Streaming audio to ${clientIds.length} clients`);
    
    // Convert buffer to base64 for transmission
    const audioBase64 = audioBuffer.toString('base64');
    
    // Send audio to all specified clients
    clientIds.forEach(clientId => {
      this.io.to(clientId).emit('audio-stream', {
        streamId,
        audio: audioBase64,
        timestamp: Date.now()
      });
    });
    
    return streamId;
  }
  
  // Stream frame-by-frame (for canvas streaming)
  streamFrame(frameData, clientIds) {
    const timestamp = Date.now();
    
    clientIds.forEach(clientId => {
      this.io.to(clientId).emit('frame', {
        buffer: frameData,
        timestamp,
        frameNumber: this.metrics.totalFramesSent
      });
    });
    
    this.metrics.totalFramesSent++;
    this.metrics.totalBytesSent += frameData.byteLength || 0;
  }
  
  stopStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    
    if (stream) {
      stream.active = false;
      
      // Notify clients
      stream.clients.forEach(clientId => {
        this.io.to(clientId).emit('stream-ended', {
          streamId: stream.id
        });
      });
      
      this.activeStreams.delete(streamId);
      this.metrics.activeStreams--;
      
      console.log(`⏹️ Stopped stream ${streamId}`);
    }
  }
  
  // Add client to existing stream
  addClientToStream(streamId, clientId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.clients.add(clientId);
      console.log(`Added client ${clientId} to stream ${streamId}`);
    }
  }
  
  // Remove client from stream
  removeClientFromStream(streamId, clientId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.clients.delete(clientId);
      
      // Stop stream if no clients left
      if (stream.clients.size === 0) {
        this.stopStream(streamId);
      }
    }
  }
  
  // Utility functions
  chunkData(data, chunkSize = this.streamConfig.chunkSize) {
    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  generateStreamId() {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Get stream metrics
  getMetrics() {
    return {
      ...this.metrics,
      streams: Array.from(this.activeStreams.values()).map(s => ({
        id: s.id,
        clients: s.clients.size,
        frameCount: s.frameCount,
        duration: Date.now() - s.startTime
      }))
    };
  }
  
  // Clean up all streams
  cleanup() {
    this.activeStreams.forEach(stream => {
      this.stopStream(stream.id);
    });
  }
}

module.exports = StreamManager;