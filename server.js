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
  TIMEOUT: 25000,
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
        'Upgrade-Insecure-Requests': '1'
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

// ========== INJECT TAPMONKEY EXTENSION ==========
function injectTapmonkey(html, tapmonkeyCode) {
  if (!tapmonkeyCode) return html;
  
  try {
    const injectionCode = `
<!-- ===== TAPMONKEY EXTENSION ===== -->
<script type="text/javascript">
(function() {
  'use strict';
  console.log('🎮 Cloud Chrome - TapMonkey Extension v2.0');
  console.log('⏰ Loaded: ' + new Date().toLocaleString('vi-VN'));
  
  // Block Eruda errors
  window.addEventListener('error', function(e) {
    if (e.message && (e.message.includes('eruda') || e.message.includes('Eruda'))) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  }, true);
  
  // Intercept fetch and XHR to handle dynamic content
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    return originalFetch.apply(this, args).then(response => {
      // Check if response is HTML
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        return response.text().then(html => {
          // Process HTML if needed
          return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        });
      }
      return response;
    });
  };
  
  // TapMonkey Core
  const TapMonkey = {
    version: '2.0.0',
    scripts: [],
    running: false,
    
    // Register a script
    register: function(name, code) {
      this.scripts.push({ name, code });
      console.log('📦 Script registered:', name);
    },
    
    // Execute all scripts
    run: function() {
      if (this.running) return;
      this.running = true;
      
      this.scripts.forEach(script => {
        try {
          // Execute in isolated scope
          const fn = new Function(script.code);
          fn.call(window);
          console.log('✅ Script executed:', script.name);
        } catch(e) {
          console.error('❌ Script error:', script.name, e.message);
        }
      });
    },
    
    // Auto-run when DOM is ready
    init: function() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.run());
      } else {
        this.run();
      }
    }
  };
  
  // Expose to window
  window.TapMonkey = TapMonkey;
  
  // ===== MAIN SCRIPT =====
  try {
    ${tapmonkeyCode}
  } catch(e) {
    console.error('❌ TapMonkey load error:', e.message);
  }
  
  // Initialize
  TapMonkey.init();
  
  console.log('✅ TapMonkey Extension ready');
  console.log('📊 Scripts loaded:', TapMonkey.scripts.length);
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
    const tapmonkeyPath = path.join(__dirname, 'public', 'tapmonkey', 'f1686s_naptien.js');
    
    if (fs.existsSync(tapmonkeyPath)) {
      try {
        tapmonkeyCode = fs.readFileSync(tapmonkeyPath, 'utf8');
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
    if (tapmonkeyCode) {
      modifiedHtml = injectTapmonkey(modifiedHtml, tapmonkeyCode);
      console.log('💉 TapMonkey injected as extension');
    }
    
    // Remove X-Frame-Options to allow iframe
    delete result.headers['x-frame-options'];
    
    // Send response
    res.setHeader('Content-Type', result.contentType || 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Proxy-By', 'CloudChrome-v1');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(modifiedHtml);
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    res.status(500).json({ 
      error: error.message, 
      url: req.query.url,
      timestamp: new Date().toISOString()
    });
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

// ========== MAIN PAGE - CLOUD CHROME ==========
app.get('/', (req, res) => {
  const defaultUrl = CONFIG.DEFAULT_URL;
  
  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#202124">
  <title>☁️ Cloud Chrome - TapMonkey</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #202124;
      --surface: #292a2d;
      --surface-light: #3c4043;
      --text: #e8eaed;
      --text-muted: #9aa0a6;
      --primary: #1a73e8;
      --primary-hover: #1557b0;
      --border: #3c4043;
    }
    
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    
    body { display: flex; flex-direction: column; }
    
    /* ===== CHROME TOOLBAR ===== */
    .chrome-toolbar {
      background: var(--surface);
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      min-height: 48px;
    }
    
    .chrome-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      min-width: 100px;
      overflow-x: auto;
      padding: 2px 0;
    }
    
    .chrome-tabs::-webkit-scrollbar {
      height: 2px;
    }
    
    .chrome-tabs::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 2px;
    }
    
    .tab {
      background: var(--bg);
      padding: 6px 14px;
      border-radius: 8px 8px 0 0;
      font-size: 12px;
      color: var(--text-muted);
      cursor: pointer;
      white-space: nowrap;
      border: 1px solid var(--border);
      border-bottom: none;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
      min-width: 60px;
      max-width: 160px;
    }
    
    .tab.active {
      background: var(--surface-light);
      color: var(--text);
      border-color: var(--primary);
    }
    
    .tab:hover {
      background: var(--surface-light);
      color: var(--text);
    }
    
    .tab-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      padding: 0 2px;
      border-radius: 4px;
      line-height: 1;
    }
    
    .tab-close:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }
    
    .new-tab-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 4px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    
    .new-tab-btn:hover {
      background: var(--surface-light);
      color: var(--text);
    }
    
    .chrome-nav {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    
    .nav-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 18px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
    }
    
    .nav-btn:hover {
      background: rgba(255,255,255,0.08);
      color: var(--text);
    }
    
    .nav-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    
    .nav-btn:active {
      transform: scale(0.92);
    }
    
    .nav-btn.primary {
      color: var(--primary);
    }
    
    .nav-btn.primary:hover {
      background: rgba(26, 115, 232, 0.2);
    }
    
    .address-bar {
      flex: 1;
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 13px;
      background: var(--bg);
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
      min-width: 120px;
    }
    
    .address-bar:focus {
      border-color: var(--primary);
      background: var(--surface);
    }
    
    .address-bar::placeholder {
      color: var(--text-muted);
    }
    
    /* ===== EXTENSIONS BAR ===== */
    .extensions-bar {
      background: var(--surface);
      padding: 2px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 4px;
      min-height: 28px;
    }
    
    .extension-badge {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .extension-icon {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
    }
    
    .extension-icon.tapmonkey {
      background: rgba(26, 115, 232, 0.2);
      color: var(--primary);
    }
    
    .extension-icon.ready {
      background: rgba(52, 168, 83, 0.2);
      color: #34a853;
    }
    
    .status-text {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #34a853;
      display: inline-block;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    .url-display {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-muted);
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
      background: var(--primary);
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
    @media (max-width: 768px) {
      .chrome-toolbar {
        padding: 6px 8px;
        gap: 4px;
      }
      
      .tab {
        font-size: 11px;
        padding: 4px 10px;
        min-width: 40px;
        max-width: 100px;
      }
      
      .address-bar {
        font-size: 12px;
        padding: 4px 10px;
        min-width: 80px;
      }
      
      .nav-btn {
        font-size: 16px;
        padding: 4px 6px;
        min-width: 28px;
      }
      
      .extensions-bar {
        font-size: 10px;
        padding: 2px 8px;
        min-height: 24px;
      }
      
      .url-display {
        max-width: 120px;
      }
    }
    
    @media (max-width: 480px) {
      .chrome-tabs {
        display: none;
      }
      
      .new-tab-btn {
        display: none;
      }
    }
  </style>
</head>
<body>
  <!-- Chrome Toolbar -->
  <div class="chrome-toolbar">
    <div class="chrome-tabs" id="tabContainer">
      <div class="tab active" data-tab="0">
        <span>📄</span>
        <span class="tab-title">Cloud Chrome</span>
        <button class="tab-close" data-tab="0">✕</button>
      </div>
    </div>
    <button class="new-tab-btn" id="newTabBtn">+</button>
    
    <div class="chrome-nav">
      <button class="nav-btn" id="backBtn" title="Back">◀</button>
      <button class="nav-btn" id="forwardBtn" title="Forward">▶</button>
      <button class="nav-btn" id="refreshBtn" title="Refresh">⟳</button>
      <button class="nav-btn primary" id="homeBtn" title="Home">🏠</button>
    </div>
    
    <input type="text" class="address-bar" id="addressBar" placeholder="Search or enter URL..." value="${defaultUrl}">
  </div>
  
  <!-- Extensions Bar -->
  <div class="extensions-bar">
    <div class="extension-badge">
      <span class="status-dot"></span>
      <span>Online</span>
      <span class="extension-icon tapmonkey">🎮 TapMonkey v2.0</span>
      <span class="extension-icon ready">✅ Ready</span>
    </div>
    <div class="status-text">
      <span class="url-display" id="urlDisplay">${defaultUrl}</span>
    </div>
  </div>
  
  <!-- Browser -->
  <div class="browser-container">
    <div class="loading-bar" id="loadingBar"></div>
    <iframe 
      id="browserFrame" 
      src="/proxy?url=${encodeURIComponent(defaultUrl)}"
      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals allow-downloads allow-storage-access-by-user-activation"
      allow="accelerometer; camera; gyroscope; magnetometer; microphone; payment; usb; geolocation; clipboard-read; clipboard-write"
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
      const newTabBtn = document.getElementById('newTabBtn');
      const tabContainer = document.getElementById('tabContainer');
      
      const defaultUrl = '${defaultUrl}';
      let tabs = [{ id: 0, url: defaultUrl, title: 'Cloud Chrome' }];
      let activeTab = 0;
      let tabCounter = 1;
      
      // History per tab
      let histories = { 0: [defaultUrl] };
      let historyIndexes = { 0: 0 };
      
      // Navigate function
      function navigate(url, tabId = activeTab) {
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
        
        // Update history
        if (!histories[tabId]) histories[tabId] = [];
        if (!historyIndexes[tabId]) historyIndexes[tabId] = 0;
        
        if (histories[tabId][historyIndexes[tabId]] !== url) {
          histories[tabId] = histories[tabId].slice(0, historyIndexes[tabId] + 1);
          histories[tabId].push(url);
          historyIndexes[tabId]++;
        }
        
        // Update tab title
        try {
          const title = new URL(url).hostname;
          const tab = tabContainer.querySelector('.tab[data-tab="' + tabId + '"]');
          if (tab) {
            const titleEl = tab.querySelector('.tab-title');
            if (titleEl) titleEl.textContent = title;
          }
        } catch(e) {}
        
        updateButtons(tabId);
        showLoading();
        console.log('🌐 Navigated to:', url);
      }
      
      function updateButtons(tabId = activeTab) {
        const idx = historyIndexes[tabId] || 0;
        const hist = histories[tabId] || [defaultUrl];
        backBtn.disabled = idx <= 0;
        forwardBtn.disabled = idx >= hist.length - 1;
      }
      
      function showLoading() {
        loadingBar.classList.add('active');
        setTimeout(() => {
          loadingBar.classList.remove('active');
        }, 3000);
      }
      
      // Tab management
      function createTab(url = defaultUrl) {
        const id = tabCounter++;
        const tab = document.createElement('div');
        tab.className = 'tab active';
        tab.dataset.tab = id;
        tab.innerHTML = \`
          <span>📄</span>
          <span class="tab-title">\${new URL(url).hostname || 'New Tab'}</span>
          <button class="tab-close" data-tab="\${id}">✕</button>
        \`;
        tabContainer.appendChild(tab);
        
        tabs.push({ id, url, title: 'New Tab' });
        histories[id] = [url];
        historyIndexes[id] = 0;
        
        // Switch to new tab
        switchTab(id);
        navigate(url, id);
        return id;
      }
      
      function switchTab(id) {
        // Update active class
        document.querySelectorAll('.tab').forEach(el => {
          el.classList.toggle('active', parseInt(el.dataset.tab) === id);
        });
        activeTab = id;
        
        // Load tab content
        const url = histories[id]?.[historyIndexes[id]] || defaultUrl;
        addressBar.value = url;
        urlDisplay.textContent = url;
        navigate(url, id);
        updateButtons(id);
      }
      
      function closeTab(id) {
        if (tabs.length <= 1) return;
        
        const tabEl = tabContainer.querySelector('.tab[data-tab="' + id + '"]');
        if (tabEl) tabEl.remove();
        
        tabs = tabs.filter(t => t.id !== id);
        delete histories[id];
        delete historyIndexes[id];
        
        // Switch to another tab
        if (activeTab === id) {
          const firstTab = tabs[0];
          if (firstTab) switchTab(firstTab.id);
        }
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
        const currentUrl = histories[activeTab]?.[historyIndexes[activeTab]] || defaultUrl;
        navigate(currentUrl);
      });
      
      backBtn.addEventListener('click', () => {
        const idx = historyIndexes[activeTab] || 0;
        if (idx > 0) {
          historyIndexes[activeTab]--;
          const url = histories[activeTab][historyIndexes[activeTab]];
          navigate(url);
        }
      });
      
      forwardBtn.addEventListener('click', () => {
        const idx = historyIndexes[activeTab] || 0;
        const hist = histories[activeTab] || [];
        if (idx < hist.length - 1) {
          historyIndexes[activeTab]++;
          const url = hist[historyIndexes[activeTab]];
          navigate(url);
        }
      });
      
      newTabBtn.addEventListener('click', () => createTab());
      
      // Tab events (delegation)
      tabContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;
        
        const id = parseInt(tabEl.dataset.tab);
        
        if (e.target.classList.contains('tab-close')) {
          e.stopPropagation();
          closeTab(id);
          return;
        }
        
        switchTab(id);
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
      
      // Init
      updateButtons();
      console.log('☁️ Cloud Chrome v1.0');
      console.log('🎮 TapMonkey Extension v2.0');
      console.log('📦 Tự động chạy trên mọi trang');
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
    version: '1.0.0',
    name: 'Cloud Chrome',
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
║  ☁️  CLOUD CHROME v1.0                    ║
║  🎮 TapMonkey Extension v2.0             ║
║  🔧 Eruda Auto-Blocked                   ║
╚════════════════════════════════════════════╝
✅ Port: ${PORT}
🎮 TapMonkey: ${tapmonkeyReady ? '✅ READY' : '❌ MISSING'}
📂 Path: ${tapmonkeyPath}
🌐 Default: ${CONFIG.DEFAULT_URL}
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
