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
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');

// Set FAL_KEY environment variable for fal client
if (process.env.FAL_API_KEY) {
    process.env.FAL_KEY = process.env.FAL_API_KEY;
}

class CustomCharacterGenerator {
    constructor() {
        this.cacheDir = path.join(__dirname, '../public/videos/custom_variants');
        this.cacheManifest = path.join(this.cacheDir, 'manifest.json');
        this.imagesDir = path.join(this.cacheDir, 'generated_images');
        this.referenceImage = path.join(__dirname, '../assets/reference_character.png');
        
        // Initialize Gemini for image generation (nano banana)
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-image-preview" });
        
        this.initializeCache();
    }

    async initializeCache() {
        // Create cache directories if they don't exist
        await fs.mkdir(this.cacheDir, { recursive: true });
        await fs.mkdir(this.imagesDir, { recursive: true });
        
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
     * Generate character image using Gemini nano banana (gemini-2.5-flash-image-preview)
     */
    async generateCharacterImage(customDescription, emotion) {
        const imageKey = this.generateCacheKey('image', customDescription);
        const imagePath = path.join(this.imagesDir, `${imageKey}.png`);
        
        // Check if image already exists
        try {
            await fs.access(imagePath);
            console.log(`✅ Found cached character image: ${imageKey}`);
            return imagePath;
        } catch (error) {
            // Image doesn't exist, generate new one
        }
        
        try {
            console.log(`🎨 Generating character image: ${customDescription} with ${emotion} emotion`);
            
            // Build transformation prompt based on your example
            const transformPrompt = `Transform this character to be a ${customDescription} with ${emotion} emotion. Don't change the basic character design, just adapt it to be a ${customDescription} while keeping the cute, translucent, ghost-like appearance. Maintain the same friendly cartoon style.`;
            
            console.log(`   Transform Prompt: ${transformPrompt}`);
            
            // Read reference character image
            const imageBuffer = await fs.readFile(this.referenceImage);
            const imageBase64 = imageBuffer.toString('base64');
            
            // Use Gemini 2.5 Flash Image Preview (nano banana)
            const result = await this.model.generateContent([
                transformPrompt,
                {
                    inlineData: {
                        data: imageBase64,
                        mimeType: 'image/png'
                    }
                }
            ]);
            
            // Extract image data from response
            if (result.response && result.response.candidates && result.response.candidates[0]) {
                const candidate = result.response.candidates[0];
                
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData && part.inlineData.data) {
                            // Save the generated image
                            const buffer = Buffer.from(part.inlineData.data, 'base64');
                            await fs.writeFile(imagePath, buffer);
                            console.log(`✅ Character image generated and saved: ${imageKey}.png`);
                            return imagePath;
                        }
                    }
                }
            }
            
            console.error('❌ No image data found in Gemini response');
            throw new Error('No image data in response');
            
        } catch (error) {
            console.error(`❌ Failed to generate character image: ${error.message}`);
            console.log('   Falling back to reference image');
            return this.referenceImage;
        }
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
            // Generate or retrieve custom character image using Gemini (nano banana)
            const characterImagePath = await this.generateCharacterImage(customDescription, emotion);
            
            // Read and encode the custom character image
            const imageBuffer = await fs.readFile(characterImagePath);
            const imageBase64 = imageBuffer.toString('base64');
            const imageDataUrl = `data:image/png;base64,${imageBase64}`;

            // Call Veo3 API with timeout
            console.log('📤 Calling fal API with image-to-video...');
            console.log('🔑 FAL_KEY set:', !!process.env.FAL_KEY);
            console.log('🔑 FAL_API_KEY set:', !!process.env.FAL_API_KEY);
            
            const apiCall = fal.run("fal-ai/veo3/fast/image-to-video", {
                input: {
                    prompt: prompt,
                    image_url: imageDataUrl,
                    duration: "8s",  // Veo3 API only accepts "8s" as valid duration
                    generate_audio: false,
                    resolution: "720p"
                }
            });
            
            // Add timeout handling (2 minutes max)
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Veo3 API timeout after 2 minutes')), 120000)
            );
            
            const result = await Promise.race([apiCall, timeout]);

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
                
                console.log('🔍 Video URL extraction:', {
                    hasData: !!result.data,
                    hasVideo: !!result.video,
                    hasVideoUrl: !!result.video_url,
                    hasUrl: !!result.url,
                    extractedUrl: videoUrl,
                    fullResult: JSON.stringify(result, null, 2)
                });
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