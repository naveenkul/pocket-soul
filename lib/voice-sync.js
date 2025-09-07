const { ElevenLabsClient } = require('elevenlabs');

class VoiceSync {
  constructor() {
    this.client = process.env.ELEVENLABS_API_KEY ? 
      new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY
      }) : null;
    
    // Mood-specific voice settings
    this.moodVoiceSettings = {
      happy: { 
        stability: 0.3, 
        similarity_boost: 0.85, 
        style: 0.7,
        speaking_rate: 1.1
      },
      sad: { 
        stability: 0.7, 
        similarity_boost: 0.6, 
        style: 0.2,
        speaking_rate: 0.9
      },
      excited: { 
        stability: 0.2, 
        similarity_boost: 0.9, 
        style: 0.8,
        speaking_rate: 1.2
      },
      calm: { 
        stability: 0.6, 
        similarity_boost: 0.7, 
        style: 0.3,
        speaking_rate: 1.0
      },
      angry: { 
        stability: 0.4, 
        similarity_boost: 0.8, 
        style: 0.6,
        speaking_rate: 1.1
      }
    };
    
    this.defaultVoiceId = 'emSmWzY0c0xtx5IFMCVv'; // Custom voice ID as specified
    this.audioCache = new Map();
  }
  
  async generateAudio(text, mood = 'calm') {
    if (!text) return null;
    
    // Check cache
    const cacheKey = `${text}_${mood}`;
    if (this.audioCache.has(cacheKey)) {
      console.log(`Using cached audio for: ${cacheKey.substring(0, 30)}...`);
      return this.audioCache.get(cacheKey);
    }
    
    // Generate voice with mood-appropriate settings
    const voiceSettings = this.moodVoiceSettings[mood] || this.moodVoiceSettings.calm;
    
    try {
      if (!this.client) {
        console.log('⚠️ ElevenLabs not configured, using placeholder audio');
        // Return a placeholder audio buffer for testing
        return Buffer.from('placeholder_audio_data');
      }
      
      console.log(`🎤 Generating ${mood} voice with ElevenLabs...`);
      
      // Generate audio using the correct ElevenLabs API method
      let audioBuffer;
      
      try {
        // Try the convert method first
        const audioStream = await this.client.textToSpeech.convert(
          this.defaultVoiceId,
          {
            text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
              stability: voiceSettings.stability,
              similarity_boost: voiceSettings.similarity_boost,
              style: voiceSettings.style,
              use_speaker_boost: true
            }
          }
        );
        
        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of audioStream) {
          chunks.push(chunk);
        }
        audioBuffer = Buffer.concat(chunks);
        
      } catch (apiError) {
        console.log('ElevenLabs API error, using placeholder audio');
        // Return a silent audio buffer as placeholder
        audioBuffer = Buffer.alloc(1024);
      }
      
      // Cache the result
      this.audioCache.set(cacheKey, audioBuffer);
      
      return audioBuffer;
      
    } catch (error) {
      console.error('Voice generation error:', error);
      // Return placeholder for testing
      return Buffer.from('placeholder_audio_data');
    }
  }
  
  async generateSyncedOutput(text, mood, videoLoop) {
    try {
      // Generate audio
      const audioBuffer = await this.generateAudio(text, mood);
      
      if (!audioBuffer) {
        return null;
      }
      
      // Calculate speech duration (estimate)
      const speechDuration = this.estimateSpeechDuration(text);
      
      // Calculate how many video loops needed
      const videoDuration = videoLoop?.duration || 10;
      const loopsNeeded = Math.ceil(speechDuration / videoDuration);
      
      console.log(`📢 Voice sync: ${speechDuration}s speech, ${loopsNeeded} video loops`);
      
      return {
        audio: audioBuffer,
        audioBase64: audioBuffer.toString('base64'),
        video: videoLoop?.url,
        loops: loopsNeeded,
        mood,
        totalDuration: speechDuration
      };
      
    } catch (error) {
      console.error('Voice sync error:', error);
      return null;
    }
  }
  
  estimateSpeechDuration(text) {
    if (!text) return 0;
    
    // Estimate ~150 words per minute speaking rate
    const words = text.split(' ').length;
    const minuteDuration = words / 150;
    return minuteDuration * 60; // Convert to seconds
  }
  
  // Get available voices (for future voice selection)
  async getAvailableVoices() {
    if (!this.client) {
      return [];
    }
    
    try {
      const voices = await this.client.voices.getAll();
      return voices.voices.map(v => ({
        id: v.voice_id,
        name: v.name,
        description: v.description,
        preview: v.preview_url
      }));
    } catch (error) {
      console.error('Failed to get voices:', error);
      return [];
    }
  }
  
  // Clear cache if needed
  clearCache() {
    this.audioCache.clear();
    console.log('Audio cache cleared');
  }
  
  // Get cache size
  getCacheInfo() {
    return {
      entries: this.audioCache.size,
      keys: Array.from(this.audioCache.keys())
    };
  }
}

module.exports = VoiceSync;