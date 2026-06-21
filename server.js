const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ========== STATIC FILES ==========
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== LOGGING ==========
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleString('vi-VN')}] ${req.method} ${req.path}`);
  next();
});

// ========== MAIN ROUTE - CLOUD BROWSER ==========
app.get('/', (req, res) => {
  try {
    const webLink = 'https://f1686s.com/home/mine';
    const tapmonkeyFile = 'tapmonkey/f1686s_naptien.js';

    const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
      <meta http-equiv="X-UA-Compatible" content="ie=edge">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <meta name="apple-mobile-web-app-title" content="Cloud Browser">
      <meta name="theme-color" content="#667eea">
      <meta name="format-detection" content="telephone=no">
      <title>☁️ Cloud Browser</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }

        html, body {
          width: 100%;
          height: 100%;
          position: fixed;
          overflow: hidden;
          -webkit-font-smoothing: antialiased;
          -webkit-text-size-adjust: 100%;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: #f5f5f5;
          display: flex;
          flex-direction: column;
          touch-action: manipulation;
        }

        .status-bar {
          height: env(safe-area-inset-top);
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          flex-shrink: 0;
        }

        .toolbar {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: max(12px, env(safe-area-inset-left)) max(12px, env(safe-area-inset-right)) 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          flex-shrink: 0;
          flex-wrap: wrap;
          min-height: 50px;
        }

        .toolbar-title {
          color: white;
          font-weight: 600;
          font-size: 14px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .toolbar-buttons {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .btn {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: none;
          padding: 7px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          touch-action: manipulation;
          -webkit-user-select: none;
          user-select: none;
        }

        .btn:active {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(0.95);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .address-bar-container {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 150px;
        }

        .address-bar {
          flex: 1;
          padding: 7px 10px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          background: rgba(255, 255, 255, 0.95);
          color: #333;
          transition: all 0.2s;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-appearance: none;
          appearance: none;
        }

        .address-bar:focus {
          outline: none;
          background: white;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.4);
        }

        .go-btn {
          background: white;
          color: #667eea;
          border: none;
          padding: 7px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 11px;
          transition: all 0.2s;
          touch-action: manipulation;
          -webkit-appearance: none;
          appearance: none;
        }

        .go-btn:active {
          transform: scale(0.95);
        }

        .browser-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: white;
          min-height: 0;
        }

        .loading-bar {
          height: 3px;
          background: linear-gradient(90deg, #667eea, #764ba2);
          width: 0%;
          transition: width 0.3s;
          flex-shrink: 0;
        }

        .loading-bar.active {
          animation: loading 2s ease-in-out;
        }

        @keyframes loading {
          0% { width: 0%; }
          50% { width: 85%; }
          100% { width: 100%; }
        }

        .browser-frame-container {
          flex: 1;
          overflow: hidden;
          position: relative;
          min-height: 0;
        }

        iframe {
          width: 100%;
          height: 100%;
          border: none;
          background: white;
          display: block;
        }

        .error-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: white;
          color: #666;
          text-align: center;
          padding: max(40px, env(safe-area-inset-left)) max(40px, env(safe-area-inset-right)) max(40px, env(safe-area-inset-bottom));
        }

        .error-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .error-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #333;
        }

        .error-message {
          font-size: 13px;
          color: #999;
          margin-bottom: 24px;
        }

        .retry-btn {
          background: #667eea;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
          touch-action: manipulation;
          -webkit-appearance: none;
          appearance: none;
        }

        .retry-btn:active {
          transform: scale(0.95);
        }

        .info-bar {
          background: #f9f9f9;
          padding: 8px max(12px, env(safe-area-inset-left)) max(8px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-right));
          border-top: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #999;
          flex-shrink: 0;
          flex-wrap: wrap;
          gap: 8px;
        }

        .status-text {
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4caf50;
          animation: pulse 1.5s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .url-display {
          word-break: break-all;
          flex: 1;
          min-width: 100px;
        }

        @media (max-width: 480px) {
          .toolbar {
            min-height: auto;
            padding: 8px 8px;
            gap: 6px;
          }

          .toolbar-title {
            font-size: 12px;
            display: none;
          }

          .btn {
            padding: 6px 8px;
            font-size: 11px;
          }

          .address-bar {
            font-size: 11px;
            padding: 6px 8px;
          }

          .go-btn {
            padding: 6px 10px;
            font-size: 10px;
          }

          .info-bar {
            font-size: 10px;
            padding: 6px 8px;
          }
        }

        @media (hover: none) and (pointer: coarse) {
          .btn:active,
          .go-btn:active,
          .retry-btn:active {
            transform: scale(0.95);
          }
        }
      </style>
    </head>
    <body>
      <div class="status-bar"></div>

      <div class="toolbar">
        <span class="toolbar-title">☁️ Browser</span>
        <div class="toolbar-buttons">
          <button class="btn" id="backBtn" title="Back">◀</button>
          <button class="btn" id="forwardBtn" title="Forward">▶</button>
          <button class="btn" id="refreshBtn" title="Refresh">🔄</button>
          <button class="btn" id="homeBtn" title="Home">🏠</button>
        </div>
        <div class="address-bar-container">
          <input 
            type="text" 
            class="address-bar" 
            id="addressBar" 
            placeholder="URL"
            value="https://f1686s.com/home/mine"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          >
          <button class="go-btn" id="goBtn">Go</button>
        </div>
      </div>

      <div class="browser-container">
        <div class="loading-bar" id="loadingBar"></div>
        <div class="browser-frame-container" id="browserContent">
          <iframe 
            id="browserFrame" 
            src="https://f1686s.com/home/mine"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-presentation"
            allow="accelerometer; camera; gyroscope; magnetometer; microphone; payment; usb; geolocation"
            onload="onFrameLoad()"
            onerror="onFrameError()"
          ></iframe>
          <script src="tapmonkey/f1686s_naptien.js"></script>
        </div>
      </div>

      <div class="info-bar">
        <div class="status-text">
          <div class="status-dot"></div>
          <span>✅ Online</span>
        </div>
        <span class="url-display" id="urlDisplay">https://f1686s.com/home/mine</span>
      </div>

      <script>
        'use strict';

        const addressBar = document.getElementById('addressBar');
        const backBtn = document.getElementById('backBtn');
        const forwardBtn = document.getElementById('forwardBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const homeBtn = document.getElementById('homeBtn');
        const goBtn = document.getElementById('goBtn');
        const browserFrame = document.getElementById('browserFrame');
        const loadingBar = document.getElementById('loadingBar');
        const urlDisplay = document.getElementById('urlDisplay');
        const browserContent = document.getElementById('browserContent');

        const defaultUrl = 'https://f1686s.com/home/mine';
        let urlHistory = [defaultUrl];
        let historyIndex = 0;

        // Back Button
        backBtn.addEventListener('click', () => {
          if (historyIndex > 0) {
            historyIndex--;
            navigateToUrl(urlHistory[historyIndex]);
            updateButtons();
          }
        });

        // Forward Button
        forwardBtn.addEventListener('click', () => {
          if (historyIndex < urlHistory.length - 1) {
            historyIndex++;
            navigateToUrl(urlHistory[historyIndex]);
            updateButtons();
          }
        });

        // Refresh Button
        refreshBtn.addEventListener('click', () => {
          browserFrame.src = browserFrame.src;
          showLoading();
        });

        // Home Button
        homeBtn.addEventListener('click', () => {
          navigateToUrl(defaultUrl);
        });

        // Go Button & Enter Key
        goBtn.addEventListener('click', navigateFromAddressBar);
        addressBar.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            navigateFromAddressBar();
          }
        });

        // Address Bar Focus
        addressBar.addEventListener('focus', () => {
          addressBar.select();
        });

        function navigateFromAddressBar() {
          let url = addressBar.value.trim();
          
          if (!url) return;

          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }

          navigateToUrl(url);
        }

        function navigateToUrl(url) {
          try {
            new URL(url);
            
            browserFrame.src = url;
            addressBar.value = url;
            urlDisplay.textContent = url;

            if (urlHistory[historyIndex] !== url) {
              urlHistory = urlHistory.slice(0, historyIndex + 1);
              urlHistory.push(url);
              historyIndex++;
            }

            updateButtons();
            showLoading();
          } catch (e) {
            showError('❌ URL sai', 'Vui lòng nhập URL hợp lệ');
          }
        }

        function updateButtons() {
          backBtn.disabled = historyIndex <= 0;
          forwardBtn.disabled = historyIndex >= urlHistory.length - 1;
        }

        function showLoading() {
          loadingBar.classList.add('active');
        }

        function onFrameLoad() {
          loadingBar.classList.remove('active');
          console.log('✅ Frame loaded');
        }

        function onFrameError() {
          console.warn('⚠️ Frame error');
        }

        function showError(title, message) {
          browserContent.innerHTML = \`
            <div class="error-container">
              <div class="error-icon">⚠️</div>
              <div class="error-title">\${title}</div>
              <div class="error-message">\${message}</div>
              <button class="retry-btn" onclick="location.reload()">Thử lại</button>
            </div>
          \`;
        }

        updateButtons();

        console.log('════════════════════════════════════');
        console.log('☁️ Cloud Browser Started');
        console.log('Default URL: https://f1686s.com/home/mine');
        console.log('TapMonkey: Loaded');
        console.log('════════════════════════════════════');
      </script>
    </body>
    </html>
    `;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).send('❌ Server Error: ' + error.message);
  }
});

// ========== SERVE TAPMONKEY FILE ==========
app.get('/tapmonkey/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    if (!/^[\w\-\.]+$/.test(filename)) {
      return res.status(400).send('Invalid filename');
    }
    
    const filePath = path.join(__dirname, 'public', 'tapmonkey', filename);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ File not found: ${filePath}`);
      return res.status(404).send(`File not found: ${filename}`);
    }
    
    console.log(`✅ Serving: ${filename}`);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(filePath);
  } catch (error) {
    console.error('❌ Error serving file:', error);
    res.status(500).send('Error: ' + error.message);
  }
});

// ========== API STATUS ==========
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    server: 'Cloud Browser',
    uptime: process.uptime(),
    timestamp: new Date().toLocaleString('vi-VN')
  });
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log('\n');
  console.log('╔════════════════════════════════════════╗');
  console.log('║      ☁️  CLOUD BROWSER - RENDER         ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Server started successfully`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 URL: https://f1686s.com/home/mine`);
  console.log(`📦 TapMonkey: Loaded`);
  console.log(`⏰ Time: ${new Date().toLocaleString('vi-VN')}`);
  console.log('');
});

process.on('SIGTERM', () => {
  console.log('\n✅ Server shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
