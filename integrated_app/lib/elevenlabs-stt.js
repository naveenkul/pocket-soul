const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class ElevenLabsSTT {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.apiUrl = 'https://api.elevenlabs.io/v1/speech-to-text';
    this.modelId = 'scribe-v1'; // Using the Scribe v1 model for high accuracy
    this.ready = true;
  }
  
  isReady() {
    return this.ready && this.apiKey;
  }
  
  /**
   * Transcribe audio buffer using ElevenLabs STT API
   * @param {Buffer} audioBuffer - Audio data as buffer
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioBuffer, options = {}) {
    try {
      // Create form data
      const formData = new FormData();
      
      // Add audio file as blob
      formData.append('audio', audioBuffer, {
        filename: 'audio.webm',
        contentType: 'audio/webm'
      });
      
      // Add model ID
      formData.append('model_id', this.modelId);
      
      // Add optional parameters
      if (options.language_code) {
        formData.append('language_code', options.language_code);
      } else {
        // Auto-detect language
        formData.append('language_code', 'auto');
      }
      
      // Enable word-level timestamps
      if (options.include_word_timestamps !== false) {
        formData.append('include_word_timestamps', 'true');
      }
      
      // Enable speaker diarization if needed
      if (options.diarize) {
        formData.append('diarize', 'true');
        if (options.num_speakers) {
          formData.append('num_speakers', options.num_speakers.toString());
        }
      }
      
      // Make API request
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          ...formData.getHeaders()
        },
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs STT API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json();
      
      return {
        text: result.text,
        language: result.language_code,
        confidence: result.language_probability,
        words: result.words,
        duration: result.audio_duration
      };
      
    } catch (error) {
      console.error('ElevenLabs STT error:', error);
      throw error;
    }
  }
  
  /**
   * Transcribe audio file from path
   * @param {string} filePath - Path to audio file
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeFile(filePath, options = {}) {
    try {
      const audioBuffer = fs.readFileSync(filePath);
      return await this.transcribeAudio(audioBuffer, options);
    } catch (error) {
      console.error('Error reading audio file:', error);
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
   * Stream transcription for real-time processing (when available)
   * Note: Currently ElevenLabs doesn't support real-time STT, this is a placeholder
   */
  async streamTranscription(audioStream, onTranscript) {
    console.warn('Real-time STT not yet available from ElevenLabs. Using batch processing instead.');
    // For now, we'll collect chunks and process them
    // This will be updated when ElevenLabs releases real-time STT
  }
}

module.exports = ElevenLabsSTT;