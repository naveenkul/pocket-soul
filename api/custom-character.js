/**
 * API endpoint for custom character generation
 * Handles user requests for custom character variants
 */

const express = require('express');
const router = express.Router();
const CustomCharacterGenerator = require('../lib/custom-character-generator');

// Initialize generator
const generator = new CustomCharacterGenerator();

/**
 * POST /api/custom-character
 * Generate or retrieve a custom character variant
 */
router.post('/generate', async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'Prompt is required'
            });
        }

        console.log(`📝 Received custom character request: "${prompt}"`);

        // Parse the user prompt
        const { emotion, customDescription } = generator.parseUserRequest(prompt);
        
        console.log(`   Detected emotion: ${emotion}`);
        console.log(`   Custom description: ${customDescription}`);

        // Get or create the variant
        const result = await generator.getOrCreateVariant(emotion, customDescription);

        if (result.success) {
            // Emit to connected displays
            if (req.io) {
                req.io.emit('custom-character-ready', {
                    emotion: emotion,
                    description: customDescription,
                    videoPath: result.path,
                    cached: result.cached
                });
            }

            res.json({
                success: true,
                emotion: emotion,
                description: customDescription,
                videoPath: result.path,
                cached: result.cached,
                metadata: result.metadata
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ Custom character generation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/custom-character/cached
 * Get all cached custom variants
 */
router.get('/cached', async (req, res) => {
    try {
        const cached = generator.getCachedVariants();
        res.json({
            success: true,
            count: cached.length,
            variants: cached
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/custom-character/cache
 * Clear the cache (admin only)
 */
router.delete('/cache', async (req, res) => {
    try {
        // Add authentication check here if needed
        await generator.clearCache();
        res.json({
            success: true,
            message: 'Cache cleared successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/custom-character/parse
 * Test prompt parsing without generating
 */
router.post('/parse', (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({
            success: false,
            error: 'Prompt is required'
        });
    }

    const parsed = generator.parseUserRequest(prompt);
    res.json({
        success: true,
        ...parsed
    });
});

module.exports = router;