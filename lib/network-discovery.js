const ip = require('ip');
const QRCode = require('qrcode');

class NetworkDiscovery {
  constructor(port) {
    this.port = port;
    this.localIP = ip.address();
    this.urls = {
      local: `http://${this.localIP}:${this.port}`,
      localhost: `http://localhost:${this.port}`,
      ngrok: null,
      localtunnel: null
    };
    this.qrCodes = {};
  }
  
  async start() {
    try {
      // Generate QR codes for local URLs
      await this.generateQRCodes();
      
      // Try to set up tunnels (optional)
      await this.setupTunnels();
      
      console.log('✅ Network discovery initialized');
      
      return this.getConnectionInfo();
    } catch (error) {
      console.error('Network discovery error:', error);
      return this.getConnectionInfo();
    }
  }
  
  async generateQRCodes() {
    // Generate QR code for local network URL
    try {
      this.qrCodes.local = await QRCode.toDataURL(`${this.urls.local}/hologram`);
      this.qrCodes.localhost = await QRCode.toDataURL(`${this.urls.localhost}/hologram`);
      
      // Console QR code for terminal
      const terminalQR = await QRCode.toString(`${this.urls.local}/hologram`, {
        type: 'terminal',
        small: true
      });
      
      console.log('\n📱 Scan QR code for hologram display:');
      console.log(terminalQR);
      
    } catch (error) {
      console.error('QR code generation error:', error);
    }
  }
  
  async setupTunnels() {
    // Try ngrok if available
    await this.setupNgrok();
    
    // Try localtunnel if available
    await this.setupLocaltunnel();
  }
  
  async setupNgrok() {
    try {
      // Check if ngrok is configured
      if (!process.env.NGROK_AUTH_TOKEN) {
        console.log('ℹ️ Ngrok auth token not configured');
        return;
      }
      
      const ngrok = require('ngrok');
      
      await ngrok.authtoken(process.env.NGROK_AUTH_TOKEN);
      
      const url = await ngrok.connect({
        port: this.port,
        region: 'us'
      });
      
      this.urls.ngrok = url;
      this.qrCodes.ngrok = await QRCode.toDataURL(`${url}/hologram`);
      
      console.log(`📱 Ngrok URL: ${url}`);
      
    } catch (error) {
      console.log('Ngrok not available:', error.message);
    }
  }
  
  async setupLocaltunnel() {
    try {
      const localtunnel = require('localtunnel');
      
      const tunnel = await localtunnel({
        port: this.port,
        subdomain: 'pocketsoul' // Try to get consistent URL
      });
      
      this.urls.localtunnel = tunnel.url;
      this.qrCodes.localtunnel = await QRCode.toDataURL(`${tunnel.url}/hologram`);
      
      console.log(`📱 Localtunnel URL: ${tunnel.url}`);
      
      // Handle tunnel close
      tunnel.on('close', () => {
        console.log('Localtunnel closed');
        this.urls.localtunnel = null;
      });
      
    } catch (error) {
      console.log('Localtunnel not available:', error.message);
    }
  }
  
  async getConnectionInfo() {
    return {
      urls: this.urls,
      qrCodes: this.qrCodes,
      localIP: this.localIP,
      port: this.port,
      connections: {
        local: {
          url: `${this.urls.local}/hologram`,
          qr: this.qrCodes.local
        },
        ngrok: this.urls.ngrok ? {
          url: `${this.urls.ngrok}/hologram`,
          qr: this.qrCodes.ngrok
        } : null,
        localtunnel: this.urls.localtunnel ? {
          url: `${this.urls.localtunnel}/hologram`,
          qr: this.qrCodes.localtunnel
        } : null
      }
    };
  }
  
  // Get best available URL for sharing
  getBestUrl() {
    if (this.urls.ngrok) return this.urls.ngrok;
    if (this.urls.localtunnel) return this.urls.localtunnel;
    return this.urls.local;
  }
  
  // Format URLs for display
  getDisplayUrls() {
    const urls = [];
    
    urls.push({
      type: 'Local Network',
      url: `${this.urls.local}/hologram`,
      available: true
    });
    
    if (this.urls.ngrok) {
      urls.push({
        type: 'Ngrok (Public)',
        url: `${this.urls.ngrok}/hologram`,
        available: true
      });
    }
    
    if (this.urls.localtunnel) {
      urls.push({
        type: 'Localtunnel (Public)',
        url: `${this.urls.localtunnel}/hologram`,
        available: true
      });
    }
    
    return urls;
  }
}

module.exports = NetworkDiscovery;