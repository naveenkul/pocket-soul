const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class ElevenLabsStream {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = 'emSmWzY0c0xtx5IFMCVv'; // Specified voice ID
    this.modelId = 'eleven_turbo_v2_5'; // Latest turbo model for low latency
    this.activeStreams = new Map();
    this.ready = true;
  }
  
  isReady() {
    return this.ready && this.apiKey;
  }
  
  async streamText(text, onAudioChunk, onComplete) {
    const streamId = uuidv4();
    
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket connection with timeout
        const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.modelId}&optimize_streaming_latency=4`;
        const ws = new WebSocket(wsUrl, {
          handshakeTimeout: 10000, // 10 second timeout
          perMessageDeflate: false
        });
        
        // Store stream reference
        this.activeStreams.set(streamId, { ws, active: true });
        
        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.error('WebSocket connection timeout');
            ws.terminate();
            this.cleanupStream(streamId);
            reject(new Error('Connection timeout'));
          }
        }, 10000);
        
        // Connection opened
        ws.on('open', () => {
          clearTimeout(connectionTimeout);
          console.log('ElevenLabs WebSocket connected');
          
          // Send initial configuration
          const initMessage = {
            text: " ", // Initial space to start the stream
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            },
            generation_config: {
              chunk_length_schedule: [120, 160, 250, 290] // Optimized for low latency
            },
            xi_api_key: this.apiKey
          };
          
          try {
            ws.send(JSON.stringify(initMessage));
            
            // Stream text word by word for lowest latency
            this.streamTextInChunks(ws, text, streamId);
          } catch (error) {
            console.error('Error sending initial message:', error);
            this.cleanupStream(streamId);
            reject(error);
          }
        });
        
        // Handle incoming audio data
        ws.on('message', (data) => {
          try {
            const response = JSON.parse(data.toString());
            
            if (response.audio) {
              // Convert base64 audio to buffer
              const audioBuffer = Buffer.from(response.audio, 'base64');
              onAudioChunk(audioBuffer);
            }
            
            if (response.isFinal) {
              // Stream complete
              this.cleanupStream(streamId);
              onComplete();
              resolve(streamId);
            }
            
            if (response.error) {
              console.error('ElevenLabs error:', response.error);
              this.cleanupStream(streamId);
              reject(new Error(response.error));
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });
        
        // Handle errors
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.cleanupStream(streamId);
          reject(error);
        });
        
        // Handle close
        ws.on('close', () => {
          console.log('ElevenLabs WebSocket closed');
          this.cleanupStream(streamId);
        });
        
      } catch (error) {
        console.error('Failed to create stream:', error);
        reject(error);
      }
    });
  }
  
  streamTextInChunks(ws, text, streamId) {
    // Split text into words for streaming
    const words = text.split(' ');
    let currentChunk = '';
    let chunkIndex = 0;
    
    const sendChunk = () => {
      const stream = this.activeStreams.get(streamId);
      if (!stream || !stream.active) {
        return; // Stream was interrupted
      }
      
      if (chunkIndex >= words.length) {
        try {
          // Send final chunk with flush
          if (currentChunk.trim() && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              text: currentChunk + ' ',
              flush: true
            }));
          }
          
          // Send end of stream
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              text: '',
              flush: true
            }));
          }
        } catch (error) {
          console.error('Error sending final chunk:', error);
        }
        return;
      }
      
      // Build chunk word by word
      currentChunk += words[chunkIndex] + ' ';
      chunkIndex++;
      
      // Send chunk every few words or at punctuation
      const shouldSend = 
        chunkIndex % 3 === 0 || // Every 3 words
        currentChunk.match(/[.!?,;]/) || // At punctuation
        chunkIndex === words.length; // At end
      
      if (shouldSend) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              text: currentChunk,
              flush: currentChunk.match(/[.!?]/) !== null // Flush at sentence ends
            }));
            currentChunk = '';
          } else {
            console.warn('WebSocket not ready, skipping chunk');
            return;
          }
        } catch (error) {
          console.error('Error sending chunk:', error);
          return;
        }
      }
      
      // Continue streaming with small delay for natural pacing
      setTimeout(sendChunk, 50);
    };
    
    // Start streaming
    setTimeout(sendChunk, 100);
  }
  
  interrupt(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.active = false;
      if (stream.ws && stream.ws.readyState === WebSocket.OPEN) {
        // Send interrupt signal
        stream.ws.send(JSON.stringify({
          text: '',
          flush: true
        }));
        stream.ws.close();
      }
      this.activeStreams.delete(streamId);
      console.log(`Stream ${streamId} interrupted`);
    }
  }
  
  cleanupStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.active = false;
      if (stream.ws && stream.ws.readyState === WebSocket.OPEN) {
        stream.ws.close();
      }
      this.activeStreams.delete(streamId);
    }
  }
  
  // Alternative: Use REST API for simpler implementation
  async generateAudioREST(text) {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          body: JSON.stringify({
            text: text,
            model_id: this.modelId,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            }
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }
      
      const audioBuffer = await response.arrayBuffer();
      return Buffer.from(audioBuffer);
      
    } catch (error) {
      console.error('REST API error:', error);
      throw error;
    }
  }
}

module.exports = ElevenLabsStream;