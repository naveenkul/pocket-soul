/**
 * Custom Character Manager for Frontend
 * Handles custom character requests and video playback
 */

class CustomCharacterManager {
    constructor(videoElement, emotionManager) {
        this.video = videoElement;
        this.emotionManager = emotionManager;
        this.currentCustomVideo = null;
        this.isLoadingCustom = false;
        this.cachedVariants = new Map();
        
        // Initialize socket connection
        this.initializeSocket();
        
        // Load cached variants on startup
        this.loadCachedVariants();
    }

    initializeSocket() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            // Listen for custom character ready events
            this.socket.on('custom-character-ready', (data) => {
                console.log('🎭 Custom character ready:', data);
                this.handleCustomCharacterReady(data);
            });
        }
    }

    /**
     * Process user input for custom character requests
     */
    async processUserInput(userText) {
        // Check if user is requesting a custom character
        const customTriggers = [
            'be a', 'become a', 'turn into', 'transform into',
            'can you be', 'could you be', 'please be',
            'show me a', 'let me see a', 'i want a'
        ];

        const hasCustomRequest = customTriggers.some(trigger => 
            userText.toLowerCase().includes(trigger)
        );

        if (!hasCustomRequest) {
            return null; // Not a custom character request
        }

        // Extract the character description
        let characterDescription = userText;
        for (const trigger of customTriggers) {
            if (userText.toLowerCase().includes(trigger)) {
                const parts = userText.toLowerCase().split(trigger);
                if (parts.length > 1) {
                    characterDescription = parts[1].trim();
                    break;
                }
            }
        }

        console.log(`🎯 Custom character request detected: "${characterDescription}"`);
        
        // Request custom character generation
        return await this.requestCustomCharacter(characterDescription);
    }

    /**
     * Request custom character from backend
     */
    async requestCustomCharacter(prompt) {
        if (this.isLoadingCustom) {
            console.log('⏳ Already loading a custom character...');
            return;
        }

        this.isLoadingCustom = true;
        
        // Show loading state
        this.showLoadingState();

        try {
            const response = await fetch('/api/custom-character/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();
            
            if (data.success) {
                console.log(`✅ Custom character ${data.cached ? 'retrieved from cache' : 'generated'}`);
                
                // Cache the variant locally
                const cacheKey = `${data.emotion}_${data.description}`;
                this.cachedVariants.set(cacheKey, data);
                
                // Play the custom character video
                await this.playCustomCharacter(data);
                
                return data;
            } else {
                console.error('❌ Failed to generate custom character:', data.error);
                this.showError(data.error);
            }
        } catch (error) {
            console.error('❌ Error requesting custom character:', error);
            this.showError(error.message);
        } finally {
            this.isLoadingCustom = false;
        }
    }

    /**
     * Play custom character video
     */
    async playCustomCharacter(data) {
        const { videoPath, emotion, description } = data;
        
        console.log(`🎬 Playing custom character: ${emotion} ${description}`);
        
        // Store current custom video
        this.currentCustomVideo = videoPath;
        
        // Play the custom character video
        this.video.src = videoPath;
        this.video.loop = true;
        
        try {
            await this.video.play();
            
            // Update UI to show custom character info
            this.updateCustomCharacterUI(emotion, description);
            
            // Emit event for other components
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('custom-character-active', {
                    detail: { emotion, description, videoPath }
                }));
            }
        } catch (error) {
            console.error('❌ Error playing custom character video:', error);
        }
    }

    /**
     * Handle custom character ready from socket
     */
    handleCustomCharacterReady(data) {
        if (!this.isLoadingCustom) {
            // This might be from another client, ignore if we're not waiting
            return;
        }
        
        this.playCustomCharacter(data);
    }

    /**
     * Load cached variants from backend
     */
    async loadCachedVariants() {
        try {
            const response = await fetch('/api/custom-character/cached');
            const data = await response.json();
            
            if (data.success) {
                console.log(`📦 Loaded ${data.count} cached variants`);
                
                // Store in local cache
                data.variants.forEach(variant => {
                    const cacheKey = `${variant.emotion}_${variant.customDescription}`;
                    this.cachedVariants.set(cacheKey, variant);
                });
            }
        } catch (error) {
            console.error('Failed to load cached variants:', error);
        }
    }

    /**
     * Check if variant exists in local cache
     */
    hasVariantInCache(emotion, description) {
        const cacheKey = `${emotion}_${description}`;
        return this.cachedVariants.has(cacheKey);
    }

    /**
     * Get variant from local cache
     */
    getVariantFromCache(emotion, description) {
        const cacheKey = `${emotion}_${description}`;
        return this.cachedVariants.get(cacheKey);
    }

    /**
     * Show loading state in UI
     */
    showLoadingState() {
        // Add loading overlay or animation
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'custom-character-loading';
        loadingDiv.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px; 
                        border: 2px solid #0ff; z-index: 10000;">
                <div style="color: #0ff; font-size: 20px; text-align: center;">
                    🎨 Generating Custom Character...
                    <div style="margin-top: 10px; font-size: 14px;">This may take a few seconds</div>
                </div>
            </div>
        `;
        document.body.appendChild(loadingDiv);
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const loadingDiv = document.getElementById('custom-character-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.hideLoadingState();
        
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; 
                        background: rgba(255,0,0,0.8); padding: 15px; border-radius: 8px; 
                        z-index: 10000; max-width: 300px;">
                <div style="color: #fff; font-size: 14px;">
                    ❌ Error: ${message}
                </div>
            </div>
        `;
        document.body.appendChild(errorDiv);
        
        // Auto remove after 5 seconds
        setTimeout(() => errorDiv.remove(), 5000);
    }

    /**
     * Update UI with custom character info
     */
    updateCustomCharacterUI(emotion, description) {
        this.hideLoadingState();
        
        // Update any UI elements that show current character
        const infoDiv = document.getElementById('current-character-info');
        if (infoDiv) {
            infoDiv.innerHTML = `
                <div style="padding: 10px; background: rgba(0,255,255,0.1); border-radius: 8px;">
                    <strong>Custom Character Active:</strong><br>
                    ${emotion.charAt(0).toUpperCase() + emotion.slice(1)} ${description}
                </div>
            `;
        }
    }

    /**
     * Return to standard emotions
     */
    returnToStandardEmotion(emotion) {
        this.currentCustomVideo = null;
        
        // Clear custom character UI
        const infoDiv = document.getElementById('current-character-info');
        if (infoDiv) {
            infoDiv.innerHTML = '';
        }
        
        // Use emotion manager to switch back
        if (this.emotionManager) {
            this.emotionManager.switchEmotion(emotion);
        }
    }

    /**
     * Get suggestions for custom characters
     */
    getSuggestions() {
        return [
            "happy cowboy",
            "sad pirate",
            "angry ninja",
            "cheerful astronaut",
            "nervous detective",
            "excited superhero",
            "calm wizard",
            "disgusted chef",
            "anxious robot",
            "joyful princess"
        ];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomCharacterManager;
}