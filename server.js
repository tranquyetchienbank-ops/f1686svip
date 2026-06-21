const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { URL } = require('url');

const app = express();

// ========== CONFIG ==========
const CONFIG = {
  DEFAULT_URL: 'https://f1686s.com/home/mine',
  PORT: process.env.PORT || 3000,
  TIMEOUT: 20000,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// ========== STATIC FILES ==========
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========== LOGGING ==========
app.use((req, res, next) => {
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`[${now}] ${req.method} ${req.path}`);
  next();
});

// ========== FETCH HELPER ==========
function fetchUrl(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    let parsedUrl;
    
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return reject(new Error('Invalid URL: ' + url));
    }
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (url.startsWith('https') ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'close',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      },
      timeout: CONFIG.TIMEOUT
    };
    
    console.log(`🌐 Fetching: ${url}`);
    
    const request = client.request(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          redirectUrl = new URL(redirectUrl, url).href;
        }
        console.log(`↪️ Redirect to: ${redirectUrl}`);
        if (retries > 0) {
          return fetchUrl(redirectUrl, retries - 1).then(resolve).catch(reject);
        }
        return reject(new Error('Too many redirects'));
      }
      
      // Check status
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
      
      let data = [];
      let stream = res;
      const encoding = res.headers['content-encoding'];
      
      try {
        if (encoding === 'gzip') {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = res.pipe(zlib.createInflate());
        } else if (encoding === 'br') {
          stream = res.pipe(zlib.createBrotliDecompress());
        }
      } catch (e) {
        return reject(new Error(`Decompression error: ${e.message}`));
      }
      
      stream.on('data', (chunk) => data.push(chunk));
      stream.on('end', () => {
        try {
          const html = Buffer.concat(data).toString('utf8');
          resolve({
            html: html,
            headers: res.headers,
            statusCode: res.statusCode,
            contentType: res.headers['content-type'] || 'text/html'
          });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
      stream.on('error', reject);
    });
    
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
    request.end();
  });
}

