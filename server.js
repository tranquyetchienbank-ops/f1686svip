const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const zlib = require('zlib'); // ✅ ĐÃ THÊM
const { URL } = require('url'); // ✅ THÊM URL PARSER

const app = express();

// ========== STATIC FILES ==========
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== LOGGING ==========
app.use((req, res, next) => {
  const now = new Date();
  const timeStr = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`[${timeStr}] ${req.method} ${req.path}`);
  next();
});

// ========== FETCH HELPER (ĐÃ SỬA LỖI) ==========
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    // ✅ THÊM XỬ LÝ URL PARAMS
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
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'close' // ✅ THÊM ĐỂ TRÁNH GIỮ KẾT NỐI LÂU
      },
      timeout: 15000 // ✅ ĐÃ CÓ TIMEOUT
    };
    
    console.log(`🌐 Fetching: ${url}`);
    
    const request = client.request(options, (res) => {
      // ✅ XỬ LÝ REDIRECT ĐÚNG CÁCH
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          redirectUrl = new URL(redirectUrl, url).href;
        } else {
          redirectUrl = new URL(redirectUrl).href;
        }
        console.log(`↪️ Redirect to: ${redirectUrl}`);
        return fetchUrl(redirectUrl).then(resolve).catch(reject);
      }
      
      // ✅ CHECK STATUS CODE
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
      
      let data = [];
      
      // ✅ XỬ LÝ COMPRESSION
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
      
      stream.on('data', (chunk) => {
        data.push(chunk);
      });
      
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
      
      stream.on('error', (e) => {
        reject(new Error(`Stream error: ${e.message}`));
      });
    });
    
    request.on('error', (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });
    
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout after 15s'));
    });
    
    request.end();
  });
}

