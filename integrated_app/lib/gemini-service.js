const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest" 
    });
    
    // Pocket Soul character personality
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
    
    this.ready = true;
  }
  
  isReady() {
    return this.ready;
  }
  
  async generateResponse(userInput, conversationHistory = []) {
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
      
      // Add recent conversation history (last 5 exchanges)
      const recentHistory = conversationHistory.slice(-10);
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
      const result = await this.model.generateContent(context);
      const response = result.response.text();
      
      // Clean up response
      let cleanResponse = response
        .replace(/^Pocket Soul:?\s*/i, '') // Remove any role prefix
        .replace(/\*([^*]+)\*/g, '') // Remove asterisk actions completely
        .trim();
      
      // Ensure response isn't too long for natural speech
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
  
  // Generate a greeting based on time of day
  async generateGreeting() {
    const hour = new Date().getHours();
    let timeGreeting = "Hello";
    
    if (hour < 12) {
      timeGreeting = "Good morning";
    } else if (hour < 17) {
      timeGreeting = "Good afternoon";
    } else {
      timeGreeting = "Good evening";
    }
    
    const greetings = [
      `${timeGreeting}! I'm Pocket Soul, your holographic friend! How can I brighten your day?`,
      `${timeGreeting}! It's me, Pocket Soul! Ready for an awesome conversation?`,
      `${timeGreeting}! I'm so happy you're here! What's on your mind today?`
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
}

module.exports = GeminiService;