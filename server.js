const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const zlib = require('zlib'); // ← THIẾU: Phải require zlib ở đầu file

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

// ========== FETCH HELPER ==========
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000 // ← THIẾU: Timeout 15 giây tránh treo
    };
    
    const request = client.get(url, options, (res) => {
      // Handle redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        console.log(`↪️ Redirect to: ${redirectUrl}`);
        return fetchUrl(redirectUrl).then(resolve).catch(reject);
      }
      
      let data = [];
      
      // Handle gzip/deflate/brotli
      let stream = res;
      const encoding = res.headers['content-encoding'];
      
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }
      
      stream.on('data', (chunk) => data.push(chunk));
      stream.on('end', () => {
        const html = Buffer.concat(data).toString();
        resolve({
          html: html,
          headers: res.headers,
          statusCode: res.statusCode,
          contentType: res.headers['content-type'] || 'text/html'
        });
      });
      stream.on('error', reject);
    });
    
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// ========== REMOVE ERUDA FROM HTML ==========
function removeEruda(html) {
  // Xóa script tags chứa eruda
  html = html.replace(/<script[^>]*?src=["'][^"']*eruda[^"']*["'][^>]*?><\/script>/gi, '<!-- Eruda removed -->');
  html = html.replace(/<script[^>]*?src=["'][^"']*eruda[^"']*["'][^>]*?>.*?<\/script>/gi, '<!-- Eruda removed -->');
  
  // Xóa inline script eruda
  html = html.replace(/<script>[\s\S]*?eruda[\s\S]*?<\/script>/gi, '<!-- Eruda inline removed -->');
  
  // Disable eruda.init()
  html = html.replace(/eruda\s*\.\s*init\s*\(/gi, '(function(){console.log("Eruda blocked")})(');
  
  // Xóa window.eruda references
  html = html.replace(/window\s*\.\s*eruda/gi, 'undefined');
  
  console.log('🔧 Eruda removed from HTML');
  return html;
}

// ========== INJECT TAPMONKEY SCRIPT ==========
function injectTapmonkeyScript(html, tapmonkeyCode) {
  if (!tapmonkeyCode) {
    console.warn('⚠️ No TapMonkey code to inject');
    return html;
  }
  
  const injectionCode = `
<!-- ===== TAPMONKEY AUTO-INJECTED BY CLOUD BROWSER ===== -->
<script type="text/javascript">
(function() {
  'use strict';
  console.log('🎮 TapMonkey Cloud Browser Auto-Inject');
  console.log('⏰ Time: ' + new Date().toLocaleString('vi-VN'));
  
  // Block Eruda errors
  var originalOnError = window.onerror;
  window.onerror = function(msg, url, line, col, error) {
    if (msg && (msg.includes('eruda') || msg.includes('Eruda'))) {
      return true; // Chặn lỗi Eruda
    }
    if (originalOnError) {
      return originalOnError.apply(this, arguments);
    }
    return false;
  };
  
  // Execute TapMonkey code
  try {
    ${tapmonkeyCode}
    console.log('✅ TapMonkey executed successfully');
  } catch(e) {
    console.error('❌ TapMonkey error:', e.message);
  }
})();
</script>
<!-- ===== END TAPMONKEY ===== -->
`;
  
  // Inject before </body> or </html> or end of file
  if (html.includes('</body>')) {
    return html.replace('</body>', injectionCode + '\n</body>');
  } else if (html.includes('</html>')) {
    return html.replace('</html>', injectionCode + '\n</html>');
  } else {
    return html + '\n' + injectionCode;
  }
}

// ========== PROXY ROUTE ==========
app.get('/proxy', async (req, res) => {
  try {
    let targetUrl = req.query.url;
    
    if (!targetUrl) {
      targetUrl = 'https://f1686s.com/home/mine';
    }
    
    // Decode URL if needed
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch(e) {}
    
    // Add https if missing
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }
    
    console.log(`🌐 Proxying: ${targetUrl}`);
    
    // Fetch target URL
    const result = await fetchUrl(targetUrl);
    
    // Read TapMonkey script
    let tapmonkeyCode = '';
    const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
    
    if (fs.existsSync(tapmonkeyPath)) {
      tapmonkeyCode = fs.readFileSync(tapmonkeyPath, 'utf8');
      console.log('✅ TapMonkey script loaded (' + (tapmonkeyCode.length / 1024).toFixed(1) + 'KB)');
    } else {
      console.warn('⚠️ TapMonkey script not found, serving without injection');
    }
    
    // Process HTML
    let modifiedHtml = result.html;
    
    // Step 1: Remove Eruda
    modifiedHtml = removeEruda(modifiedHtml);
    
    // Step 2: Inject TapMonkey
    if (tapmonkeyCode) {
      modifiedHtml = injectTapmonkeyScript(modifiedHtml, tapmonkeyCode);
      console.log('💉 TapMonkey injected into HTML');
    }
    
    // Send response
    res.set('Content-Type', result.contentType || 'text/html; charset=utf-8');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('X-Proxy-By', 'CloudBrowser-v4');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
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
          body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
          h1 { color: #f44336; }
          p { color: #666; margin: 10px 0; }
          a { color: #667eea; }
        </style>
      </head>
      <body>
        <h1>❌ Proxy Error</h1>
        <p>${error.message}</p>
        <p><small>Có thể trang web đã chặn proxy hoặc không phản hồi</small></p>
        <a href="/">🔙 Quay về Cloud Browser</a>
      </body>
      </html>
    `);
  }
});

// ========== MAIN ROUTE - CLOUD BROWSER ==========
app.get('/', (req, res) => {
  try {
    const defaultUrl = 'https://f1686s.com/home/mine';

    const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
      <meta http-equiv="X-UA-Compatible" content="ie=edge">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <meta name="theme-color" content="#667eea">
      <meta name="format-detection" content="telephone=no">
      <title>☁️ Cloud Browser - Auto TapMonkey</title>
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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
          display: flex;
          flex-direction: column;
          touch-action: manipulation;
        }

        .status-bar {
          height: env(safe-area-inset-top, 0px);
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          flex-shrink: 0;
        }

        .toolbar {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 12px;
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
          flex-wrap: wrap;
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
        }

        .btn:active {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(0.95);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-highlight {
          background: #4caf50;
          border: 2px solid #45a049;
          box-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
          font-weight: 700;
          animation: glow 2s ease-in-out infinite;
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 10px rgba(76, 175, 80, 0.3); }
          50% { box-shadow: 0 0 20px rgba(76, 175, 80, 0.6); }
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

        .info-bar {
          background: #f9f9f9;
          padding: 8px 12px;
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

        .tapmonkey-badge {
          background: #4caf50;
          color: white;
          padding: 4px 10px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 10px;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @media (max-width: 480px) {
          .toolbar {
            min-height: auto;
            padding: 8px;
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
          <button class="btn btn-highlight" id="homeBtn" title="Home (Auto TapMonkey)">🏠 🎮</button>
        </div>
        <div class="address-bar-container">
          <input 
            type="text" 
            class="address-bar" 
            id="addressBar" 
            placeholder="URL"
            value="${defaultUrl}"
            autocomplete="off"
          >
          <button class="go-btn" id="goBtn">Go</button>
        </div>
      </div>

      <div class="browser-container">
        <div class="loading-bar" id="loadingBar"></div>
        <div class="browser-frame-container" id="browserContent">
          <iframe 
            id="browserFrame" 
            src="/proxy?url=${encodeURIComponent(defaultUrl)}"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals allow-presentation"
            allow="accelerometer; camera; gyroscope; magnetometer; microphone; payment; usb; geolocation"
          ></iframe>
        </div>
      </div>

      <div class="info-bar">
        <div class="status-text">
          <div class="status-dot"></div>
          <span>✅ Online</span>
        </div>
        <span class="tapmonkey-badge">🎮 TapMonkey Auto-Inject</span>
        <span class="url-display" id="urlDisplay">${defaultUrl}</span>
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

        const defaultUrl = '${defaultUrl}';
        let urlHistory = [defaultUrl];
        let historyIndex = 0;

        // Back Button
        backBtn.addEventListener('click', () => {
          if (historyIndex > 0) {
            historyIndex--;
            const url = urlHistory[historyIndex];
            navigateToProxyUrl(url);
            updateButtons();
          }
        });

        // Forward Button
        forwardBtn.addEventListener('click', () => {
          if (historyIndex < urlHistory.length - 1) {
            historyIndex++;
            const url = urlHistory[historyIndex];
            navigateToProxyUrl(url);
            updateButtons();
          }
        });

        // Refresh Button
        refreshBtn.addEventListener('click', () => {
          const currentUrl = urlHistory[historyIndex] || defaultUrl;
          navigateToProxyUrl(currentUrl);
        });

        // Home Button
        homeBtn.addEventListener('click', () => {
          navigateToProxyUrl(defaultUrl);
        });

        // Go Button
        goBtn.addEventListener('click', () => {
          navigateFromAddressBar();
        });

        // Enter Key
        addressBar.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            navigateFromAddressBar();
          }
        });

        // Focus
        addressBar.addEventListener('focus', () => {
          addressBar.select();
        });

        // Iframe load handler
        browserFrame.addEventListener('load', () => {
          loadingBar.classList.remove('active');
          console.log('✅ Page loaded with TapMonkey auto-injected');
        });

        browserFrame.addEventListener('error', () => {
          console.warn('⚠️ Iframe load error');
        });

        function navigateFromAddressBar() {
          let url = addressBar.value.trim();
          if (!url) return;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          navigateToProxyUrl(url);
        }

        function navigateToProxyUrl(url) {
          try {
            new URL(url);
            const proxyUrl = '/proxy?url=' + encodeURIComponent(url);
            
            browserFrame.src = proxyUrl;
            addressBar.value = url;
            urlDisplay.textContent = url;

            if (urlHistory[historyIndex] !== url) {
              urlHistory = urlHistory.slice(0, historyIndex + 1);
              urlHistory.push(url);
              historyIndex++;
            }

            updateButtons();
            showLoading();
            
            console.log('🌐 Navigated: ' + url);
            console.log('🎮 TapMonkey will auto-inject');
          } catch (e) {
            console.error('Invalid URL:', e.message);
          }
        }

        function updateButtons() {
          backBtn.disabled = historyIndex <= 0;
          forwardBtn.disabled = historyIndex >= urlHistory.length - 1;
        }

        function showLoading() {
          loadingBar.classList.add('active');
        }

        // Block Eruda errors in parent window too
        window.addEventListener('error', function(e) {
          if (e.message && (e.message.includes('eruda') || e.message.includes('Eruda'))) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }, true);

        updateButtons();

        console.log('════════════════════════════════════');
        console.log('☁️ Cloud Browser v4 - Auto TapMonkey');
        console.log('✅ Server ready');
        console.log('🎮 TapMonkey: Auto-inject via Proxy');
        console.log('📦 Script tự động chạy, không cần extension');
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
      return res.status(404).json({ error: `File not found: ${filename}` });
    }
    
    console.log(`✅ Serving: ${filename}`);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(filePath);
  } catch (error) {
    console.error('❌ Error serving file:', error);
    res.status(500).json({ error: 'Error: ' + error.message });
  }
});

// ========== API STATUS ==========
app.get('/api/status', (req, res) => {
  const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
  res.json({
    status: 'running',
    server: 'Cloud Browser v4 - Auto TapMonkey',
    tapmonkey: fs.existsSync(tapmonkeyPath) ? 'ready' : 'missing',
    injection: 'proxy-based auto-inject',
    eruda: 'blocked',
    timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  });
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
  const tapmonkeyReady = fs.existsSync(tapmonkeyPath);
  
  console.log('\n');
  console.log('╔════════════════════════════════════════╗');
  console.log('║  ☁️  CLOUD BROWSER v4 - RENDER        ║');
  console.log('║  🎮 TapMonkey AUTO-INJECT (Proxy)    ║');
  console.log('║  🔧 Eruda Auto-Blocked               ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Server started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 URL: https://f1686s.com/home/mine`);
  console.log(`💉 Injection: Proxy-based (auto)`);
  console.log(`🔧 Eruda: Auto-blocked`);
  console.log(`📦 TapMonkey: ${tapmonkeyReady ? '✅ READY' : '❌ MISSING - Add file to public/tapmonkey/'}`);
  console.log(`⏰ Time: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  console.log('');
  
  if (!tapmonkeyReady) {
    console.warn('⚠️  TAPMONKEY FILE NOT FOUND!');
    console.warn('⚠️  Create: public/tapmonkey/f1686s_naptien.js');
    console.log('');
  }
});

// ========== GRACEFUL SHUTDOWN ==========
process.on('SIGTERM', () => {
  console.log('\n✅ SIGTERM received - shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n✅ SIGINT received - shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

// ========== UNCAUGHT ERRORS ==========
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// ========== KEEP ALIVE ==========
setInterval(() => {
  const appUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const client = appUrl.startsWith('https') ? https : http;
  client.get(appUrl + '/api/status', (res) => {
    console.log('💓 Keep-alive ping sent');
  }).on('error', (err) => {
    console.log('⚠️ Keep-alive ping failed: ' + err.message);
  });
}, 600000); // 10 minutes
