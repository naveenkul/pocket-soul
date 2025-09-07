const fs = require('fs').promises;
const path = require('path');

class VideoEmotionMapper {
  constructor(generatedFilesPath = '../../generated_files') {
    this.generatedFilesPath = path.resolve(__dirname, generatedFilesPath);
    this.emotionVideoMap = new Map();
    this.availableVideos = [];
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.scanGeneratedVideos();
      this.buildEmotionMap();
      this.initialized = true;
      console.log('✅ Video-Emotion mapper initialized with', this.availableVideos.length, 'videos');
    } catch (error) {
      console.error('Failed to initialize video-emotion mapper:', error);
      throw error;
    }
  }

  async scanGeneratedVideos() {
    try {
      const files = await fs.readdir(this.generatedFilesPath);
      
      this.availableVideos = files
        .filter(file => file.endsWith('.mp4'))
        .map(file => {
          const emotion = this.extractEmotionFromFilename(file);
          return {
            filename: file,
            path: path.join(this.generatedFilesPath, file),
            emotion: emotion,
            timestamp: this.extractTimestampFromFilename(file)
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Most recent first

      console.log(`Found ${this.availableVideos.length} generated videos`);
      
    } catch (error) {
      console.error('Error scanning generated videos:', error);
      this.availableVideos = [];
    }
  }

  extractEmotionFromFilename(filename) {
    const emotions = [
      'anger', 'anxiety', 'calm', 'disgust', 'excitement', 'fear',
      'happiness', 'joy', 'love', 'neutral', 'sadness', 'surprise'
    ];
    
    // Add emotion aliases to handle variations
    const emotionAliases = {
      'happy': 'happiness',
      'excited': 'excitement',
      'sad': 'sadness'
    };
    
    const lowerFilename = filename.toLowerCase();
    
    // First check for direct matches
    for (const emotion of emotions) {
      if (lowerFilename.includes(emotion)) {
        return emotion;
      }
    }
    
    // Then check for aliases
    for (const [alias, emotion] of Object.entries(emotionAliases)) {
      if (lowerFilename.includes(alias)) {
        return emotion;
      }
    }
    
    return 'neutral';
  }

  extractTimestampFromFilename(filename) {
    const timestampMatch = filename.match(/(\d{8}_\d{6})/);
    if (timestampMatch) {
      const timestamp = timestampMatch[1];
      const year = parseInt(timestamp.substr(0, 4));
      const month = parseInt(timestamp.substr(4, 2)) - 1;
      const day = parseInt(timestamp.substr(6, 2));
      const hour = parseInt(timestamp.substr(9, 2));
      const minute = parseInt(timestamp.substr(11, 2));
      const second = parseInt(timestamp.substr(13, 2));
      
      return new Date(year, month, day, hour, minute, second).getTime();
    }
    
    return 0;
  }

  buildEmotionMap() {
    this.emotionVideoMap.clear();
    
    for (const video of this.availableVideos) {
      const emotion = video.emotion;
      
      if (!this.emotionVideoMap.has(emotion)) {
        this.emotionVideoMap.set(emotion, []);
      }
      
      this.emotionVideoMap.get(emotion).push(video);
    }
    
    console.log('Emotion map built:', Array.from(this.emotionVideoMap.keys()));
  }

  getVideoForEmotion(emotion, preferRecent = true) {
    if (!this.initialized) {
      console.warn('VideoEmotionMapper not initialized');
      return null;
    }

    emotion = emotion.toLowerCase();
    
    let videos = this.emotionVideoMap.get(emotion);
    
    if (!videos || videos.length === 0) {
      videos = this.getFallbackVideos(emotion);
    }
    
    if (!videos || videos.length === 0) {
      console.warn(`No video found for emotion: ${emotion}`);
      return null;
    }
    
    if (preferRecent) {
      return videos[0];
    } else {
      return videos[Math.floor(Math.random() * videos.length)];
    }
  }

  getFallbackVideos(emotion) {
    const fallbackMap = {
      'anger': ['disgust', 'fear', 'neutral'],
      'anxiety': ['fear', 'sadness', 'neutral'],
      'calm': ['neutral', 'happiness', 'joy'],
      'disgust': ['anger', 'fear', 'neutral'],
      'excitement': ['happiness', 'joy', 'surprise'],
      'fear': ['anxiety', 'sadness', 'neutral'],
      'happiness': ['joy', 'excitement', 'neutral'],
      'joy': ['happiness', 'excitement', 'surprise'],
      'love': ['happiness', 'joy', 'neutral'],
      'neutral': ['calm', 'happiness'],
      'sadness': ['fear', 'anxiety', 'neutral'],
      'surprise': ['excitement', 'happiness', 'neutral']
    };
    
    const fallbacks = fallbackMap[emotion] || ['neutral'];
    
    for (const fallback of fallbacks) {
      const videos = this.emotionVideoMap.get(fallback);
      if (videos && videos.length > 0) {
        console.log(`Using fallback emotion "${fallback}" for "${emotion}"`);
        return videos;
      }
    }
    
    return this.availableVideos.slice(0, 1);
  }

  getAllEmotions() {
    return Array.from(this.emotionVideoMap.keys());
  }

  getAvailableVideos() {
    return this.availableVideos;
  }

  getVideoPath(emotion, preferRecent = true) {
    const video = this.getVideoForEmotion(emotion, preferRecent);
    return video ? video.path : null;
  }

  getVideoUrl(emotion, preferRecent = true) {
    const video = this.getVideoForEmotion(emotion, preferRecent);
    if (!video) return null;
    
    return `/generated_files/${video.filename}`;
  }

  async refresh() {
    await this.scanGeneratedVideos();
    this.buildEmotionMap();
    console.log('Video-Emotion mapper refreshed');
  }

  getStats() {
    return {
      totalVideos: this.availableVideos.length,
      emotions: Array.from(this.emotionVideoMap.keys()),
      emotionCounts: Object.fromEntries(
        Array.from(this.emotionVideoMap.entries()).map(([emotion, videos]) => [emotion, videos.length])
      )
    };
  }
}

module.exports = VideoEmotionMapper;