/**
 * Emotion Video Manager for Pocket Soul
 * Manages emotion transitions and talking loops for the holographic display
 */

class EmotionVideoManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.currentEmotion = 'joy';
        this.currentTalkingVideo = null;
        this.isTransitioning = false;
        this.isTalking = false;
        this.config = null;
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const response = await fetch('/videos/video_config.json');
            this.config = await response.json();
            console.log('✅ Video config loaded:', this.config);
        } catch (error) {
            console.error('❌ Failed to load video config:', error);
        }
    }

    /**
     * Switch to a new emotion with transition video
     * @param {string} newEmotion - The emotion to switch to
     */
    async switchEmotion(newEmotion) {
        if (!this.config || !this.config.emotions[newEmotion]) {
            console.error(`❌ Invalid emotion: ${newEmotion}`);
            return;
        }

        if (this.isTransitioning) {
            console.log('⏳ Already transitioning, please wait...');
            return;
        }

        console.log(`🎭 Switching from ${this.currentEmotion} to ${newEmotion}`);
        this.isTransitioning = true;

        // Play transition video (character changing color)
        const transitionVideo = this.config.emotions[newEmotion].transition;
        this.video.src = transitionVideo;
        this.video.loop = false;
        
        // Wait for transition to complete
        await this.playVideo();
        
        this.currentEmotion = newEmotion;
        this.isTransitioning = false;

        // If user is talking, start talking loops
        if (this.isTalking) {
            this.startTalking();
        } else {
            // Hold on last frame
            this.video.pause();
        }
    }

    /**
     * Start talking loops for current emotion
     */
    startTalking() {
        if (this.isTransitioning) return;
        
        this.isTalking = true;
        const emotion = this.config.emotions[this.currentEmotion];
        
        // Randomly select one of the 3 talking variations
        const randomIndex = Math.floor(Math.random() * emotion.talkingLoops.length);
        const talkingVideo = emotion.talkingLoops[randomIndex];
        
        console.log(`💬 Playing talking loop: ${talkingVideo}`);
        
        this.video.src = talkingVideo;
        this.video.loop = true;
        this.video.play();
        this.currentTalkingVideo = talkingVideo;
    }

    /**
     * Stop talking and pause on current frame
     */
    stopTalking() {
        this.isTalking = false;
        // Keep the last frame visible
        this.video.pause();
        console.log('🤐 Stopped talking');
    }

    /**
     * Play video and return promise when ended
     */
    playVideo() {
        return new Promise((resolve) => {
            this.video.play();
            this.video.onended = () => {
                resolve();
            };
        });
    }

    /**
     * Get current emotion info
     */
    getCurrentEmotionInfo() {
        if (!this.config) return null;
        return this.config.emotions[this.currentEmotion];
    }

    /**
     * Switch talking variation (while staying in same emotion)
     */
    switchTalkingVariation() {
        if (!this.isTalking || this.isTransitioning) return;
        
        const emotion = this.config.emotions[this.currentEmotion];
        
        // Get a different variation than current
        let newVideo;
        do {
            const randomIndex = Math.floor(Math.random() * emotion.talkingLoops.length);
            newVideo = emotion.talkingLoops[randomIndex];
        } while (newVideo === this.currentTalkingVideo && emotion.talkingLoops.length > 1);
        
        console.log(`🔄 Switching talking variation to: ${newVideo}`);
        this.video.src = newVideo;
        this.video.loop = true;
        this.video.play();
        this.currentTalkingVideo = newVideo;
    }
}

// Example usage in your app:
/*
const videoElement = document.getElementById('emotion-video');
const emotionManager = new EmotionVideoManager(videoElement);

// When user emotion changes (from mood detection):
emotionManager.switchEmotion('anger');

// When user starts talking:
emotionManager.startTalking();

// When user stops talking:
emotionManager.stopTalking();

// To add variety during long conversations:
setInterval(() => {
    if (emotionManager.isTalking) {
        emotionManager.switchTalkingVariation();
    }
}, 15000); // Switch variation every 15 seconds
*/

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmotionVideoManager;
}