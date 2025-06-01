// config.js - Configuration for the application
const path = require('path');
const fs = require('fs');

// Try to load environment variables from .env
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (error) {
  console.warn('⚠️ Failed to load dotenv package:', error.message);
}

// Default configuration
const config = {
  // API and WebSocket URLs - PRODUCTION ONLY
  apiBaseUrl: process.env.API_BASE_URL || 'http://venzell.skplay.net',
  wsUrl: process.env.WS_URL || 'ws://venzell.skplay.net:8096',
  frontendUrl: process.env.FRONTEND_URL || 'http://venzell.skplay.net',
  
  // Other configuration
  sessionDataPath: path.join(__dirname, 'session-data'),
  
  // Cloudflare R2 configuration (if available from env)
  cloudflare: {
    r2Endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    r2AccessKey: process.env.CLOUDFLARE_R2_ACCESS_KEY,
    r2SecretKey: process.env.CLOUDFLARE_R2_SECRET_KEY,
    r2Bucket: process.env.CLOUDFLARE_R2_BUCKET
  },

  // Application settings
  defaultWindowSize: {
    width: 1200,
    height: 800
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36'
};

// Create session data directory if it doesn't exist
if (!fs.existsSync(config.sessionDataPath)) {
  try {
    fs.mkdirSync(config.sessionDataPath, { recursive: true });
    console.log(`✅ Created session data directory at: ${config.sessionDataPath}`);
  } catch (error) {
    console.error(`❌ Failed to create session data directory: ${error.message}`);
  }
}

// Log the current configuration (omitting sensitive data)
console.log(`ℹ️ API URL: ${config.apiBaseUrl}`);
console.log(`ℹ️ WebSocket URL: ${config.wsUrl}`);
console.log(`ℹ️ Frontend URL: ${config.frontendUrl}`);

module.exports = config; 