// ========== REMOVE ERUDA ==========
function removeEruda(html) {
  if (!html) return html;
  
  try {
    let cleaned = html
      .replace(/<script[^>]*?eruda[^>]*?>[^<]*?<\/script>/gi, '<!-- Eruda removed -->')
      .replace(/<script[^>]*?src=["'][^"']*?eruda[^"']*?["'][^>]*?><\/script>/gi, '<!-- Eruda removed -->')
      .replace(/eruda\s*\.\s*init\s*\(/gi, '(function(){console.log("🔧 Eruda blocked")})(')
      .replace(/window\s*\.\s*eruda/g, 'undefined')
      .replace(/\beruda\b/g, 'undefined');
    
    console.log('🔧 Eruda removed');
    return cleaned;
  } catch (e) {
    console.warn('⚠️ Error removing Eruda:', e.message);
    return html;
  }
}

// ========== INJECT TAPMONKEY (Userscript) ==========
function injectTapmonkeyScript(html, tapmonkeyCode, tapmonkeyUrl) {
  if (!tapmonkeyCode && !tapmonkeyUrl) return html;
  
  try {
    const injectionCode = `
<!-- ===== TAPMONKEY INJECTED ===== -->
<script type="text/javascript">
(function() {
  'use strict';
  console.log('🎮 TapMonkey Loader v2.0');
  
  // Block Eruda errors
  window.addEventListener('error', function(e) {
    if (e.message && (e.message.includes('eruda') || e.message.includes('Eruda'))) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  }, true);
  
  // Load TapMonkey
  function loadTapmonkey() {
    try {
      // Inline code
      ${tapmonkeyCode || ''}
      
      // Or load from external
      ${tapmonkeyUrl ? `
      var script = document.createElement('script');
      script.src = '${tapmonkeyUrl}';
      script.onload = function() {
        console.log('✅ TapMonkey loaded from: ${tapmonkeyUrl}');
      };
      script.onerror = function() {
        console.error('❌ Failed to load TapMonkey');
      };
      document.head.appendChild(script);
      ` : ''}
      
      console.log('✅ TapMonkey initialized');
    } catch(e) {
      console.error('❌ TapMonkey error:', e.message);
    }
  }
  
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTapmonkey);
  } else {
    loadTapmonkey();
  }
})();
</script>
<!-- ===== END TAPMONKEY ===== -->
`;
    
    // Inject before </body>
    if (html.includes('</body>')) {
      return html.replace('</body>', injectionCode + '\n</body>');
    } else if (html.includes('</html>')) {
      return html.replace('</html>', injectionCode + '\n</html>');
    } else {
      return html + '\n' + injectionCode;
    }
  } catch (e) {
    console.warn('⚠️ Error injecting TapMonkey:', e.message);
    return html;
  }
}

// ========== PROXY ROUTE ==========
app.get('/proxy', async (req, res) => {
  try {
    let targetUrl = req.query.url || CONFIG.DEFAULT_URL;
    
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch(e) {}
    
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }
    
    console.log(`🌐 Proxying: ${targetUrl}`);
    
    const result = await fetchUrl(targetUrl);
    
    // Load TapMonkey
    let tapmonkeyCode = '';
    let tapmonkeyUrl = '';
    const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
    const tapmonkeyPublicPath = '/tapmonkey/f1686s_naptien.js';
    
    if (fs.existsSync(tapmonkeyPath)) {
      try {
        tapmonkeyCode = fs.readFileSync(tapmonkeyPath, 'utf8');
        tapmonkeyUrl = tapmonkeyPublicPath;
        console.log(`✅ TapMonkey loaded (${(tapmonkeyCode.length / 1024).toFixed(1)}KB)`);
      } catch (e) {
        console.warn('⚠️ Cannot read TapMonkey:', e.message);
      }
    } else {
      console.warn('⚠️ TapMonkey file missing');
    }
    
    // Process HTML
    let modifiedHtml = result.html || '';
    modifiedHtml = removeEruda(modifiedHtml);
    
    // Inject TapMonkey
    if (tapmonkeyCode || tapmonkeyUrl) {
      modifiedHtml = injectTapmonkeyScript(modifiedHtml, tapmonkeyCode, tapmonkeyUrl);
      console.log('💉 TapMonkey injected');
    }
    
    // Send response
    res.setHeader('Content-Type', result.contentType || 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Proxy-By', 'CloudBrowser-v6');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(modifiedHtml);
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    res.status(500).json({ error: error.message, url: req.query.url });
  }
});

// ========== SERVE TAPMONKEY ==========
app.get('/tapmonkey/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[\w\-\.]+$/.test(filename)) {
    return res.status(400).send('Invalid filename');
  }
  
  const filePath = path.join(__dirname, 'public', 'tapmonkey', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

// ========== MAIN PAGE ==========
app.get('/', (req, res) => {
  const defaultUrl = CONFIG.DEFAULT_URL;
  
  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a1a2e">
  <title>☁️ Cloud Browser</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #667eea;
      --primary-dark: #5a67d8;
      --secondary: #764ba2;
      --bg: #0f0f1a;
      --surface: #1a1a2e;
      --surface-light: #2d2d44;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
    }
    
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    
    body {
      display: flex;
      flex-direction: column;
    }
    
    /* ===== TOOLBAR ===== */
    .toolbar {
      background: var(--surface);
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      flex-shrink: 0;
      min-height: 52px;
    }
    
    .toolbar-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--primary);
      font-weight: 700;
      font-size: 16px;
      white-space: nowrap;
    }
    
    .toolbar-brand span {
      font-size: 20px;
    }
    
    .toolbar-buttons {
      display: flex;
      gap: 4px;
    }
    
    .btn {
      background: rgba(255,255,255,0.06);
      color: var(--text-muted);
      border: none;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
      touch-action: manipulation;
      min-width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .btn:hover {
      background: rgba(255,255,255,0.12);
      color: var(--text);
    }
    
    .btn:active {
      transform: scale(0.92);
    }
    
    .btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
      transform: none;
    }
    
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--primary-dark);
      color: white;
    }
    
    .btn-home {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      font-weight: 600;
    }
    
    .btn-home:hover {
      opacity: 0.9;
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
      padding: 7px 12px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      font-size: 13px;
      background: rgba(255,255,255,0.05);
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
      min-width: 80px;
    }
    
    .address-bar:focus {
      border-color: var(--primary);
      background: rgba(255,255,255,0.08);
    }
    
    .address-bar::placeholder {
      color: var(--text-muted);
    }
    
    .btn-go {
      background: var(--primary);
      color: white;
      border: none;
      padding: 7px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: background 0.2s;
    }
    
    .btn-go:hover {
      background: var(--primary-dark);
    }
    
    /* ===== STATUS BAR ===== */
    .status-bar {
      background: var(--surface);
      padding: 4px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--text-muted);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 4px;
    }
    
    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #22c55e;
      display: inline-block;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    
    .badge {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
    }
    
    .url-display {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    /* ===== BROWSER ===== */
    .browser-container {
      flex: 1;
      background: white;
      overflow: hidden;
      position: relative;
      min-height: 0;
    }
    
    .loading-bar {
      height: 3px;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      width: 0%;
      transition: width 0.3s;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 10;
    }
    
    .loading-bar.active {
      animation: loading 2s ease-in-out;
    }
    
    @keyframes loading {
      0% { width: 0%; }
      50% { width: 70%; }
      100% { width: 100%; }
    }
    
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      background: white;
    }
    
    /* ===== RESPONSIVE ===== */
    @media (max-width: 640px) {
      .toolbar {
        padding: 6px 8px;
        gap: 4px;
      }
      
      .toolbar-brand {
        font-size: 14px;
      }
      
      .toolbar-brand span {
        font-size: 18px;
      }
      
      .btn {
        padding: 4px 8px;
        font-size: 12px;
        min-width: 28px;
      }
      
      .address-bar {
        font-size: 12px;
        padding: 5px 8px;
      }
      
      .btn-go {
        padding: 5px 12px;
        font-size: 12px;
      }
      
      .status-bar {
        font-size: 10px;
        padding: 3px 8px;
      }
      
      .url-display {
        max-width: 120px;
      }
    }
    
    @media (max-width: 400px) {
      .toolbar-brand span {
        display: none;
      }
      
      .toolbar-brand {
        font-size: 12px;
      }
    }
    
    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg);
    }
    ::-webkit-scrollbar-thumb {
      background: var(--surface-light);
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-brand">
      <span>☁️</span> Cloud
    </div>
    
    <div class="toolbar-buttons">
      <button class="btn" id="backBtn" title="Back">◀</button>
      <button class="btn" id="forwardBtn" title="Forward">▶</button>
      <button class="btn" id="refreshBtn" title="Refresh">⟳</button>
      <button class="btn btn-home" id="homeBtn" title="Home">🏠</button>
    </div>
    
    <div class="address-bar-container">
      <input type="text" class="address-bar" id="addressBar" placeholder="Enter URL..." value="${defaultUrl}" autofocus>
      <button class="btn-go" id="goBtn">Go</button>
    </div>
  </div>
  
  <!-- Status Bar -->
  <div class="status-bar">
    <div class="status-item">
      <span class="status-dot"></span>
      <span>Online</span>
    </div>
    <div class="status-item">
      <span class="badge">🎮 TapMonkey</span>
    </div>
    <div class="status-item url-display" id="urlDisplay">${defaultUrl}</div>
  </div>
  
  <!-- Browser -->
  <div class="browser-container">
    <div class="loading-bar" id="loadingBar"></div>
    <iframe 
      id="browserFrame" 
      src="/proxy?url=${encodeURIComponent(defaultUrl)}"
      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals allow-downloads"
      allow="accelerometer; camera; gyroscope; magnetometer; microphone; payment; usb; geolocation"
      loading="eager"
    ></iframe>
  </div>

  <script>
    (function() {
      'use strict';
      
      // DOM Elements
      const addressBar = document.getElementById('addressBar');
      const browserFrame = document.getElementById('browserFrame');
      const loadingBar = document.getElementById('loadingBar');
      const urlDisplay = document.getElementById('urlDisplay');
      const backBtn = document.getElementById('backBtn');
      const forwardBtn = document.getElementById('forwardBtn');
      const refreshBtn = document.getElementById('refreshBtn');
      const homeBtn = document.getElementById('homeBtn');
      const goBtn = document.getElementById('goBtn');
      
      const defaultUrl = '${defaultUrl}';
      let history = [defaultUrl];
      let historyIndex = 0;
      
      // Navigate function
      function navigate(url) {
        if (!url) return;
        url = url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        try {
          new URL(url);
        } catch(e) {
          console.warn('Invalid URL:', url);
          return;
        }
        
        const proxyUrl = '/proxy?url=' + encodeURIComponent(url);
        browserFrame.src = proxyUrl;
        addressBar.value = url;
        urlDisplay.textContent = url;
        
        if (history[historyIndex] !== url) {
          history = history.slice(0, historyIndex + 1);
          history.push(url);
          historyIndex++;
        }
        updateButtons();
        showLoading();
        console.log('🌐 Navigated to:', url);
      }
      
      function updateButtons() {
        backBtn.disabled = historyIndex <= 0;
        forwardBtn.disabled = historyIndex >= history.length - 1;
      }
      
      function showLoading() {
        loadingBar.classList.add('active');
        setTimeout(() => {
          loadingBar.classList.remove('active');
        }, 3000);
      }
      
      // Events
      goBtn.addEventListener('click', () => navigate(addressBar.value));
      addressBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          navigate(addressBar.value);
        }
      });
      
      homeBtn.addEventListener('click', () => {
        navigate(defaultUrl);
        addressBar.value = defaultUrl;
      });
      
      refreshBtn.addEventListener('click', () => {
        const currentUrl = history[historyIndex] || defaultUrl;
        navigate(currentUrl);
      });
      
      backBtn.addEventListener('click', () => {
        if (historyIndex > 0) {
          historyIndex--;
          navigate(history[historyIndex]);
        }
      });
      
      forwardBtn.addEventListener('click', () => {
        if (historyIndex < history.length - 1) {
          historyIndex++;
          navigate(history[historyIndex]);
        }
      });
      
      // Iframe events
      browserFrame.addEventListener('load', () => {
        loadingBar.classList.remove('active');
        console.log('✅ Page loaded');
      });
      
      browserFrame.addEventListener('error', () => {
        console.warn('⚠️ Iframe load error');
        loadingBar.classList.remove('active');
      });
      
      // Update address bar when iframe navigates internally
      // (limited due to CORS, but we can try)
      browserFrame.addEventListener('load', () => {
        try {
          const frameUrl = browserFrame.contentWindow.location.href;
          if (frameUrl && frameUrl.startsWith('/proxy')) {
            const params = new URLSearchParams(frameUrl.split('?')[1]);
            const url = params.get('url');
            if (url) {
              const decoded = decodeURIComponent(url);
              addressBar.value = decoded;
              urlDisplay.textContent = decoded;
            }
          }
        } catch(e) {
          // Cross-origin, ignore
        }
      });
      
      // Init
      updateButtons();
      console.log('☁️ Cloud Browser v6');
      console.log('🎮 TapMonkey auto-inject via proxy');
      console.log('📦 Script tự động chạy, không cần extension');
    })();
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

