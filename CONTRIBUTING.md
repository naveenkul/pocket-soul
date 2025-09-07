# Contributing to Pocket Soul

Thank you for your interest in contributing to Pocket Soul! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Bugs
1. **Check existing issues** to avoid duplicates
2. **Use the bug report template** when creating new issues
3. **Provide detailed information**:
   - Steps to reproduce
   - Expected vs actual behavior
   - System information (OS, Node.js version, browser)
   - Screenshots/videos if applicable

### Suggesting Features
1. **Check existing feature requests** to avoid duplicates
2. **Use the feature request template**
3. **Explain the use case** and expected benefits
4. **Consider implementation complexity** and maintenance impact

### Code Contributions

#### Development Setup
1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/pocket-soul.git
   cd pocket-soul
   ```
3. **Install dependencies**:
   ```bash
   npm install
   pip install -r requirements.txt
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Guidelines

**Code Style**:
- Use **consistent formatting** (we use Prettier for JS/CSS)
- Follow **existing patterns** in the codebase
- Add **meaningful comments** for complex logic
- Use **descriptive variable and function names**

**Architecture**:
- Keep **business logic** in `/lib` modules
- Put **API endpoints** in `/api` directory
- Use **WebSocket events** for real-time features
- Follow the **separation of concerns** principle

**Testing**:
- Test your changes on **multiple devices** when possible
- Verify **WebSocket connections** work properly
- Check **mobile responsiveness** for UI changes
- Test **audio/video streaming** functionality

**Documentation**:
- Update **README.md** for new features
- Add **JSDoc comments** for new functions
- Update **API documentation** for new endpoints
- Include **configuration examples** when needed

#### Pull Request Process

1. **Ensure your code follows** the style guidelines
2. **Update documentation** as needed
3. **Test thoroughly** on different devices/browsers
4. **Write a clear PR description** explaining:
   - What changes you made
   - Why you made them
   - How to test the changes
   - Any breaking changes

5. **Link related issues** using keywords like "Fixes #123"

#### Pull Request Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Tested on desktop browser
- [ ] Tested on mobile device
- [ ] Tested audio/video streaming
- [ ] Tested WebSocket connections

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
```

## 🏗️ Project Structure

### Key Directories
```
pocket-soul/
├── integrated_app/          # Main application (recommended for most changes)
├── lib/                    # Core business logic modules
├── api/                    # REST API endpoints
├── public/                 # Web interface assets
├── vision_service.py       # Computer vision service
└── electron-main.js        # Desktop application entry
```

### Component Responsibilities
- **integrated_app/**: Complete audio + video streaming solution
- **lib/**: Reusable modules (mood detection, streaming, voice synthesis)
- **api/**: HTTP endpoints and WebSocket handlers
- **public/**: Static web assets and frontend code

## 🎯 Areas for Contribution

### High Priority
- **Performance Optimization**: Reduce latency, improve streaming quality
- **Mobile Experience**: Better fullscreen, gesture controls
- **Character Animations**: New emotions, better video content
- **Device Compatibility**: Support more browsers, mobile devices
- **Documentation**: Setup guides, API docs, tutorials

### Medium Priority  
- **UI/UX Improvements**: Better visual design, user experience
- **Configuration Options**: More customizable settings
- **Error Handling**: Better error messages, recovery
- **Monitoring**: Enhanced metrics, debugging tools

### Advanced Features
- **Multi-language Support**: I18n, voice synthesis in other languages
- **AI Model Options**: Support for different AI providers
- **Cloud Deployment**: Docker, Kubernetes support
- **Plugin System**: Extensible architecture

## 🧪 Testing Guidelines

### Manual Testing Checklist
- [ ] **Basic conversation**: Text input → AI response → audio output
- [ ] **Voice conversation**: Microphone → transcription → AI response → audio
- [ ] **Video streaming**: Emotional responses trigger appropriate videos
- [ ] **Mobile display**: QR code connection, fullscreen, video playback
- [ ] **Network connectivity**: Multiple devices, different networks
- [ ] **Error scenarios**: Invalid inputs, network failures, API errors

### Browser Testing
- **Desktop**: Chrome, Firefox, Safari, Edge
- **Mobile**: iOS Safari, Android Chrome, Samsung Internet
- **Features**: WebRTC, WebSocket, audio recording, fullscreen

## 📋 Issue Labels

We use these labels to categorize issues:

- **bug**: Something isn't working correctly
- **enhancement**: New feature or improvement
- **documentation**: Documentation needs update
- **good first issue**: Good for newcomers
- **help wanted**: Extra attention needed
- **priority: high/medium/low**: Issue priority
- **area: audio/video/ui/api**: Component affected

## 💬 Communication

### Getting Help
- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Code Review**: Use PR comments for specific feedback

### Community Guidelines
- **Be respectful** and inclusive to all contributors
- **Stay on topic** in discussions
- **Provide constructive feedback** in code reviews
- **Help newcomers** get started

## 🚀 Release Process

### Versioning
We use [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Workflow
1. **Feature freeze** for upcoming release
2. **Testing period** on multiple devices
3. **Documentation updates**
4. **Tag release** with changelog
5. **Deploy to production** environments

## 🙏 Recognition

Contributors are recognized in:
- **README.md** contributor section
- **Release notes** for significant contributions
- **GitHub insights** and contribution graphs

Thank you for helping make Pocket Soul better for everyone! 🔮

---

For questions about contributing, please open a discussion or reach out to the maintainers.