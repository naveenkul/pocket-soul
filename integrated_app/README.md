# Integrated Pocket Soul - Audio + Video Streaming

A unified application that combines real-time AI voice conversations with emotion-based video streaming, creating an immersive holographic AI companion experience.

## 🎯 Features

- **Real-time Voice Conversations**: Speech-to-text using Whisper, AI responses via Gemini 2.5 Flash, and text-to-speech with ElevenLabs
- **Emotion-Based Video Streaming**: Automatically selects and streams character videos based on conversation emotions
- **Mobile Hologram Display**: QR code-based mobile interface optimized for holographic projection
- **WebSocket Communication**: Real-time bidirectional communication between control panel and display devices
- **Responsive Design**: Works seamlessly across desktop and mobile devices

## 🏗️ Architecture

### Backend Services
- `server.js` - Main Express server with Socket.IO integration (Port 4000)
- `lib/gemini-service.js` - AI conversation handling
- `lib/whisper-service.js` - Speech transcription
- `lib/elevenlabs-stream.js` - Text-to-speech generation
- `lib/video-emotion-mapper.js` - Emotion-to-video mapping logic

### Frontend Interfaces
- `public/index.html` - Main control panel interface
- `public/mobile.html` - Mobile hologram display interface
- `public/app.js` - Client-side application logic
- `public/style.css` - Modern dark theme styling

### Video Content
- Uses pre-generated character videos from `../generated_files/`
- Automatic emotion detection and video selection
- Support for fallback emotions when specific videos aren't available

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- API Keys for Gemini, ElevenLabs, and OpenAI (for Whisper)
- Generated character videos in `../generated_files/`

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` from the parent directory and ensure these keys are set:
   ```
   GEMINI_API_KEY=your_gemini_key
   ELEVENLABS_API_KEY=your_elevenlabs_key  
   OPENAI_API_KEY=your_openai_key
   INTEGRATED_PORT=4000
   ```

3. **Start the server**:
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the application**:
   - **Control Panel**: http://localhost:4000
   - **Mobile Display**: http://localhost:4000/mobile
   - **Network Access**: Check console for local network URL and QR codes

## 📱 Usage

### Control Panel (Desktop)
1. Open http://localhost:4000 in your browser
2. Click "Start Recording" to begin a voice conversation
3. Speak naturally - your speech will be transcribed and sent to the AI
4. The AI response will be played back as audio and trigger appropriate video content
5. Alternative: Type messages in the text input field

### Mobile Hologram Display
1. Scan the QR code shown on the control panel, or navigate to /mobile
2. The mobile interface will display:
   - Character videos synchronized with conversations
   - Audio playback of AI responses
   - Real-time emotion indicators
3. Can be used with holographic projection devices for 3D display

### Emotion Detection
The system automatically detects emotions from AI responses and maps them to available videos:
- **Primary emotions**: happiness, sadness, anger, fear, surprise, calm, excitement
- **Fallback system**: If a specific emotion video isn't available, the system uses related emotions
- **Video stats**: View available emotions and video counts in the control panel

## 🎬 Video Management

### Supported Formats
- **Video**: MP4 files with H.264 encoding
- **Naming convention**: `{emotion}_character_{timestamp}.mp4`
- **Location**: `../generated_files/` directory

### Emotion Mapping
Videos are automatically categorized by emotion based on filename patterns:
- `anger_character_*.mp4` → anger emotion
- `happiness_character_*.mp4` → happiness emotion
- `calm_character_*.mp4` → calm emotion
- etc.

### Adding New Videos
1. Place MP4 files in the `../generated_files/` directory
2. Use the emotion naming convention
3. Restart the server to refresh the video index
4. Videos will be automatically available for streaming

## 🔧 API Endpoints

### Health Check
- `GET /api/health` - Service status and availability

### Connection Info  
- `GET /api/info` - Server URLs, QR codes, metrics, and available emotions

### Video Access
- `GET /api/video/:filename` - Stream video files with range support
- `GET /api/videos/:emotion` - Get video information for specific emotion

## 🔌 WebSocket Events

### Client → Server
- `identify` - Identify client type (control-panel, mobile, hologram)
- `audio-for-transcription` - Send audio data for processing
- `text-input` - Send text message for AI response
- `interrupt` - Stop current processing
- `reset` - Clear conversation history

### Server → Client
- `config` - Initial configuration and available emotions
- `status` - Processing status updates
- `transcription-result` - Speech transcription results
- `conversation-complete` - Full conversation result with audio/video
- `display-content` - Content for mobile/hologram displays
- `error` - Error messages

## 📊 Performance Metrics

The system tracks:
- **Conversations processed**: Total number of voice/text interactions
- **Videos streamed**: Number of emotion-based videos displayed
- **Connected clients**: Active WebSocket connections
- **Response times**: Transcription, AI response, and audio generation timing
- **Available content**: Emotion categories and video counts

## 🎨 Customization

### Themes
Modify `public/style.css` to customize the visual appearance:
- CSS custom properties for easy color scheme changes
- Responsive grid layouts
- Modern glassmorphism effects
- Smooth animations and transitions

### Emotion Detection
Enhance `server.js` emotion detection by:
- Adding more emotion keywords and patterns
- Integrating advanced sentiment analysis
- Customizing emotion-to-video mapping rules

### Video Content
- Add new character designs and animations
- Create emotion transition videos
- Support for different video qualities/formats

## 🐛 Troubleshooting

### Common Issues

**Videos not loading**:
- Check that videos exist in `../generated_files/`
- Verify file permissions and naming conventions
- Check console for video-emotion mapper errors

**Audio not working**:
- Verify microphone permissions in browser
- Check API keys for ElevenLabs and OpenAI
- Ensure HTTPS for production deployments

**Mobile connection issues**:
- Verify devices are on the same network
- Check firewall settings for port 4000
- Try using the local IP address directly

### Debug Mode
Enable detailed logging by setting:
```bash
NODE_ENV=development npm start
```

## 📄 License

MIT License - see parent directory for full license text.

## 🤝 Contributing

This is part of the larger Pocket Soul project. Contributions should maintain compatibility with the existing ecosystem while enhancing the integrated experience.