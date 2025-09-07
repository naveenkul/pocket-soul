class HologramDisplay {
    constructor() {
        this.socket = null;
        this.canvas = document.getElementById('hologram-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.video = document.getElementById('hologram-video');
        this.audio = document.getElementById('audio-element');
        
        // Set canvas size
        if (this.canvas) {
            this.canvas.width = 512;
            this.canvas.height = 512;
        }
        
        // Frame buffer for smooth playback
        this.frameBuffer = [];
        this.maxBufferSize = 5;
        this.rendering = false;
        
        // Video chunks buffer
        this.videoChunks = [];
        this.videoBlob = null;
        
        // Metrics
        this.metrics = {
            framesReceived: 0,
            lastFrameTime: Date.now(),
            fps: 0,
            latencies: []
        };
        
        // Current state
        this.currentMood = 'calm';
        this.generationCount = 0;
        this.isStreaming = false;
        this.lastDisplayedEmotion = null; // Track last emotion for transition logic
        
        // Initialize connection
        this.init();
    }
    
    init() {
        // Connect to server
        const url = window.location.origin;
        this.connect(url);
        
        // Start metrics update
        setInterval(() => this.updateMetrics(), 1000);
        
        // Measure latency periodically
        setInterval(() => this.measureLatency(), 2000);
    }
    
    connect(url) {
        this.socket = io(url, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionAttempts: Infinity
        });
        
        // Identify as hologram display
        this.socket.on('connect', () => {
            console.log('Connected to Pocket Soul server');
            this.socket.emit('identify', 'hologram');
            this.updateConnectionStatus('connected');
            this.hideLoadingScreen();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
            this.showLoadingScreen('Reconnecting...');
        });
        
        // Handle frame streaming (canvas-based)
        this.socket.on('frame', async (data) => {
            await this.handleFrame(data);
        });
        
        // Handle video chunks
        this.socket.on('video-chunk', (data) => {
            this.handleVideoChunk(data);
        });
        
        // Handle audio streaming
        this.socket.on('audio-stream', (data) => {
            this.handleAudioStream(data);
        });
        
        // Handle generation updates
        this.socket.on('generation-complete', (data) => {
            this.updateGeneration(data);
        });
        
        // Handle mood changes
        this.socket.on('mood-change', (data) => {
            this.updateMood(data.mood);
        });
        
        // Handle stream status
        this.socket.on('stream-status', (active) => {
            this.isStreaming = active;
            this.updateStreamStatus(active);
        });
        
        // Handle stream end
        this.socket.on('stream-ended', () => {
            console.log('Stream ended');
            this.clearBuffers();
        });
        
        // Latency response
        this.socket.on('pong', (data) => {
            const latency = Date.now() - data.clientTime;
            this.metrics.latencies.push(latency);
            if (this.metrics.latencies.length > 10) {
                this.metrics.latencies.shift();
            }
            
            // Send metrics back
            this.socket.emit('metrics', {
                framesReceived: this.metrics.framesReceived,
                latency: latency
            });
        });
        
        // Handle custom character ready event
        this.socket.on('custom-character-ready', (data) => {
            console.log('🎭 Custom character ready:', data);
            this.handleCustomCharacter(data);
        });
    }
    
    async handleFrame(data) {
        this.metrics.framesReceived++;
        
        if (data.buffer) {
            try {
                // Convert buffer to blob and create bitmap
                const blob = new Blob([data.buffer], { type: 'image/webp' });
                const bitmap = await createImageBitmap(blob);
                
                // Add to frame buffer
                this.frameBuffer.push({
                    bitmap,
                    timestamp: data.timestamp,
                    frameNumber: data.frameNumber
                });
                
                // Maintain buffer size
                while (this.frameBuffer.length > this.maxBufferSize) {
                    this.frameBuffer.shift();
                }
                
                // Start rendering if not already
                if (!this.rendering) {
                    this.renderFrame();
                }
            } catch (err) {
                console.error('Frame processing error:', err);
            }
        }
    }
    
    renderFrame() {
        if (this.frameBuffer.length === 0) {
            this.rendering = false;
            return;
        }
        
        this.rendering = true;
        const frame = this.frameBuffer.shift();
        
        if (this.ctx && frame.bitmap) {
            // Clear and draw
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Add holographic effect
            this.ctx.globalAlpha = 0.95;
            this.ctx.drawImage(frame.bitmap, 0, 0, this.canvas.width, this.canvas.height);
            
            // Add scan lines effect
            this.addHolographicEffect();
            
            // Update FPS
            const now = Date.now();
            const delta = now - this.metrics.lastFrameTime;
            this.metrics.fps = Math.round(1000 / delta);
            this.metrics.lastFrameTime = now;
        }
        
        // Continue rendering
        requestAnimationFrame(() => this.renderFrame());
    }
    
    addHolographicEffect() {
        if (!this.ctx) return;
        
        // Add subtle scan lines
        this.ctx.globalAlpha = 0.05;
        this.ctx.strokeStyle = '#0ff';
        this.ctx.lineWidth = 1;
        
        for (let y = 0; y < this.canvas.height; y += 4) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    handleVideoChunk(data) {
        // Collect video chunks
        this.videoChunks.push(data.chunk);
        
        // If we have enough chunks, create video blob
        if (this.videoChunks.length >= 10) { // Adjust threshold as needed
            this.createVideoFromChunks();
        }
    }
    
    createVideoFromChunks() {
        try {
            // Combine chunks into blob
            const videoBlob = new Blob(this.videoChunks, { type: 'video/webm' });
            const videoUrl = URL.createObjectURL(videoBlob);
            
            // Set video source and play
            this.video.src = videoUrl;
            this.video.style.display = 'block';
            this.canvas.style.display = 'none';
            this.video.play();
            
            // Clear chunks
            this.videoChunks = [];
        } catch (err) {
            console.error('Video creation error:', err);
        }
    }
    
    handleAudioStream(data) {
        if (!data.audio) return;
        
        try {
            // Convert base64 to blob
            const audioData = atob(data.audio);
            const audioArray = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                audioArray[i] = audioData.charCodeAt(i);
            }
            
            const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Play audio
            this.audio.src = audioUrl;
            this.audio.play();
            
            console.log('Playing audio stream');
        } catch (err) {
            console.error('Audio playback error:', err);
        }
    }
    
    measureLatency() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('ping', Date.now());
        }
    }
    
    updateMetrics() {
        // Update FPS
        document.getElementById('fps').textContent = this.metrics.fps;
        
        // Update frames
        document.getElementById('frames').textContent = this.metrics.framesReceived;
        
        // Update latency
        if (this.metrics.latencies.length > 0) {
            const avgLatency = Math.round(
                this.metrics.latencies.reduce((a, b) => a + b, 0) / 
                this.metrics.latencies.length
            );
            document.getElementById('latency').textContent = `${avgLatency}ms`;
        }
    }
    
    updateConnectionStatus(status) {
        const dot = document.getElementById('connection-status');
        const text = document.getElementById('connection-text');
        
        dot.className = `status-dot ${status}`;
        
        switch(status) {
            case 'connected':
                text.textContent = 'Connected';
                break;
            case 'disconnected':
                text.textContent = 'Disconnected';
                break;
            case 'reconnecting':
                text.textContent = 'Reconnecting...';
                break;
        }
    }
    
    updateStreamStatus(active) {
        const dot = document.getElementById('connection-status');
        if (active) {
            dot.classList.add('streaming');
        } else {
            dot.classList.remove('streaming');
        }
    }
    
    updateMood(mood) {
        this.currentMood = mood;
        document.getElementById('current-mood').textContent = 
            mood.charAt(0).toUpperCase() + mood.slice(1);
        
        // Add mood-specific color to border
        const moodColors = {
            happy: '#ffeb3b',
            sad: '#2196f3',
            excited: '#ff9800',
            calm: '#4caf50',
            angry: '#f44336'
        };
        
        const color = moodColors[mood] || '#00ffff';
        this.canvas.style.borderColor = color;
        this.canvas.style.boxShadow = `0 0 50px ${color}`;
    }
    
    updateGeneration(data) {
        if (data.generationCount) {
            this.generationCount = data.generationCount;
            document.getElementById('generation-count').textContent = 
                `Gen #${data.generationCount}`;
        }
        
        if (data.mood) {
            this.updateMood(data.mood);
        }
    }
    
    showLoadingScreen(text = 'Connecting to Pocket Soul...') {
        const screen = document.getElementById('loading-screen');
        const loadingText = screen.querySelector('.loading-text');
        loadingText.textContent = text;
        screen.classList.remove('hidden');
    }
    
    hideLoadingScreen() {
        const screen = document.getElementById('loading-screen');
        screen.classList.add('hidden');
    }
    
    clearBuffers() {
        this.frameBuffer = [];
        this.videoChunks = [];
    }
    
    handleCustomCharacter(data) {
        console.log('🎭 Handling custom character:', data);
        
        // Show visual feedback that video is being received
        const statusText = document.getElementById('connection-text');
        if (statusText) {
            statusText.textContent = `📹 Loading video...`;
            statusText.style.color = '#ff0';
        }
        
        // Update mood display
        if (data.emotion) {
            this.currentMood = data.emotion;
            this.updateMood(data.emotion);
        }
        
        // Display custom character description
        const moodElement = document.getElementById('current-mood');
        if (moodElement && data.description) {
            moodElement.textContent = `${data.emotion} ${data.description}`;
        }
        
        // Load and play the custom character video with talking loop support
        if (data.videoPath) {
            this.playCustomVideoWithTalkingLoop(data.videoPath, data.emotion, data.audio);
        }
        
        // Update status to show custom character is active
        const statusText2 = document.getElementById('connection-text');
        if (statusText2) {
            statusText2.textContent = `Custom: ${data.description}`;
            setTimeout(() => {
                statusText2.textContent = 'Connected';
            }, 3000);
        }
    }
    
    playCustomVideo(videoPath) {
        console.log('🎬 Playing custom video:', videoPath);
        
        // Clear any existing video/canvas display
        this.clearBuffers();
        
        // Hide canvas, show video element
        if (this.canvas) this.canvas.style.display = 'none';
        if (this.video) {
            this.video.style.display = 'block';
            
            // Ensure video path is absolute
            const fullPath = videoPath.startsWith('http') ? videoPath : 
                           (videoPath.startsWith('/') ? videoPath : '/' + videoPath);
            
            console.log('📹 Video URL:', fullPath);
            
            this.video.src = fullPath;
            this.video.loop = true;
            this.video.muted = true; // Start muted to help with autoplay
            
            // Enable inline playback on iOS
            this.video.setAttribute('playsinline', '');
            this.video.setAttribute('webkit-playsinline', '');
            
            // Add event listeners for debugging
            this.video.onloadstart = () => console.log('📹 Video load started');
            this.video.onloadeddata = () => console.log('📹 Video data loaded');
            this.video.oncanplay = () => console.log('📹 Video can play');
            this.video.onplay = () => {
                console.log('📹 Video started playing');
                // Update status
                const statusText = document.getElementById('connection-text');
                if (statusText) {
                    statusText.textContent = `✅ Playing video`;
                    statusText.style.color = '#0f0';
                    setTimeout(() => {
                        statusText.textContent = 'Connected';
                        statusText.style.color = '#0ff';
                    }, 2000);
                }
            };
            this.video.onerror = (e) => {
                console.error('📹 Video error:', e);
                const statusText = document.getElementById('connection-text');
                if (statusText) {
                    statusText.textContent = `❌ Video error`;
                    statusText.style.color = '#f00';
                }
            };
            
            // Play with user gesture handling
            const playVideo = () => {
                this.video.play().catch(err => {
                    console.error('Error playing custom video:', err);
                    const statusText = document.getElementById('connection-text');
                    if (statusText) {
                        statusText.textContent = `Tap to play video`;
                        statusText.style.color = '#ff0';
                    }
                });
            };
            
            playVideo();
            
            // Also try playing on user interaction if autoplay fails
            document.addEventListener('touchstart', playVideo, { once: true });
            document.addEventListener('click', playVideo, { once: true });
        }
    }
    
    playCustomVideoWithTalkingLoop(transitionVideoPath, emotion, audioData) {
        console.log('🎬 Checking emotion transition:', emotion, 'vs last:', this.lastDisplayedEmotion);
        
        // Check if emotion has changed from the last displayed emotion
        const emotionChanged = this.lastDisplayedEmotion !== emotion.toLowerCase();
        
        if (emotionChanged) {
            console.log('🔄 Emotion changed, playing transition video first');
            this.playTransitionThenTalkingLoop(transitionVideoPath, emotion, audioData);
        } else {
            console.log('🔁 Same emotion, going straight to talking loop');
            this.clearBuffers();
            if (this.canvas) this.canvas.style.display = 'none';
            if (this.video) this.video.style.display = 'block';
            this.switchToTalkingLoop(emotion, audioData);
        }
        
        // Update the last displayed emotion
        this.lastDisplayedEmotion = emotion.toLowerCase();
    }
    
    playTransitionThenTalkingLoop(transitionVideoPath, emotion, audioData) {
        console.log('🎬 Playing transition video then talking loop:', transitionVideoPath, emotion);
        
        // Clear any existing video/canvas display
        this.clearBuffers();
        
        // Hide canvas, show video element
        if (this.canvas) this.canvas.style.display = 'none';
        if (this.video) {
            this.video.style.display = 'block';
            
            // Ensure transition video path is absolute
            const fullTransitionPath = transitionVideoPath.startsWith('http') ? transitionVideoPath : 
                                     (transitionVideoPath.startsWith('/') ? transitionVideoPath : '/' + transitionVideoPath);
            
            console.log('📹 Transition Video URL:', fullTransitionPath);
            
            this.video.src = fullTransitionPath;
            this.video.loop = false; // Don't loop transition video
            this.video.muted = true;
            
            // Enable inline playback on iOS
            this.video.setAttribute('playsinline', '');
            this.video.setAttribute('webkit-playsinline', '');
            
            // Add event listeners
            this.video.onloadstart = () => console.log('📹 Transition video load started');
            this.video.onloadeddata = () => console.log('📹 Transition video data loaded');
            this.video.oncanplay = () => console.log('📹 Transition video can play');
            
            this.video.onplay = () => {
                console.log('📹 Transition video started playing');
                const statusText = document.getElementById('connection-text');
                if (statusText) {
                    statusText.textContent = `✅ Transitioning to ${emotion}`;
                    statusText.style.color = '#0f0';
                }
            };
            
            // When transition video ends, switch to talking loop
            this.video.onended = () => {
                console.log('📹 Transition video ended, switching to talking loop');
                this.switchToTalkingLoop(emotion, audioData);
            };
            
            this.video.onerror = (e) => {
                console.error('📹 Transition video error:', e);
                const statusText = document.getElementById('connection-text');
                if (statusText) {
                    statusText.textContent = `❌ Video error`;
                    statusText.style.color = '#f00';
                }
                // Fallback to talking loop
                this.switchToTalkingLoop(emotion, audioData);
            };
            
            // Play transition video
            this.video.play().catch(err => {
                console.error('Error playing transition video:', err);
                // Fallback to talking loop immediately
                this.switchToTalkingLoop(emotion, audioData);
            });
            
            // Also try playing on user interaction if autoplay fails
            document.addEventListener('touchstart', () => this.video.play(), { once: true });
            document.addEventListener('click', () => this.video.play(), { once: true });
        }
    }
    
    switchToTalkingLoop(emotion, audioData) {
        console.log('🔄 Switching to talking loop for emotion:', emotion);
        
        // Map emotions to talking loop directories
        const emotionMapping = {
            joy: 'joy',
            happiness: 'joy',
            happy: 'joy',
            anger: 'anger',
            angry: 'anger',
            sadness: 'sadness_blue',
            sad: 'sadness_blue',
            fear: 'fear',
            scared: 'fear',
            disgust: 'disgust',
            anxiety: 'anxiety',
            anxious: 'anxiety',
            calm: 'joy', // fallback to joy if no calm
            neutral: 'joy' // fallback
        };
        
        const talkingLoopDir = emotionMapping[emotion.toLowerCase()] || 'joy';
        
        // Pick a random talking loop video (v1, v2, or v3)
        const randomVersion = Math.floor(Math.random() * 3) + 1;
        const talkingLoopPath = `/videos/talking_loops/${talkingLoopDir}/${talkingLoopDir}_talking_v${randomVersion}.mp4`;
        
        console.log('📹 Talking loop path:', talkingLoopPath);
        
        if (this.video) {
            this.video.src = talkingLoopPath;
            this.video.loop = true; // Loop the talking video
            this.video.muted = false; // Unmute for audio
            
            this.video.onplay = () => {
                console.log('📹 Talking loop started playing');
                const statusText = document.getElementById('connection-text');
                if (statusText) {
                    statusText.textContent = `✅ Talking loop`;
                    statusText.style.color = '#0f0';
                    setTimeout(() => {
                        statusText.textContent = 'Connected';
                        statusText.style.color = '#0ff';
                    }, 2000);
                }
            };
            
            this.video.onerror = (e) => {
                console.error('📹 Talking loop error:', e);
                // Fallback to joy talking loop
                if (talkingLoopDir !== 'joy') {
                    const fallbackPath = `/videos/talking_loops/joy/joy_talking_v1.mp4`;
                    console.log('📹 Fallback to:', fallbackPath);
                    this.video.src = fallbackPath;
                    this.video.play();
                }
            };
            
            this.video.play().catch(err => {
                console.error('Error playing talking loop:', err);
            });
        }
        
        // Play audio if provided
        if (audioData) {
            this.playAudioFromBase64(audioData);
        }
    }

    playAudioFromBase64(base64Audio) {
        try {
            // Convert base64 to blob
            const byteCharacters = atob(base64Audio);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'audio/mpeg' });
            
            // Create object URL and play
            const audioUrl = URL.createObjectURL(blob);
            if (this.audio) {
                this.audio.src = audioUrl;
                this.audio.play().catch(err => {
                    console.error('Error playing audio:', err);
                });
            }
        } catch (error) {
            console.error('Error playing audio from base64:', error);
        }
    }
}