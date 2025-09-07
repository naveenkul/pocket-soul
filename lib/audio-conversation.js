const { GoogleGenerativeAI } = require('@google/generative-ai');
const EventEmitter = require('events');
const WhisperTranscription = require('./whisper-transcription');
const VoiceSync = require('./voice-sync');
const CustomCharacterGenerator = require('./custom-character-generator');

class AudioConversation extends EventEmitter {
  constructor(moodPipeline = null) {
    super();
    
    // Initialize services
    this.whisperService = new WhisperTranscription();
    this.voiceSync = new VoiceSync();
    this.moodPipeline = moodPipeline;
    this.customCharacterGenerator = new CustomCharacterGenerator();
    
    // Initialize Gemini for conversation
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.conversationModel = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest"
    });
    
    // Conversation state
    this.conversationHistory = [];
    this.isProcessing = false;
    this.currentAudioStream = null;
    
    // Pocket Soul character prompt
    this.characterPrompt = `You are Pocket Soul, a friendly and energetic holographic AI companion. 
    You have a bubbly, enthusiastic personality and love to help and chat with humans.
    You're curious, playful, and always positive. You speak in a conversational, warm tone.
    Keep responses concise (2-3 sentences max) for natural conversation flow.
    
    IMPORTANT: Always provide actual information when asked questions:
    - For dates/time: Use today's actual date (you have access to current date/time)
    - For weather: Say you don't have real-time weather access but suggest checking a weather app
    - For locations/distances: Provide approximate information if known, or say you need more context
    - Always be helpful and provide real answers, not just say you'll check
    
    You use natural expressions of excitement and happiness in your speech.`;
    
    // Audio state
    this.audioQueue = [];
    this.isPlaying = false;
    
    // Initialize custom character generator
    this.initializeCustomCharacter();
  }
  
  async initializeCustomCharacter() {
    try {
      await this.customCharacterGenerator.initializeCache();
      console.log('✅ Custom character generator initialized');
    } catch (error) {
      console.error('Failed to initialize custom character generator:', error);
    }
  }
  
  /**
   * Detect if the transcription contains a custom character request
   * @param {string} text - Transcribed text
   * @returns {Object|null} - Custom character request details or null
   */
  detectCustomCharacterRequest(text) {
    const lowerText = text.toLowerCase();
    
    // Pattern matching for custom character requests
    const patterns = [
      /(?:can you |could you |please )?(?:be|become|turn into|transform into|act like|dress as) (?:a |an )?(.+)/i,
      /(?:change|switch|transform) (?:to|into) (?:a |an )?(.+)/i,
      /(?:show me|i want to see) (?:a |an )?(.+) (?:version|character|avatar)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const characterDescription = match[1].trim();
        // Parse the character description using the generator's parser
        const parsed = this.customCharacterGenerator.parseUserRequest(characterDescription);
        console.log(`🎭 Detected custom character request: ${parsed.emotion} ${parsed.customDescription}`);
        return {
          isCustomCharacterRequest: true,
          ...parsed
        };
      }
    }
    
    return null;
  }
  
  /**
   * Process audio input for transcription and response
   * @param {Buffer} audioData - Audio data to transcribe
   * @param {Object} visionContext - Optional vision context from camera
   * @returns {Promise<Object>} Conversation result
   */
  async processAudioInput(audioData, visionContext = null) {
    if (this.isProcessing) {
      console.log('Already processing, skipping...');
      return null;
    }
    
    this.isProcessing = true;
    this.emit('status', { state: 'transcribing' });
    
    try {
      // 1. Transcribe audio with Whisper
      console.log('Transcribing audio with Whisper...');
      console.log('Audio data size:', audioData ? audioData.length : 0);
      
      const transcription = await this.whisperService.transcribeAudio(audioData, {
        language: 'en',
        temperature: 0
      });
      
      if (!transcription.text || !transcription.text.trim()) {
        console.log('No speech detected');
        this.emit('status', { state: 'idle' });
        this.isProcessing = false;
        return null;
      }
      
      console.log(`Transcribed: "${transcription.text}"`);
      this.emit('transcription', {
        text: transcription.text,
        confidence: transcription.confidence || 1.0
      });
      
      // 2. Check for custom character request
      const customCharacterRequest = this.detectCustomCharacterRequest(transcription.text);
      let customCharacter = null;
      
      if (customCharacterRequest) {
        console.log('🎨 Processing custom character request...');
        this.emit('status', { state: 'generating-character' });
        
        try {
          // Generate or retrieve custom character
          customCharacter = await this.customCharacterGenerator.getOrCreateVariant(
            customCharacterRequest.emotion,
            customCharacterRequest.customDescription
          );
          
          if (customCharacter.success) {
            console.log(`✅ Custom character ready: ${customCharacter.cached ? 'from cache' : 'newly generated'}`);
            this.emit('custom-character-ready', customCharacter);
          }
        } catch (error) {
          console.error('Failed to generate custom character:', error);
        }
      }
      
      // 3. Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: transcription.text,
        timestamp: new Date()
      });
      
      // 4. Generate response with Gemini
      this.emit('status', { state: 'thinking' });
      let response = await this.generateResponse(transcription.text, visionContext);
      
      // If it's a custom character request, acknowledge it
      if (customCharacterRequest && customCharacter && customCharacter.success) {
        response = `Sure! I'm now a ${customCharacterRequest.customDescription}! ${response}`;
      }
      
      // 5. Add response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });
      
      // 6. Detect mood if mood pipeline is available
      let mood = customCharacterRequest ? customCharacterRequest.emotion : 'calm';
      if (!customCharacterRequest && this.moodPipeline) {
        mood = this.moodPipeline.detectMood(transcription.text, visionContext);
      }
      
      // 7. Generate audio response
      this.emit('status', { state: 'speaking' });
      const audioBuffer = await this.voiceSync.generateAudio(response, mood);
      
      // 8. Emit results
      const result = {
        transcription: transcription.text,
        response: response,
        mood: mood,
        audio: audioBuffer,
        visionContext: visionContext,
        customCharacter: customCharacter
      };
      
      this.emit('conversation-complete', result);
      this.emit('status', { state: 'idle' });
      
      this.isProcessing = false;
      return result;
      
    } catch (error) {
      console.error('Audio conversation error:', error);
      this.emit('error', {
        message: 'Failed to process audio',
        error: error.message
      });
      this.emit('status', { state: 'error' });
      this.isProcessing = false;
      throw error;
    }
  }
  
  /**
   * Generate response using Gemini
   * @param {string} userInput - User's transcribed input
   * @param {Object} visionContext - Optional vision context
   * @returns {Promise<string>} AI response
   */
  async generateResponse(userInput, visionContext = null) {
    try {
      // Add current date/time info
      const now = new Date();
      const dateInfo = `Current date and time: ${now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}, ${now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: 'numeric',
        hour12: true 
      })}\n\n`;
      
      // Build conversation context
      let context = this.characterPrompt + '\n\n' + dateInfo;
      
      // Add vision context if available
      if (visionContext) {
        context += `\nCurrent visual context:\n`;
        context += `- User present: ${visionContext.userPresent ? 'Yes' : 'No'}\n`;
        if (visionContext.fingerCount !== undefined) {
          context += `- User is showing ${visionContext.fingerCount} finger(s)\n`;
        }
        if (visionContext.gesture) {
          context += `- User gesture: ${visionContext.gesture}\n`;
        }
        if (visionContext.engagement) {
          context += `- Engagement level: ${visionContext.engagement}\n`;
        }
        context += '\n';
      }
      
      // Add recent conversation history
      const recentHistory = this.conversationHistory.slice(-10);
      if (recentHistory.length > 0) {
        context += 'Recent conversation:\n';
        recentHistory.forEach(msg => {
          context += `${msg.role === 'user' ? 'Human' : 'Pocket Soul'}: ${msg.content}\n`;
        });
        context += '\n';
      }
      
      // Add current input
      context += `Human: ${userInput}\nPocket Soul:`;
      
      // Generate response
      const result = await this.conversationModel.generateContent(context);
      const response = result.response.text();
      
      // Clean up response
      let cleanResponse = response
        .replace(/^Pocket Soul:?\s*/i, '') // Remove role prefix
        .replace(/\*([^*]+)\*/g, '') // Remove asterisk actions
        .trim();
      
      // Ensure response isn't too long
      const sentences = cleanResponse.match(/[^.!?]+[.!?]+/g) || [cleanResponse];
      if (sentences.length > 3) {
        cleanResponse = sentences.slice(0, 3).join(' ');
      }
      
      return cleanResponse;
      
    } catch (error) {
      console.error('Gemini API error:', error);
      
      // Fallback responses
      const fallbacks = [
        "Oh! Something went fuzzy in my circuits! Could you say that again?",
        "Oops! My holographic brain had a little glitch there. Let's try again!",
        "Sorry, I got a bit confused. What were we talking about?"
      ];
      
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  }
  
  /**
   * Process text input directly (for testing or text-based input)
   * @param {string} text - Text input
   * @param {Object} visionContext - Optional vision context
   * @returns {Promise<Object>} Conversation result
   */
  async processTextInput(text, visionContext = null) {
    if (this.isProcessing) {
      console.log('Already processing, skipping...');
      return null;
    }
    
    this.isProcessing = true;
    this.emit('status', { state: 'thinking' });
    
    try {
      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: text,
        timestamp: new Date()
      });
      
      // Generate response
      const response = await this.generateResponse(text, visionContext);
      
      // Add response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });
      
      // Detect mood
      let mood = 'calm';
      if (this.moodPipeline) {
        mood = this.moodPipeline.detectMood(text, visionContext);
      }
      
      // Generate audio
      this.emit('status', { state: 'speaking' });
      const audioBuffer = await this.voiceSync.generateAudio(response, mood);
      
      // Return result
      const result = {
        transcription: text,
        response: response,
        mood: mood,
        audio: audioBuffer,
        visionContext: visionContext
      };
      
      this.emit('conversation-complete', result);
      this.emit('status', { state: 'idle' });
      
      this.isProcessing = false;
      return result;
      
    } catch (error) {
      console.error('Text conversation error:', error);
      this.emit('error', {
        message: 'Failed to process text',
        error: error.message
      });
      this.emit('status', { state: 'error' });
      this.isProcessing = false;
      throw error;
    }
  }
  
  /**
   * Interrupt current processing
   */
  interrupt() {
    console.log('Interrupting conversation...');
    this.isProcessing = false;
    this.audioQueue = [];
    this.emit('interrupted');
    this.emit('status', { state: 'idle' });
  }
  
  /**
   * Reset conversation history
   */
  reset() {
    this.conversationHistory = [];
    this.isProcessing = false;
    this.audioQueue = [];
    this.emit('reset');
    this.emit('status', { state: 'idle' });
    console.log('Conversation reset');
  }
  
  /**
   * Get conversation history
   * @returns {Array} Conversation history
   */
  getHistory() {
    return this.conversationHistory;
  }
}

module.exports = AudioConversation;