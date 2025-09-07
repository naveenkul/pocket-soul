const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

class WhisperService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.ready = true;
  }
  
  isReady() {
    return this.ready && process.env.OPENAI_API_KEY;
  }
  
  /**
   * Transcribe audio buffer using OpenAI Whisper API
   * @param {Buffer} audioBuffer - Audio data as buffer
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioBuffer, options = {}) {
    try {
      // Create a File object from the buffer
      // Whisper supports: mp3, mp4, mpeg, mpga, m4a, wav, webm
      const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
      
      // Call Whisper API
      const transcription = await this.openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: options.language || 'en', // Optional language hint
        prompt: options.prompt || undefined, // Optional context prompt
        response_format: options.verbose ? 'verbose_json' : 'json',
        temperature: options.temperature || 0 // 0 for deterministic, up to 1 for more creative
      });
      
      // Return formatted result
      if (options.verbose) {
        return {
          text: transcription.text,
          language: transcription.language,
          duration: transcription.duration,
          segments: transcription.segments,
          words: transcription.words
        };
      } else {
        return {
          text: transcription.text,
          language: options.language || 'en',
          confidence: 1.0 // Whisper doesn't provide confidence scores
        };
      }
      
    } catch (error) {
      console.error('Whisper API error:', error);
      
      // Handle specific OpenAI errors
      if (error.status === 413) {
        throw new Error('Audio file too large. Maximum size is 25MB.');
      } else if (error.status === 400) {
        throw new Error('Invalid audio format. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm');
      } else if (error.status === 401) {
        throw new Error('Invalid OpenAI API key');
      } else if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      throw error;
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
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      return await this.transcribeAudio(audioBuffer, options);
    } catch (error) {
      console.error('Error decoding base64 audio:', error);
      throw error;
    }
  }
  
  /**
   * Transcribe with timestamps (verbose mode)
   * @param {Buffer} audioBuffer - Audio data as buffer
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Detailed transcription with timestamps
   */
  async transcribeWithTimestamps(audioBuffer, options = {}) {
    return await this.transcribeAudio(audioBuffer, {
      ...options,
      verbose: true,
      response_format: 'verbose_json'
    });
  }
  
  /**
   * Stream transcription for real-time processing
   * Note: Whisper doesn't support real-time streaming yet, this processes chunks
   */
  async processAudioChunk(audioBuffer, options = {}) {
    // For now, process as a complete audio file
    // Real-time streaming may be added by OpenAI in the future
    return await this.transcribeAudio(audioBuffer, options);
  }
}

module.exports = WhisperService;