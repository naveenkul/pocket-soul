const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

class WhisperTranscription {
  constructor() {
    this.openai = null;
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      console.log('✅ Whisper transcription service initialized');
    } else {
      console.warn('⚠️ OpenAI API key not found - transcription disabled');
    }
  }
  
  isReady() {
    return this.openai !== null;
  }
  
  /**
   * Transcribe audio buffer using OpenAI Whisper API
   * @param {Buffer} audioData - Audio data as buffer
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioData, options = {}) {
    if (!this.isReady()) {
      console.warn('Whisper not configured, returning placeholder');
      return {
        text: '[Transcription not available - OpenAI API key missing]',
        language: 'en',
        confidence: 0
      };
    }
    
    try {
      console.log('🎤 Transcribing audio with Whisper...');
      console.log('Audio data size:', audioData.length, 'bytes');
      
      // Write buffer to temp file for OpenAI
      const tempDir = os.tmpdir();
      const tempPath = path.join(tempDir, `whisper_${Date.now()}.webm`);
      
      // Write the audio data to file
      fs.writeFileSync(tempPath, audioData);
      
      // Create file stream
      const fileStream = fs.createReadStream(tempPath);
      
      // Call Whisper API
      const transcription = await this.openai.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1',
        language: options.language || 'en',
        response_format: 'json',
        temperature: 0
      });
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      console.log('✅ Transcription complete:', transcription.text);
      
      return {
        text: transcription.text || '',
        language: options.language || 'en',
        confidence: 1.0
      };
      
    } catch (error) {
      console.error('Whisper API error:', error);
      
      // Return placeholder on error
      return {
        text: `[Transcription error: ${error.message}]`,
        language: 'en',
        confidence: 0
      };
    }
  }
  
  /**
   * Transcribe audio from base64 string
   * @param {string} base64Audio - Base64 encoded audio
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeBase64(base64Audio, options = {}) {
    try {
      const audioData = Buffer.from(base64Audio, 'base64');
      return await this.transcribeAudio(audioData, options);
    } catch (error) {
      console.error('Error decoding base64 audio:', error);
      return {
        text: '[Transcription error]',
        language: 'en',
        confidence: 0
      };
    }
  }
}

module.exports = WhisperTranscription;