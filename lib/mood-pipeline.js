const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fal } = require('@fal-ai/client');
const fs = require('fs').promises;
const path = require('path');

class MoodPipeline {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.imageGen = this.genAI.getGenerativeModel({ 
      model: "gemini-2-5-flash-image"
    });
    
    // Set FAL_KEY environment variable for fal client
    if (process.env.FAL_API_KEY) {
      process.env.FAL_KEY = process.env.FAL_API_KEY;
    }
    
    // Reference character path
    this.referenceImagePath = path.join(__dirname, '..', 'assets', 'reference_character.png');
    this.referenceImageBase64 = null;
    
    // Mood configurations
    this.moodConfigs = {
      happy: {
        colors: 'bright cyan and yellow glow, sparkles',
        expression: 'wide smile, eyes squinted with joy',
        particles: 'golden sparkles floating upward',
        animation: 'bouncing gently, radiating light'
      },
      sad: {
        colors: 'deep blue and purple, dimmed glow',
        expression: 'downturned mouth, droopy eyes',
        particles: 'blue teardrops falling slowly',
        animation: 'slow swaying, slightly deflated'
      },
      excited: {
        colors: 'vibrant orange and pink, pulsing glow',
        expression: 'wide eyes, open mouth, raised eyebrows',
        particles: 'electric sparks and fireworks',
        animation: 'vibrating with energy, quick movements'
      },
      calm: {
        colors: 'soft green and blue, steady glow',
        expression: 'peaceful smile, half-closed eyes',
        particles: 'gentle floating orbs',
        animation: 'slow breathing motion, floating'
      },
      angry: {
        colors: 'red and orange, flickering flames',
        expression: 'furrowed brow, gritted teeth',
        particles: 'fire sparks and smoke',
        animation: 'shaking slightly, pulsing red'
      }
    };
    
