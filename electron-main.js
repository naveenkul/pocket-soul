const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store').default;
const ElectronAudioRecorder = require('./electron-audio-recorder');

// Configuration store
const store = new Store({
  defaults: {
    hotkey: 'CommandOrControl+Shift+Space',
    pushToTalk: true,
    serverPort: 3000,
    autoStart: true
  }
});

class PocketSoulApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.serverProcess = null;
    this.isRecording = false;
    // Use the actual port from environment or default
    const serverPort = process.env.PORT || 3000; // Use port 3000 to match server.js
    this.serverUrl = `http://localhost:${serverPort}`;
    console.log(`Using server URL: ${this.serverUrl}`);
    this.audioRecorder = new ElectronAudioRecorder();
    
    // Bind methods
    this.createWindow = this.createWindow.bind(this);
    this.createTray = this.createTray.bind(this);
    this.registerGlobalShortcuts = this.registerGlobalShortcuts.bind(this);
  }
  
  async init() {
    // Single instance lock
    const gotTheLock = app.requestSingleInstanceLock();
    
    if (!gotTheLock) {
      app.quit();
      return;
    }
    
    // App event handlers
    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
      }
    });
    
    app.whenReady().then(() => {
      // Don't start server if it's already running (check by trying to connect)
      this.checkServerRunning().then(isRunning => {
        if (!isRunning) {
          this.startServer();
        } else {
          console.log('Server already running, skipping spawn');
        }
      });
      
      this.createTray();
      this.registerGlobalShortcuts();
      
      // Create window if autoStart is enabled
      if (store.get('autoStart')) {
        this.createWindow();
      }
    });
    
    app.on('window-all-closed', (e) => {
      // Prevent app from quitting when window is closed
      e.preventDefault();
    });
    
    app.on('will-quit', () => {
      // Unregister all shortcuts
      globalShortcut.unregisterAll();
      
      // Stop server
      if (this.serverProcess) {
        this.serverProcess.kill();
      }
    });
    
    // IPC handlers
    this.setupIPC();
  }
  
  async checkServerRunning() {
    // Use built-in http module instead of node-fetch
    const http = require('http');
    return new Promise((resolve) => {
      const url = new URL(`${this.serverUrl}/api/connection`);
      const req = http.get({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout: 1000
      }, (res) => {
        console.log(`Server check: Status ${res.statusCode}`);
        resolve(res.statusCode === 200);
      });
      
      req.on('error', (err) => {
        console.log('Server not running:', err.code);
        resolve(false);
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }
  
  startServer() {
    console.log('Starting Pocket Soul server...');
    
    // Start the Node.js server
    this.serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, ELECTRON_MODE: 'true' }
    });
    
    this.serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
    });
    
    this.serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });
    
    this.serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
      // Restart server if it crashes
      if (code !== 0 && !app.isQuitting) {
        setTimeout(() => this.startServer(), 2000);
      }
    });
  }
  
  createWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
      return;
    }
    
    this.mainWindow = new BrowserWindow({
      width: 400,
      height: 600,
      minWidth: 350,
      minHeight: 500,
      title: 'Pocket Soul',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'electron-preload.js')
      },
      frame: true,
      resizable: true,
      backgroundColor: '#1a1a1a'
    });
    
    // Load the main interface from the actual server URL
    console.log(`Loading interface from: ${this.serverUrl}`);
    this.mainWindow.loadURL(this.serverUrl);
    
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }
  
  createTray() {
    // Create tray icon (you'll need to add an icon file)
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    
    // Check if icon exists, if not, skip tray creation on macOS
    const fs = require('fs');
    if (!fs.existsSync(iconPath)) {
      console.log('Tray icon not found, creating without icon');
      // On macOS, we can create a tray with just text
      if (process.platform === 'darwin') {
        // For macOS, we'll create a simple tray without icon
        // Note: This might not work perfectly but will avoid crash
        return;
      }
    }
    
    try {
      this.tray = new Tray(iconPath);
    } catch (error) {
      console.error('Failed to create tray:', error);
      return;
    }
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Pocket Soul',
        click: () => this.createWindow()
      },
      {
        label: 'Start Recording',
        accelerator: store.get('hotkey'),
        click: () => this.toggleRecording()
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => this.showSettings()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    this.tray.setToolTip('Pocket Soul - AI Companion');
    this.tray.setContextMenu(contextMenu);
    
    // Double-click to show window
    this.tray.on('double-click', () => {
      this.createWindow();
    });
  }
  
  registerGlobalShortcuts() {
    const hotkey = store.get('hotkey');
    const pushToTalk = store.get('pushToTalk');
    
    // Unregister existing shortcuts
    globalShortcut.unregisterAll();
    
    if (pushToTalk) {
      // Push-to-talk mode: Hold Space to record, release to stop
      // We'll use a simple Space key for push-to-talk
      const spaceKey = 'Space';
      
      // Track key state
      let spacePressed = false;
      
      // Register Space key for push-to-talk
      const ret = globalShortcut.register(spaceKey, () => {
        if (!spacePressed) {
          spacePressed = true;
          console.log('Space pressed - starting recording');
          this.startRecording();
          
          // Set up a timer to check if Space is still held
          // This is a workaround since Electron can't detect key release directly
          this.checkKeyRelease(spaceKey);
        }
      });
      
      if (!ret) {
        console.error('Failed to register Space key for push-to-talk');
        // Fall back to the original hotkey
        this.registerToggleMode(hotkey);
      } else {
        console.log('Push-to-talk enabled: Hold Space to record');
      }
    } else {
      // Toggle mode: Press hotkey to start/stop
      this.registerToggleMode(hotkey);
    }
  }
  
  registerToggleMode(hotkey) {
    const ret = globalShortcut.register(hotkey, () => {
      console.log(`Hotkey ${hotkey} pressed`);
      this.toggleRecording();
    });
    
    if (!ret) {
      console.error('Failed to register global shortcut');
      dialog.showErrorBox('Shortcut Registration Failed', 
        `Could not register the global shortcut: ${hotkey}\nIt might be in use by another application.`);
    } else {
      console.log(`Toggle mode: Press ${hotkey} to start/stop recording`);
    }
  }
  
  checkKeyRelease(key) {
    // Check if the key is still pressed by trying to re-register it
    // If registration succeeds, the key was released
    setTimeout(() => {
      if (this.isRecording) {
        globalShortcut.unregister(key);
        const canRegister = globalShortcut.register(key, () => {
          console.log('Space released - stopping recording');
          this.stopRecording();
          // Re-register for next press
          this.registerGlobalShortcuts();
        });
        
        if (!canRegister) {
          // Key is still held, check again
          this.checkKeyRelease(key);
        }
      }
    }, 100);
  }
  
  setupReleaseDetection() {
    // After a short delay, register the release shortcut
    setTimeout(() => {
      if (this.isRecording) {
        // User should release Space to stop recording
        console.log('Recording started - release Space key to stop');
      }
    }, 100);
  }
  
  async startRecording() {
    if (this.isRecording) return;
    
    this.isRecording = true;
    console.log('Started recording...');
    
    // Update tray icon to show recording state
    if (this.tray) {
      this.tray.setTitle('🔴 Recording...');
    }
    
    // Start actual audio recording
    const started = await this.audioRecorder.startRecording();
    if (!started) {
      console.error('Failed to start audio recording');
      this.isRecording = false;
      if (this.tray) {
        this.tray.setTitle('');
      }
      return;
    }
    
    // Send message to server to start recording
    await this.sendToServer('start-recording');
    
    // Show recording indicator window
    this.showRecordingIndicator();
  }
  
  async stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    console.log('Stopped recording');
    
    // Update tray icon
    if (this.tray) {
      this.tray.setTitle('');
    }
    
    // Stop actual audio recording and get the buffer
    const audioBuffer = await this.audioRecorder.stopRecording();
    
    if (audioBuffer) {
      // Send audio data to server
      const fetch = require('node-fetch');
      
      try {
        // First send the audio data
        await fetch(`${this.serverUrl}/api/electron/audio-chunk`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'audio/wav'
          },
          body: audioBuffer
        });
        
        // Then stop recording and process
        await this.sendToServer('stop-recording');
      } catch (error) {
        console.error('Failed to send audio to server:', error);
      }
    }
    
    // Hide recording indicator
    this.hideRecordingIndicator();
  }
  
  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }
  
  showRecordingIndicator() {
    // Create a small indicator window
    if (!this.indicatorWindow) {
      this.indicatorWindow = new BrowserWindow({
        width: 200,
        height: 60,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        focusable: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      
      // Load a simple recording indicator HTML
      this.indicatorWindow.loadURL(`data:text/html,
        <html>
          <body style="margin:0;padding:10px;background:rgba(255,0,0,0.8);color:white;font-family:system-ui;text-align:center;border-radius:10px;">
            <div style="font-size:16px;font-weight:bold;">🔴 Recording...</div>
            <div style="font-size:12px;">Press ${store.get('hotkey')} to stop</div>
          </body>
        </html>
      `);
      
      // Position in bottom right corner
      const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
      this.indicatorWindow.setPosition(width - 220, height - 80);
    }
    
    this.indicatorWindow.show();
  }
  
  hideRecordingIndicator() {
    if (this.indicatorWindow) {
      this.indicatorWindow.hide();
    }
  }
  
  async sendToServer(event, data = {}) {
    // Send message to the server via HTTP or WebSocket
    const fetch = require('node-fetch');
    
    try {
      const response = await fetch(`${this.serverUrl}/api/electron/${event}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (event === 'stop-recording') {
        const result = await response.json();
        if (result.success && result.result) {
          // Handle the audio response
          console.log('Got response from AI:', result.result.response);
          // The audio is already played on the server side
        }
      }
      
      return response;
    } catch (err) {
      console.error(`Failed to send to server: ${err}`);
      throw err;
    }
  }
  
  showSettings() {
    // Create settings window
    const settingsWindow = new BrowserWindow({
      width: 500,
      height: 400,
      parent: this.mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'electron-preload.js')
      }
    });
    
    // Load settings page
    settingsWindow.loadURL(`${this.serverUrl}/settings`);
  }
  
  setupIPC() {
    // Handle IPC messages from renderer
    ipcMain.on('start-recording', () => {
      this.startRecording();
    });
    
    ipcMain.on('stop-recording', () => {
      this.stopRecording();
    });
    
    ipcMain.on('update-settings', (event, settings) => {
      // Update settings
      Object.keys(settings).forEach(key => {
        store.set(key, settings[key]);
      });
      
      // Re-register shortcuts if hotkey changed
      if (settings.hotkey) {
        this.registerGlobalShortcuts();
      }
    });
    
    ipcMain.handle('get-settings', () => {
      return store.store;
    });
  }
}

// Initialize app
const pocketSoulApp = new PocketSoulApp();
pocketSoulApp.init();