// ========== API STATUS ==========
app.get('/api/status', (req, res) => {
  const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
  res.json({
    status: 'online',
    version: '6.0.0',
    tapmonkey: fs.existsSync(tapmonkeyPath) ? 'ready' : 'missing',
    timestamp: new Date().toISOString()
  });
});

// ========== ERROR HANDLING ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: err.message });
});

// ========== START SERVER ==========
const PORT = CONFIG.PORT;
const server = app.listen(PORT, '0.0.0.0', () => {
  const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
  const tapmonkeyReady = fs.existsSync(tapmonkeyPath);
  
  console.log(`
╔════════════════════════════════════════════╗
║  ☁️  CLOUD BROWSER v6                      ║
║  🎮 TapMonkey Auto-Inject (Userscript)    ║
║  🔧 Eruda Auto-Blocked                    ║
╚════════════════════════════════════════════╝
✅ Port: ${PORT}
🎮 TapMonkey: ${tapmonkeyReady ? '✅ READY' : '❌ MISSING'}
📂 TapMonkey path: ${tapmonkeyPath}
🌐 Default URL: ${CONFIG.DEFAULT_URL}
⏰ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
  `);
  
  if (!tapmonkeyReady) {
    console.warn('⚠️  Tạo file: public/tapmonkey/f1686s_naptien.js');
  }
});

// ========== GRACEFUL SHUTDOWN ==========
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down...');
  server.close(() => process.exit(0));
});

// ========== KEEP ALIVE ==========
setInterval(() => {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT;
  const client = baseUrl.startsWith('https') ? https : http;
  client.get(baseUrl + '/api/status', () => {})
    .on('error', () => {});
}, 600000);