    this.videoCache = new Map();
    this.avatarCache = new Map();
    this.currentMood = 'calm';
    this.generationCount = 0;
  }
  
  async initialize() {
    try {
      // Check if reference image exists, if not use a placeholder
      try {
        const imageBuffer = await fs.readFile(this.referenceImagePath);
        this.referenceImageBase64 = imageBuffer.toString('base64');
        console.log('✅ Reference character loaded');
      } catch (err) {
        console.log('⚠️ Reference character not found, will generate without reference');
        // Copy from test_apis if it exists
        try {
          const testImagePath = path.join(__dirname, '..', 'test_apis', 'reference_character.png');
          const imageBuffer = await fs.readFile(testImagePath);
          await fs.mkdir(path.dirname(this.referenceImagePath), { recursive: true });
          await fs.writeFile(this.referenceImagePath, imageBuffer);
          this.referenceImageBase64 = imageBuffer.toString('base64');
          console.log('✅ Copied reference character from test_apis');
        } catch (e) {
          console.log('Will generate avatars without reference image');
        }
      }
      
      // Pre-generate common moods
      await this.preGenerateCommonMoods();
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }
  
  detectMood(text, visionContext = null) {
    if (!text) return 'calm';
    
    const moodKeywords = {
      happy: ['happy', 'joy', 'great', 'awesome', 'wonderful', 'love', 'fantastic', 'good'],
      sad: ['sad', 'depressed', 'down', 'blue', 'unhappy', 'sorry', 'miss'],
      excited: ['excited', 'amazing', 'wow', 'incredible', 'fantastic', '!'],
      calm: ['calm', 'peaceful', 'relax', 'serene', 'quiet', 'meditation'],
      angry: ['angry', 'mad', 'furious', 'annoyed', 'frustrated', 'hate']
    };
    
    const lowerText = text.toLowerCase();
    
    let detectedMood = 'calm';
    for (const [mood, keywords] of Object.entries(moodKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        detectedMood = mood;
        break;
      }
    }
    
    // Adjust mood based on vision context if available
    if (visionContext) {
      // If no user present, be more subdued
      if (!visionContext.userPresent) {
        if (detectedMood === 'excited') detectedMood = 'happy';
        if (detectedMood === 'angry') detectedMood = 'calm';
      }
      
      // If user is actively engaging, be more responsive
      if (visionContext.engagement === 'active') {
        if (detectedMood === 'calm') detectedMood = 'happy';
      }
      
      // Special handling for finger counting
      if (visionContext.fingerCount > 0) {
        if (lowerText.includes('count') || lowerText.includes('finger') || lowerText.includes('number')) {
          detectedMood = 'excited';
        }
      }
    }
    
    return detectedMood;
  }
  
  async generateMoodAvatar(mood, visionContext = null) {
    // Modify cache key if vision context affects generation
    const cacheKey = visionContext && visionContext.userPresent ? `${mood}_present` : mood;
    
    // Check cache first
    if (this.avatarCache.has(cacheKey)) {
      console.log(`Using cached avatar for ${cacheKey}`);
      return this.avatarCache.get(cacheKey);
    }
    
    const config = this.moodConfigs[mood] || this.moodConfigs.calm;
    
    const prompt = `Generate a cute glowing holographic blob character for ${mood} mood:
    - Apply colors: ${config.colors}
    - Expression: ${config.expression}
    - Add particles: ${config.particles}
    - Keep translucent, holographic appearance
    - Friendly blob shape, suitable for hologram display
    - Style: Cute, Pixar-like, glowing hologram`;
    
    try {
      this.generationCount++;
      console.log(`🎨 Generating ${mood} avatar #${this.generationCount} with Gemini 2.5 Flash Image`);
      
      // For now, return a placeholder since actual Gemini API might need specific setup
      const result = {
        mood,
        imageData: `data:image/png;base64,${this.referenceImageBase64 || ''}`,
        generationNumber: this.generationCount
      };
      
      // Cache the result
      this.avatarCache.set(mood, result);
      
      return result;
    } catch (error) {
      console.error(`Failed to generate ${mood} avatar:`, error);
      return null;
    }
  }
  
  async generateTalkingAnimation(avatarImage, mood) {
    // Check cache first
    if (this.videoCache.has(mood)) {
      console.log(`Using cached animation for ${mood}`);
      return this.videoCache.get(mood);
    }
    
    const config = this.moodConfigs[mood] || this.moodConfigs.calm;
    
    const animationPrompt = `Create an 8-10 second seamless loop animation:
    - Character is talking with natural mouth movements
    - ${config.animation}
    - ${config.particles} effects
    - Perfect loop point for infinite playback
    - Holographic/translucent style`;
    
    try {
      console.log(`🎬 Generating ${mood} animation with Veo3...`);
      
      // For testing, return a placeholder video URL
      // In production, this would call fal.ai's Veo3 API
      const result = {
        url: '/test-video.mp4', // Placeholder
        duration: 10,
        mood
      };
      
      // Uncomment for actual Veo3 integration:
      /*
      const result = await fal.subscribe("fal-ai/veo3", {
        input: {
          image: avatarImage.imageData,
          prompt: animationPrompt,
          duration: 10,
          resolution: "512x512",
          loop: true
        }
      });
      */
      
      // Cache the video
      this.videoCache.set(mood, result);
      
      return result;
    } catch (error) {
      console.error(`Veo3 animation failed:`, error);
      return null;
    }
  }
  
  async preGenerateCommonMoods() {
    const commonMoods = ['happy', 'sad', 'calm'];
    
    console.log('Pre-generating common mood videos...');
    
    for (const mood of commonMoods) {
      if (this.videoCache.has(mood)) continue;
      
      try {
        const avatar = await this.generateMoodAvatar(mood);
        if (avatar) {
          const animation = await this.generateTalkingAnimation(avatar, mood);
          if (animation) {
            console.log(`✅ Pre-generated ${mood} mood`);
          }
        }
      } catch (error) {
        console.error(`Failed to pre-generate ${mood}:`, error);
      }
    }
  }
  
  async processUserInput(input, responseText, visionContext = null) {
    // Detect mood from input with vision context
    const mood = this.detectMood(input, visionContext);
    console.log(`Detected mood: ${mood}${visionContext ? ' (with vision context)' : ''}`);
    
    // Get or generate video for this mood
    let video = this.videoCache.get(mood);
    
    if (!video) {
      // Generate on the fly if not cached
      const avatar = await this.generateMoodAvatar(mood);
      if (avatar) {
        video = await this.generateTalkingAnimation(avatar, mood);
      }
    }
    
    return {
      mood,
      video: video || this.videoCache.get('calm'),
      responseText,
      generationCount: this.generationCount
    };
  }
}

module.exports = MoodPipeline;