// ========== REMOVE ERUDA TỪ HTML ==========
function removeEruda(html) {
  if (!html) return html;
  
  try {
    // Xóa script eruda
    let cleaned = html.replace(/<script[^>]*?eruda[^>]*?>[^<]*?<\/script>/gi, '<!-- Eruda removed -->');
    cleaned = cleaned.replace(/<script[^>]*?src=["'][^"']*?eruda[^"']*?["'][^>]*?><\/script>/gi, '<!-- Eruda removed -->');
    
    // Disable eruda
    cleaned = cleaned.replace(/eruda\s*\.\s*init\s*\(/gi, '(function(){console.log("🔧 Eruda blocked")})(');
    cleaned = cleaned.replace(/window\s*\.\s*eruda/gi, 'undefined');
    cleaned = cleaned.replace(/\beruda\b/g, 'undefined');
    
    console.log('🔧 Eruda removed successfully');
    return cleaned;
  } catch (e) {
    console.warn('⚠️ Error removing Eruda:', e.message);
    return html;
  }
}

// ========== INJECT TAPMONKEY ==========
function injectTapmonkeyScript(html, tapmonkeyCode) {
  if (!tapmonkeyCode || !html) return html;
  
  try {
    const injectionCode = `
<!-- ===== TAPMONKEY AUTO-INJECTED ===== -->
<script type="text/javascript">
(function() {
  'use strict';
  console.log('🎮 TapMonkey Auto-Inject');
  
  // Block Eruda errors
  const originalOnError = window.onerror;
  window.onerror = function(msg, url, line, col, error) {
    if (msg && (msg.includes('eruda') || msg.includes('Eruda'))) {
      return true;
    }
    if (originalOnError) {
      return originalOnError.apply(this, arguments);
    }
    return false;
  };
  
  // Execute TapMonkey
  try {
    ${tapmonkeyCode}
    console.log('✅ TapMonkey executed');
  } catch(e) {
    console.error('❌ TapMonkey error:', e.message);
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

// ========== PROXY ROUTE (CHÍNH) ==========
app.get('/proxy', async (req, res) => {
  try {
    let targetUrl = req.query.url || 'https://f1686s.com/home/mine';
    
    // ✅ XỬ LÝ URL TỐT HƠN
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch(e) {
      // Nếu decode lỗi, giữ nguyên
    }
    
    // Chuẩn hóa URL
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }
    
    console.log(`🌐 Proxying: ${targetUrl}`);
    
    // Fetch
    const result = await fetchUrl(targetUrl);
    
    // Đọc TapMonkey
    let tapmonkeyCode = '';
    const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
    
    if (fs.existsSync(tapmonkeyPath)) {
      try {
        tapmonkeyCode = fs.readFileSync(tapmonkeyPath, 'utf8');
        console.log(`✅ TapMonkey loaded (${(tapmonkeyCode.length / 1024).toFixed(1)}KB)`);
      } catch (e) {
        console.warn('⚠️ Cannot read TapMonkey:', e.message);
      }
    } else {
      console.warn('⚠️ TapMonkey file missing:', tapmonkeyPath);
    }
    
    // Xử lý HTML
    let modifiedHtml = result.html || '';
    
    // Bước 1: Remove Eruda
    modifiedHtml = removeEruda(modifiedHtml);
    
    // Bước 2: Inject TapMonkey
    if (tapmonkeyCode) {
      modifiedHtml = injectTapmonkeyScript(modifiedHtml, tapmonkeyCode);
      console.log('💉 TapMonkey injected');
    }
    
    // Gửi response
    const contentType = result.contentType || 'text/html; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Proxy-By', 'CloudBrowser-v5');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    
    res.send(modifiedHtml);
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>❌ Proxy Error</title>
        <style>
          body { font-family: sans-serif; padding: 30px; text-align: center; background: #f5f5f5; }
          h1 { color: #f44336; }
          p { color: #666; margin: 10px 0; }
          a { color: #667eea; text-decoration: none; }
          .box { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 30px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>❌ Proxy Error</h1>
          <p>${error.message}</p>
          <p><small>Không thể tải trang web</small></p>
          <a href="/">🔙 Quay về Cloud Browser</a>
        </div>
      </body>
      </html>
    `);
  }
});

// ========== MAIN ROUTE ==========
app.get('/', (req, res) => {
  const defaultUrl = 'https://f1686s.com/home/mine';
  
  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>☁️ Cloud Browser</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; font-family: -apple-system, sans-serif; background: #f5f5f5; }
    body { display: flex; flex-direction: column; }
    .toolbar { background: linear-gradient(135deg, #667eea, #764ba2); padding: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex-shrink: 0; }
    .toolbar-title { color: white; font-weight: 600; font-size: 13px; white-space: nowrap; }
    .btn { background: rgba(255,255,255,0.2); color: white; border: none; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; touch-action: manipulation; }
    .btn:active { transform: scale(0.95); background: rgba(255,255,255,0.3); }
    .btn:disabled { opacity: 0.4; }
    .btn-highlight { background: #4caf50; border: 2px solid #45a049; font-weight: 700; }
    .address-bar { flex: 1; padding: 6px 10px; border: none; border-radius: 5px; font-size: 12px; min-width: 120px; }
    .address-bar:focus { outline: none; }
    .go-btn { background: white; color: #667eea; border: none; padding: 6px 14px; border-radius: 5px; font-weight: 600; cursor: pointer; }
    .browser-container { flex: 1; background: white; overflow: hidden; min-height: 0; }
    .loading-bar { height: 3px; background: linear-gradient(90deg, #667eea, #764ba2); width: 0%; transition: width 0.3s; flex-shrink: 0; }
    .loading-bar.active { animation: loading 2s ease-in-out; }
    @keyframes loading { 0% { width: 0%; } 50% { width: 85%; } 100% { width: 100%; } }
    iframe { width: 100%; height: 100%; border: none; display: block; }
    .info-bar { background: #f9f9f9; padding: 6px 10px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #999; flex-shrink: 0; flex-wrap: wrap; gap: 4px; }
    .badge { background: #4caf50; color: white; padding: 2px 8px; border-radius: 8px; font-weight: 600; font-size: 9px; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #4caf50; display: inline-block; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @media (max-width: 480px) { .toolbar { padding: 6px; gap: 4px; } .btn { padding: 4px 8px; font-size: 11px; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="toolbar-title">☁️</span>
    <button class="btn" id="backBtn">◀</button>
    <button class="btn" id="forwardBtn">▶</button>
    <button class="btn" id="refreshBtn">🔄</button>
    <button class="btn btn-highlight" id="homeBtn">🏠</button>
    <input type="text" class="address-bar" id="addressBar" value="${defaultUrl}">
    <button class="go-btn" id="goBtn">Go</button>
  </div>
  
  <div class="browser-container">
    <div class="loading-bar" id="loadingBar"></div>
    <iframe id="browserFrame" src="/proxy?url=${encodeURIComponent(defaultUrl)}" 
      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals">
    </iframe>
  </div>
  
  <div class="info-bar">
    <span><span class="status-dot"></span> Online</span>
    <span class="badge">🎮 TapMonkey</span>
    <span id="urlDisplay">${defaultUrl}</span>
  </div>

  <script>
    (function() {
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
      
      function navigate(url) {
        if (!url) return;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        try { new URL(url); } catch(e) { return; }
        
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
        loadingBar.classList.add('active');
      }
      
      function updateButtons() {
        backBtn.disabled = historyIndex <= 0;
        forwardBtn.disabled = historyIndex >= history.length - 1;
      }
      
      // Events
      goBtn.addEventListener('click', () => navigate(addressBar.value));
      addressBar.addEventListener('keypress', (e) => { if (e.key === 'Enter') navigate(addressBar.value); });
      homeBtn.addEventListener('click', () => navigate(defaultUrl));
      refreshBtn.addEventListener('click', () => navigate(history[historyIndex] || defaultUrl));
      backBtn.addEventListener('click', () => { if (historyIndex > 0) { historyIndex--; navigate(history[historyIndex]); } });
      forwardBtn.addEventListener('click', () => { if (historyIndex < history.length - 1) { historyIndex++; navigate(history[historyIndex]); } });
      
      browserFrame.addEventListener('load', () => {
        loadingBar.classList.remove('active');
        console.log('✅ Page loaded');
      });
      
      updateButtons();
      console.log('☁️ Cloud Browser v5');
      console.log('🎮 TapMonkey auto-inject via proxy');
    })();
  </script>
</body>
</html>
  `;
  
  res.send(html);
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

// ========== API STATUS ==========
app.get('/api/status', (req, res) => {
  const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
  res.json({
    status: 'online',
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
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
  console.log(`
╔════════════════════════════════════════╗
║  ☁️  CLOUD BROWSER v5 - RENDER        ║
║  🎮 TapMonkey Auto-Inject             ║
║  🔧 Eruda Auto-Blocked                ║
╚════════════════════════════════════════╝
✅ Port: ${PORT}
🎮 TapMonkey: ${fs.existsSync(tapmonkeyPath) ? '✅ READY' : '❌ MISSING'}
⏰ ${new Date().toLocaleString('vi-VN')}
  `);
});

// ========== KEEP ALIVE ==========
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT;
  const client = url.startsWith('https') ? https : http;
  client.get(url + '/api/status', () => {}).on('error', () => {});
}, 600000);

// ========== GRACEFUL SHUTDOWN ==========
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
