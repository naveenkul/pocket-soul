/**
 * Custom Character Variant Generator
 * Generates custom character variants based on user prompts (e.g., "happy cowboy")
 * Caches generated videos for reuse
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { fal } = require('@fal-ai/client');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Set FAL_KEY environment variable for fal client
if (process.env.FAL_API_KEY) {
    process.env.FAL_KEY = process.env.FAL_API_KEY;
}

class CustomCharacterGenerator {
    constructor() {
        this.cacheDir = path.join(__dirname, '../public/videos/custom_variants');
        this.cacheManifest = path.join(this.cacheDir, 'manifest.json');
        this.referenceImage = path.join(__dirname, '../assets/reference_character.png');
        this.initializeCache();
    }

    async initializeCache() {
        // Create cache directory if it doesn't exist
        await fs.mkdir(this.cacheDir, { recursive: true });
        
        // Load or create manifest
        try {
            const manifestData = await fs.readFile(this.cacheManifest, 'utf8');
            this.manifest = JSON.parse(manifestData);
        } catch (error) {
            this.manifest = {};
            await this.saveManifest();
        }
    }

    /**
     * Generate cache key from emotion and custom description
     */
    generateCacheKey(emotion, customDescription) {
        const normalized = `${emotion}_${customDescription}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const hash = crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
        return `${normalized.substring(0, 30)}_${hash}`;
    }

    /**
     * Check if variant exists in cache
     */
    async checkCache(emotion, customDescription) {
        const cacheKey = this.generateCacheKey(emotion, customDescription);
        
        if (this.manifest[cacheKey]) {
            const filePath = path.join(this.cacheDir, this.manifest[cacheKey].filename);
            
            // Verify file exists
            try {
                await fs.access(filePath);
                console.log(`✅ Found cached variant: ${cacheKey}`);
                return {
                    exists: true,
                    path: `/videos/custom_variants/${this.manifest[cacheKey].filename}`,
                    metadata: this.manifest[cacheKey]
                };
            } catch (error) {
                // File doesn't exist, remove from manifest
                delete this.manifest[cacheKey];
                await this.saveManifest();
            }
        }
        
        return { exists: false };
    }

    /**
     * Generate emotion-specific prompt with custom description
     */
    buildCustomPrompt(emotion, customDescription) {
        const emotionPrompts = {
            joy: {
                base: "golden yellow character, joyful and happy",
                animation: "bouncing cheerfully, mouth opening and closing as if talking happily, continuous speaking movements"
            },
            anger: {
                base: "bright red character, angry and furious",
                animation: "shaking with rage, mouth opening aggressively as if yelling, steam effects, continuous angry talking"
            },
            fear: {
                base: "deep purple character, fearful and nervous",
                animation: "trembling nervously, mouth quivering as if speaking fearfully, continuous worried talking"
            },
            disgust: {
                base: "bright green character, disgusted and repulsed",
                animation: "recoiling with disgust, mouth twisted as if complaining, continuous disgusted talking"
            },
            anxiety: {
                base: "bright orange character, anxious and worried",
                animation: "fidgeting constantly, mouth moving rapidly as if rambling nervously, continuous anxious talking"
            },
            sadness: {
                base: "deep blue character, sad and melancholy",
                animation: "drooping sadly, mouth turned down as if crying softly, continuous sad talking"
            },
            calm: {
                base: "soft cyan character, peaceful and serene",
                animation: "floating peacefully, mouth moving steadily as if speaking calmly, continuous gentle talking"
            },
            neutral: {
                base: "translucent character with soft glow",
                animation: "gentle floating, mouth moving as if having a conversation, continuous talking"
            }
        };

        const emotionConfig = emotionPrompts[emotion] || emotionPrompts.neutral;
        
        // Build the complete prompt
        return `The ${emotionConfig.base} dressed as a ${customDescription}, ${emotionConfig.animation}, maintaining the cute ghost-like shape, 8 seconds`;
    }

    /**
     * Generate custom character variant video
     */
    async generateVariant(emotion, customDescription) {
        const cacheKey = this.generateCacheKey(emotion, customDescription);
        const prompt = this.buildCustomPrompt(emotion, customDescription);
        
        console.log(`🎬 Generating custom variant: ${emotion} ${customDescription}`);
        console.log(`   Prompt: ${prompt}`);

        try {
            // Read and encode reference image
            const imageBuffer = await fs.readFile(this.referenceImage);
            const imageBase64 = imageBuffer.toString('base64');
            const imageDataUrl = `data:image/png;base64,${imageBase64}`;

            // Call Veo3 API
            console.log('📤 Calling fal API with image-to-video...');
            const result = await fal.run("fal-ai/veo3/fast/image-to-video", {
                input: {
                    prompt: prompt,
                    image_url: imageDataUrl,
                    duration: "8s",  // Veo3 API only accepts "8s" as valid duration
                    generate_audio: false,
                    resolution: "720p"
                }
            });

            console.log('📥 API Response:', JSON.stringify(result, null, 2));

            // Check different possible response structures
            let videoUrl = null;
            if (result) {
                if (result.data && result.data.video && result.data.video.url) {
                    videoUrl = result.data.video.url;
                } else if (result.video && result.video.url) {
                    videoUrl = result.video.url;
                } else if (result.video_url) {
                    videoUrl = result.video_url;
                } else if (result.url) {
                    videoUrl = result.url;
                } else if (result.output && result.output.video_url) {
                    videoUrl = result.output.video_url;
                }
            }

            if (videoUrl) {
                // Download video
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `${cacheKey}_${timestamp}.mp4`;
                const filePath = path.join(this.cacheDir, filename);

                // Download using curl
                await execPromise(`curl -o "${filePath}" "${videoUrl}"`);
                
                console.log(`✅ Video generated and saved: ${filename}`);

                // Update manifest
                this.manifest[cacheKey] = {
                    emotion: emotion,
                    customDescription: customDescription,
                    prompt: prompt,
                    filename: filename,
                    generatedAt: new Date().toISOString(),
                    videoUrl: videoUrl
                };
                await this.saveManifest();

                return {
                    success: true,
                    path: `/videos/custom_variants/${filename}`,
                    metadata: this.manifest[cacheKey]
                };
            } else {
                console.error('❌ No video URL found in response. Full response:', result);
                throw new Error('No video URL in response');
            }
        } catch (error) {
            console.error(`❌ Failed to generate variant: ${error.message}`);
            if (error.response) {
                console.error('API Error Response:', error.response);
            }
            if (error.body) {
                console.error('API Error Body:', error.body);
            }
            return {
                success: false,
                error: error.message || 'Failed to generate video'
            };
        }
    }

    /**
     * Get or create custom character variant
     */
    async getOrCreateVariant(emotion, customDescription) {
        // Check cache first
        const cached = await this.checkCache(emotion, customDescription);
        if (cached.exists) {
            return {
                success: true,
                cached: true,
                ...cached
            };
        }

        // Generate new variant
        const result = await this.generateVariant(emotion, customDescription);
        return {
            ...result,
            cached: false
        };
    }

    /**
     * Parse user request for emotion and custom description
     */
    parseUserRequest(userPrompt) {
        // Common emotion keywords
        const emotionKeywords = {
            joy: ['happy', 'joyful', 'cheerful', 'excited', 'elated'],
            anger: ['angry', 'mad', 'furious', 'rage', 'upset'],
            fear: ['scared', 'afraid', 'fearful', 'terrified', 'nervous'],
            disgust: ['disgusted', 'gross', 'ew', 'yuck', 'repulsed'],
            anxiety: ['anxious', 'worried', 'stressed', 'nervous', 'tense'],
            sadness: ['sad', 'crying', 'depressed', 'melancholy', 'blue'],
            calm: ['calm', 'peaceful', 'serene', 'relaxed', 'zen']
        };

        let detectedEmotion = 'neutral';
        let customDescription = userPrompt;

        // Detect emotion from prompt
        for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
            for (const keyword of keywords) {
                if (userPrompt.toLowerCase().includes(keyword)) {
                    detectedEmotion = emotion;
                    // Remove emotion word from description
                    customDescription = userPrompt.replace(new RegExp(keyword, 'gi'), '').trim();
                    break;
                }
            }
            if (detectedEmotion !== 'neutral') break;
        }

        // Clean up description
        customDescription = customDescription
            .replace(/^(a|an|the)\s+/i, '')
            .replace(/\s+/g, ' ')
            .trim();

        return {
            emotion: detectedEmotion,
            customDescription: customDescription || 'character'
        };
    }

    /**
     * Save manifest to disk
     */
    async saveManifest() {
        await fs.writeFile(this.cacheManifest, JSON.stringify(this.manifest, null, 2));
    }

    /**
     * Get all cached variants
     */
    getCachedVariants() {
        return Object.entries(this.manifest).map(([key, value]) => ({
            key,
            ...value,
            path: `/videos/custom_variants/${value.filename}`
        }));
    }

    /**
     * Clear cache (optional cleanup method)
     */
    async clearCache() {
        const files = await fs.readdir(this.cacheDir);
        for (const file of files) {
            if (file !== 'manifest.json') {
                await fs.unlink(path.join(this.cacheDir, file));
            }
        }
        this.manifest = {};
        await this.saveManifest();
        console.log('✅ Cache cleared');
    }
}

module.exports = CustomCharacterGenerator;