#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Pocket Soul with ngrok...');
console.log('=====================================');

// Check if ngrok is installed
const checkNgrok = spawn('which', ['ngrok']);
checkNgrok.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ ngrok is not installed!');
    console.log('');
    console.log('To install ngrok:');
    console.log('  macOS: brew install ngrok');
    console.log('  or visit: https://ngrok.com/download');
    console.log('');
    console.log('After installing, authenticate ngrok:');
    console.log('  1. Sign up at https://ngrok.com');
    console.log('  2. Get your auth token from the dashboard');
    console.log('  3. Run: ngrok config add-authtoken YOUR_TOKEN');
    process.exit(1);
  } else {
    checkNgrokAuth();
  }
});

function checkNgrokAuth() {
  // Check if ngrok is authenticated
  const checkAuth = spawn('ngrok', ['config', 'check'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  let hasAuth = false;
  
  checkAuth.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Valid configuration file')) {
      hasAuth = true;
    }
  });
  
  checkAuth.on('close', () => {
    if (!hasAuth) {
      console.warn('⚠️  ngrok auth token not configured!');
      console.log('');
      console.log('To configure ngrok:');
      console.log('  1. Sign up at https://ngrok.com');
      console.log('  2. Get your auth token from the dashboard');
      console.log('  3. Run: ngrok config add-authtoken YOUR_TOKEN');
      console.log('');
      console.log('Attempting to start without authentication (limited to 8-hour sessions)...');
    }
    startNgrok();
  });
}

function startNgrok() {
  console.log(`📡 Starting ngrok tunnel on port ${PORT}...`);
  
  const ngrok = spawn('ngrok', ['http', PORT.toString()], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let ngrokUrl = null;
  let dataBuffer = '';

  ngrok.stdout.on('data', (data) => {
    dataBuffer += data.toString();
    
    // Try to extract the URL from ngrok output
    const matches = dataBuffer.match(/https:\/\/[a-z0-9]+\.ngrok[\-a-z0-9]*\.(?:io|app)/gi);
    if (matches && !ngrokUrl) {
      ngrokUrl = matches[0];
      console.log('');
      console.log('✅ ngrok tunnel established!');
      console.log('=====================================');
      console.log(`🌐 Public HTTPS URL: ${ngrokUrl}`);
      console.log(`📱 Mobile Access: ${ngrokUrl}/hologram`);
      console.log(`🖥️  Control Panel: ${ngrokUrl}`);
      console.log('');
      console.log('📱 Open this URL on your phone to access the hologram display');
      console.log('');
      
      // Save ngrok URL to file for other processes to read
      fs.writeFileSync(
        path.join(__dirname, '.ngrok-url'),
        ngrokUrl,
        'utf8'
      );
    }
  });

  ngrok.stderr.on('data', (data) => {
    const error = data.toString();
    if (error.includes('ERR_NGROK')) {
      console.error('❌ ngrok error:', error);
    }
  });

  ngrok.on('close', (code) => {
    console.log(`ngrok process exited with code ${code}`);
    // Clean up URL file
    try {
      fs.unlinkSync(path.join(__dirname, '.ngrok-url'));
    } catch (e) {}
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nShutting down ngrok tunnel...');
    ngrok.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    ngrok.kill();
    process.exit(0);
  });
}