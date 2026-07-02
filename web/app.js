(function () {
  'use strict';

  const SETTINGS_KEY = 'doomchat_settings';
  const RELEASE_SEEN_KEY = 'doomchat_release_seen';
  const RECONNECT_DELAY_MS = 2000;
  const MAX_RECONNECTS = 10;

  const THEMES = {
    matrix:  { bg: '#000000', fg: '#00FF00', system: '#00AA00', error: '#FF0000', highlight: '#00FF00', tripcode: '#00AA00', trivia: '#FFFF66', mention: '#66FFEE' },
    amber:   { bg: '#000000', fg: '#FFB000', system: '#CC8800', error: '#FF4444', highlight: '#FFD700', tripcode: '#FFD700', trivia: '#FF8800', mention: '#FFEE88' },
    cobalt:  { bg: '#000000', fg: '#4488FF', system: '#3366CC', error: '#FF6666', highlight: '#66AAFF', tripcode: '#66AAFF', trivia: '#AA88FF', mention: '#88FFFF' },
    snow:    { bg: '#000000', fg: '#FFFFFF', system: '#AAAAAA', error: '#FF4444', highlight: '#FFFFFF', tripcode: '#AAAAAA', trivia: '#88CCFF', mention: '#AAEEFF' },
    vintage: { bg: '#2B1B0E', fg: '#33FF33', system: '#228B22', error: '#FF6666', highlight: '#55FF55', tripcode: '#228B22', trivia: '#FFCC33', mention: '#88FFAA' },
    dracula: { bg: '#282a36', fg: '#f8f8f2', system: '#bd93f9', error: '#ff5555', highlight: '#50fa7b', tripcode: '#bd93f9', trivia: '#ffb86c', mention: '#8be9fd' },
    spawn:   { bg: '#0a0a0a', fg: '#39FF14', system: '#8B0000', error: '#FF2200', highlight: '#C0C0C0', tripcode: '#C0C0C0', trivia: '#FFD700', mention: '#7FFF00' },
    merica:  { bg: '#002868', fg: '#FFFFFF', system: '#BF0A30', error: '#FF6666', highlight: '#BF0A30', tripcode: '#BF0A30', trivia: '#FFD700', mention: '#87CEEB' }
  };

  const FONTS = {
    'Courier New': '"Courier New", Courier, monospace',
    'IBM Plex Mono': '"IBM Plex Mono", monospace',
    'Fira Code': '"Fira Code", monospace',
    'JetBrains Mono': '"JetBrains Mono", monospace',
    'Lucida Console': '"Lucida Console", "Lucida Sans Typewriter", monospace',
    'Times New Roman': '"Times New Roman", Times, "Liberation Serif", serif',
    'VT323': '"VT323", monospace',
    'Press Start': '"Press Start 2P", monospace'
  };

  const BANNER = [
    ' ██████╗  ██████╗  ██████╗ ███╗   ███╗ ██████╗██╗  ██╗ █████╗ ████████╗    ██╗  ██╗',
    ' ██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║██╔════╝██║  ██║██╔══██╗╚══██╔══╝    ██║  ██║',
    ' ██║  ██║██║   ██║██║   ██║██╔████╔██║██║     ███████║███████║   ██║       ██║  ██║',
    ' ██║  ██║██║   ██║██║   ██║██║╚██╔╝██║██║     ██╔══██║██╔══██║   ██║       ██║  ██║',
    ' ██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║╚██████╗██║  ██║██║  ██║   ██║       ██║  ██║',
    ' ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝        ╚═╝  ╚═╝',
    ''
  ];

  function randomUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function hasSubtleCrypto() {
    return typeof crypto !== 'undefined' && !!crypto.subtle;
  }

  // Pure-JS SHA-256 for HTTP (crypto.subtle needs HTTPS or localhost).
  function sha256Fallback(bytes) {
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    function ch(x, y, z) { return (x & y) ^ (~x & z); }
    function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
    function sigma0(x) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
    function sigma1(x) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
    function gamma0(x) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
    function gamma1(x) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    const H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);

    const padded = new Uint8Array(((bytes.length + 9 + 63) & ~63));
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, bytes.length * 8, false);

    const W = new Uint32Array(64);
    for (let i = 0; i < padded.length; i += 64) {
      for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
      for (let t = 16; t < 64; t++) {
        W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const t1 = (h + sigma1(e) + ch(e, f, g) + K[t] + W[t]) >>> 0;
        const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    let hex = '';
    for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0');
    return hex;
  }

  async function sha256Hex(data) {
    if (hasSubtleCrypto()) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Fallback(data);
  }

  let settings = loadSettings();
  let ws = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let currentRoom = '#lobby';
  let fullNick = '';
  const joinedRooms = new Set(['#lobby']);
  const roomKeys = new Map();
  const roomMemberNicks = new Map();
  let numberedPublicRooms = [];
  const NORMAL_FONT_SIZE = 14;
  const BRIMLEY_FONT_SIZE = 24;

  const statusEl = document.getElementById('status');
  const roomLabelEl = document.getElementById('room-label');
  const inputBarEl = document.querySelector('.input-bar');
  const cmdFormEl = document.getElementById('cmd-form');
  const inputEl = document.getElementById('cmd-input');
  const sendBtnEl = document.getElementById('cmd-send');
  const bannerEl = document.getElementById('chat-banner');
  const bannerWrapEl = document.querySelector('.chat-banner-wrap');
  const toggleChatBtn = document.getElementById('toggle-chat');
  const toggleSystemBtn = document.getElementById('toggle-system');
  bannerEl.textContent = BANNER.join('\n');

  let mobilePane = 'chat';
  const FitAddonCtor = (typeof FitAddon !== 'undefined' && FitAddon.FitAddon)
    ? FitAddon.FitAddon
    : (typeof FitAddon !== 'undefined' ? FitAddon : null);

  const chatTerm = new Terminal({
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    scrollback: 5000,
    fontSize: settings.brimley ? BRIMLEY_FONT_SIZE : NORMAL_FONT_SIZE,
    fontWeight: settings.brimley ? 'bold' : 'normal',
    theme: termTheme()
  });
  const systemTerm = new Terminal({
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    scrollback: 3000,
    fontSize: settings.brimley ? BRIMLEY_FONT_SIZE : NORMAL_FONT_SIZE,
    fontWeight: settings.brimley ? 'bold' : 'normal',
    theme: termTheme()
  });
  const chatFit = FitAddonCtor ? new FitAddonCtor() : null;
  const systemFit = FitAddonCtor ? new FitAddonCtor() : null;
  if (chatFit) chatTerm.loadAddon(chatFit);
  if (systemFit) systemTerm.loadAddon(systemFit);
  chatTerm.open(document.getElementById('chat-terminal'));
  systemTerm.open(document.getElementById('system-terminal'));

  window.__doomChatSetPane = setMobilePane;
  if (window.__doomPendingPane) {
    setMobilePane(window.__doomPendingPane);
    window.__doomPendingPane = null;
  }

  applyTheme(settings.theme);
  applyFont(settings.font);
  applyBrimley(settings.brimley);
  updateMobileClass();
  syncMobilePaneUI();
  fitTerminals();
  fitBanner();
  measureInputBar();
  initMobileSwipe();

  if (inputBarEl && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      measureInputBar();
      fitTerminals();
    }).observe(inputBarEl);
  }

  window.addEventListener('resize', () => {
    updateMobileClass();
    syncMobilePaneUI();
    measureInputBar();
    fitTerminals();
    fitBanner();
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      updateMobileClass();
      syncMobilePaneUI();
      measureInputBar();
      fitTerminals();
      fitBanner();
    }, 150);
  });
  if (cmdFormEl) {
    cmdFormEl.addEventListener('submit', (e) => {
      e.preventDefault();
      submitLine();
    });
  }
  inputEl.addEventListener('input', syncSendButton);
  syncSendButton();

  connect();

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return {
          theme: s.theme || 'matrix',
          font: s.font || 'Courier New',
          last_nick: s.last_nick || '',
          session_id: s.session_id || randomUUID(),
          brimley: !!s.brimley,
          sound: s.sound !== undefined ? !!s.sound : true
        };
      }
    } catch (_) {}
    return {
      theme: 'matrix',
      font: 'Courier New',
      last_nick: '',
      session_id: randomUUID(),
      brimley: false,
      sound: true
    };
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function termTheme() {
    const t = THEMES[settings.theme] || THEMES.matrix;
    return {
      background: t.bg,
      foreground: t.fg,
      cursor: t.fg
    };
  }

  function applyTheme(name) {
    if (!THEMES[name]) name = 'matrix';
    settings.theme = name;
    const t = THEMES[name];
    document.documentElement.style.setProperty('--bg', t.bg);
    document.documentElement.style.setProperty('--fg', t.fg);
    document.documentElement.style.setProperty('--system', t.system);
    document.documentElement.style.setProperty('--error', t.error);
    document.documentElement.style.setProperty('--highlight', t.highlight);
    document.documentElement.style.setProperty('--tripcode', t.tripcode);
    document.documentElement.style.setProperty('--trivia', t.trivia);
    document.documentElement.style.setProperty('--mention', t.mention || t.highlight);
    chatTerm.options.theme = termTheme();
    systemTerm.options.theme = termTheme();
    saveSettings();
  }

  function applyFont(name) {
    if (!FONTS[name]) name = 'Courier New';
    settings.font = name;
    document.documentElement.style.setProperty('--font', FONTS[name]);
    saveSettings();
    relayoutBothTerminals();
  }

  function syncTerminalFonts() {
    const family = FONTS[settings.font] || FONTS['Courier New'];
    const size = settings.brimley ? BRIMLEY_FONT_SIZE : NORMAL_FONT_SIZE;
    const weight = settings.brimley ? 'bold' : 'normal';
    [chatTerm, systemTerm].forEach((term) => {
      term.options.fontFamily = family;
      term.options.fontSize = size;
      term.options.fontWeight = weight;
      term.options.fontWeightBold = 'bold';
      try {
        const rs = term._core && term._core._renderService;
        if (rs && typeof rs.clear === 'function') {
          rs.clear();
        }
      } catch (_) {}
    });
  }

  function refreshTerminalPaint(term) {
    try {
      if (term._core && term._core.viewport) {
        term._core.viewport.syncScrollArea();
      }
      if (term.rows > 0) {
        term.refresh(0, term.rows - 1);
      }
    } catch (_) {}
  }

  function relayoutBothTerminals() {
    syncTerminalFonts();
    const family = FONTS[settings.font] || FONTS['Courier New'];
    const size = settings.brimley ? BRIMLEY_FONT_SIZE : NORMAL_FONT_SIZE;
    const weight = settings.brimley ? 'bold' : 'normal';
    const plainFamily = family.replace(/"/g, '');
    const loadFonts = (document.fonts && document.fonts.load)
      ? Promise.all([
          document.fonts.load(`${size}px ${plainFamily}`),
          document.fonts.load(`${weight} ${size}px ${plainFamily}`)
        ]).catch(() => {})
      : Promise.resolve();
    loadFonts.finally(() => scheduleFitTerminals(true));
  }

  function showFontPreviewInChat(fontName) {
    const t = THEMES[settings.theme] || THEMES.matrix;
    chatTerm.writeln('\x1b[1m' + ansiFg(t.highlight) + '[font] ' + fontName + ' — The quick brown fox jumps over 0123456789\x1b[0m');
    chatTerm.writeln('');
    chatTerm.scrollToBottom();
  }

  function applyBrimley(on) {
    settings.brimley = !!on;
    document.documentElement.classList.toggle('brimley-mode', settings.brimley);
    saveSettings();
    relayoutBothTerminals();
  }

  function scheduleFitTerminals(repaint) {
    measureInputBar();
    requestAnimationFrame(() => {
      fitTerminals();
      fitBanner();
      if (repaint) {
        refreshTerminalPaint(chatTerm);
        refreshTerminalPaint(systemTerm);
      }
      requestAnimationFrame(() => {
        fitTerminals();
        if (repaint) {
          refreshTerminalPaint(chatTerm);
          refreshTerminalPaint(systemTerm);
        }
      });
    });
  }

  function toggleBrimley() {
    applyBrimley(!settings.brimley);
    if (settings.brimley) {
      writelnSystem('VISUAL AIDS MODE on — chat and system text enlarged. /brimley to toggle off.');
      const t = THEMES[settings.theme] || THEMES.matrix;
      chatTerm.writeln('\x1b[1m' + ansiFg(t.highlight) + '[VISUAL AIDS] Chat + system panes enlarged.\x1b[0m');
      chatTerm.writeln('');
      chatTerm.scrollToBottom();
    } else {
      writelnSystem('VISUAL AIDS MODE off — chat and system text restored.');
    }
  }

  function measureInputBar() {
    if (!inputBarEl) return;
    const h = Math.ceil(inputBarEl.getBoundingClientRect().height);
    if (h > 0) {
      document.documentElement.style.setProperty('--input-bar-height', h + 'px');
    }
  }

  function updateRoomLabel() {
    if (roomLabelEl) roomLabelEl.textContent = currentRoom;
  }

  function setActiveRoom(room) {
    currentRoom = room;
    updateRoomLabel();
  }

  updateRoomLabel();

  function fitTerminals() {
    try {
      if (chatFit) chatFit.fit();
      if (systemFit) systemFit.fit();
    } catch (_) {}
  }

  function termHostWidth(term) {
    const host = term.element && term.element.parentElement;
    return host ? host.clientWidth : 0;
  }

  function estimateColsFromHost(term) {
    const width = termHostWidth(term);
    if (width <= 0) return 0;
    const charW = measureCharWidth(term);
    return Math.floor(width / charW);
  }

  function detectMobile() {
    return window.innerWidth <= 768 ||
      ((('ontouchstart' in window) || navigator.maxTouchPoints > 0) && window.innerWidth <= 1024);
  }

  function updateMobileClass() {
    document.documentElement.classList.toggle('is-mobile', detectMobile());
  }

  function isMobileLayout() {
    return document.documentElement.classList.contains('is-mobile');
  }

  function initMobileSwipe() {
    const shell = document.getElementById('app-shell');
    let startX = 0;
    let startY = 0;
    shell.addEventListener('touchstart', (e) => {
      if (!isMobileLayout() || !e.touches.length) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    shell.addEventListener('touchend', (e) => {
      if (!isMobileLayout() || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0 && mobilePane === 'chat') setMobilePane('system');
      else if (dx > 0 && mobilePane === 'system') setMobilePane('chat');
    }, { passive: true });
  }

  function fitBanner() {
    if (!bannerWrapEl || !bannerEl) return;
    bannerEl.style.transform = 'none';
    bannerWrapEl.style.height = '';
    if (!isMobileLayout()) {
      return;
    }
    const available = bannerWrapEl.clientWidth;
    const natural = bannerEl.scrollWidth;
    if (natural <= 0 || available <= 0) return;
    const scale = Math.min(1, available / natural);
    bannerEl.style.transform = 'scale(' + scale + ')';
    bannerWrapEl.style.height = (bannerEl.offsetHeight * scale) + 'px';
  }

  function setMobilePane(pane) {
    mobilePane = pane;
    syncMobilePaneUI();
    requestAnimationFrame(() => {
      fitTerminals();
      fitBanner();
      if (pane === 'chat') chatTerm.scrollToBottom();
      else systemTerm.scrollToBottom();
    });
  }

  function syncMobilePaneUI() {
    document.documentElement.classList.toggle('show-system', isMobileLayout() && mobilePane === 'system');
    toggleChatBtn.classList.toggle('active', mobilePane === 'chat');
    toggleSystemBtn.classList.toggle('active', mobilePane === 'system');
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function wsURL() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    setStatus('connecting...');
    ws = new WebSocket(wsURL());

    ws.onopen = () => {
      reconnectAttempts = 0;
      chatTerm.clear();
      currentRoom = '#lobby';
      joinedRooms.clear();
      joinedRooms.add('#lobby');
      updateRoomLabel();
      updateMobileClass();
      syncMobilePaneUI();
      measureInputBar();
      fitTerminals();
      fitBanner();
      chatTerm.scrollToBottom();
      setStatus('connected');
      writelnSystem('Connected.');
      writelnSystem('One shared #lobby for everyone — phone and desktop see the same live chat. Theme/font are per-device.');
      send({
        type: 'hello',
        session_id: settings.session_id,
        nick: fullNick || undefined,
        theme: settings.theme,
        font: settings.font
      });
      setTimeout(() => {
        measureInputBar();
        fitTerminals();
        fitBanner();
      }, 300);
    };

    ws.onmessage = (ev) => {
      try {
        handleMessage(JSON.parse(ev.data));
      } catch (_) {
        writelnSystem('Invalid server message.', true);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      writelnSystem('Connection lost. Reconnecting...');
      scheduleReconnect();
    };

    ws.onerror = () => {
      writelnSystem('Connection error.', true);
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    if (reconnectAttempts >= MAX_RECONNECTS) {
      writelnSystem('Max reconnect attempts reached. Refresh the page.', true);
      return;
    }
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  async function handleMessage(msg) {
    switch (msg.type) {
      case 'chat':
        await renderChatLine(msg);
        break;
      case 'room_users':
        if (msg.room && msg.nicks) {
          roomMemberNicks.set(msg.room, new Set(msg.nicks));
        }
        break;
      case 'history':
        await renderHistory(msg);
        break;
      case 'system':
        trackRoomMembersFromSystem(msg.text, msg.room);
        writelnSystem(msg.text);
        break;
      case 'error':
        writelnSystem(msg.text, true);
        break;
      case 'release':
        handleRelease(msg);
        break;
      case 'session_restored':
        if (msg.nick) fullNick = msg.nick;
        if (msg.rooms && msg.rooms.length) {
          joinedRooms.clear();
          msg.rooms.forEach((r) => joinedRooms.add(r));
        }
        joinedRooms.add('#lobby');
        setActiveRoom('#lobby');
        writelnSystem('Session restored for ' + (msg.nick || 'guest') + ' — back in #lobby');
        break;
      case 'session_new':
        writelnSystem('New session. Use /nick YourName#secret');
        if (settings.last_nick) {
          writelnSystem('Hint: last nick was "' + settings.last_nick + '" (re-enter tripcode secret).');
        }
        break;
      case 'room_list':
        numberedPublicRooms = msg.room_list || [];
        if (numberedPublicRooms.length === 0) {
          writelnSystem('No public rooms.');
        } else {
          const lines = numberedPublicRooms.map((r, i) =>
            (i + 1) + '. ' + r.name + ' (' + r.count + ')' + (r.name === currentRoom ? ' *' : '')
          );
          writelnSystem('Public rooms (use /rooms <#> to switch):\n' + lines.join('\n'));
        }
        break;
      case 'trivia_question':
        maybePlayNotifyBlip(msg.room);
        writeTriviaEntry('[Trivia] ' + msg.question);
        break;
      case 'trivia_answer':
        maybePlayNotifyBlip(msg.room);
        if (msg.winner) {
          writeTriviaEntry('[Trivia] ' + formatNickColored(msg.winner, false) + ' got it! Answer: ' + msg.answer);
        } else {
          writeTriviaEntry('[Trivia] Time\'s up! Answer: ' + msg.answer);
        }
        break;
      case 'trivia_scores':
        maybePlayNotifyBlip(msg.room);
        writeTriviaEntry('[Trivia] Scores: ' + formatScores(msg.scores));
        break;
      default:
        break;
    }
  }

  function handleRelease(msg) {
    if (msg.version && localStorage.getItem(RELEASE_SEEN_KEY) === msg.version) {
      return;
    }
    writelnSystem('[server] DoomChat II updated (v' + (msg.version || '?') + '):');
    if (msg.text) {
      msg.text.split('\n').forEach(line => {
        if (line.trim()) writelnSystem('  • ' + line.trim());
      });
    }
    writelnSystem('Reload the page (hard refresh) to get the latest client updates.');
    if (msg.version) {
      localStorage.setItem(RELEASE_SEEN_KEY, msg.version);
    }
    if (isMobileLayout()) setMobilePane('system');
  }

  async function renderHistory(msg) {
    if (!msg.history || !msg.history.length) return;
    const room = msg.room || currentRoom;
    const members = roomMemberNicks.get(room) || new Set();
    for (const entry of msg.history) {
      if (entry.nick && entry.nick !== 'ascii' && entry.nick !== 'trivia' && entry.nick !== 'roll' && entry.nick !== 'emote' && entry.nick !== 'server') {
        members.add(entry.nick);
      }
      await renderChatLine({
        nick: entry.nick,
        text: entry.text,
        timestamp: entry.timestamp,
        room: room,
        enc: entry.enc,
        history: true
      });
    }
    roomMemberNicks.set(room, members);
    chatTerm.scrollToBottom();
    requestAnimationFrame(() => {
      fitTerminals();
      fitBanner();
    });
  }

  async function renderChatLine(msg) {
    let text = msg.text;
    const room = msg.room || currentRoom;
    if (isAsciiNick(msg.nick)) {
      renderAsciiFromId(String(text || '').trim().toLowerCase(), formatTimestamp(msg.timestamp));
      return;
    }
    if (isRollNick(msg.nick)) {
      writeRollEntry(text, formatTimestamp(msg.timestamp));
      return;
    }
    if (isEmoteNick(msg.nick)) {
      if (isMentionedByOther(msg, text)) {
        maybePlayNotifyBlip(room);
      }
      writeEmoteEntry(text, formatTimestamp(msg.timestamp));
      return;
    }
    if (isTriviaNick(msg.nick)) {
      if (!msg.history) maybePlayNotifyBlip(room);
      writeTriviaEntry(text, formatTimestamp(msg.timestamp));
      return;
    }
    if (isServerNick(msg.nick)) {
      if (!msg.history) maybePlayNotifyBlip(room);
      writeTriviaEntry(text, formatTimestamp(msg.timestamp));
      return;
    }
    if (msg.enc || isEncryptedRoom(room)) {
      try {
        const key = roomKeys.get(room);
        if (key) text = await decryptText(text, key);
        else text = '[encrypted]';
      } catch (_) {
        writelnSystem('Failed to decrypt message in ' + room, true);
        return;
      }
    }
    if (msg.nick) {
      const members = roomMemberNicks.get(room) || new Set();
      members.add(msg.nick);
      roomMemberNicks.set(room, members);
    }
    if (isMentionedByOther(msg, text)) {
      maybePlayNotifyBlip(room);
    }
    const ts = formatTimestamp(msg.timestamp);
    writeChatEntry(msg.nick, ts, text, room);
  }

  function writeChatEntry(nick, timestamp, text, room) {
    let nickLine = formatNickColored(nick, true);
    if (room && room !== currentRoom) {
      nickLine = nickLine + ' \x1b[2m(' + room + ')\x1b[0m';
    }
    chatTerm.writeln(nickLine);

    const tsPrefix = timestamp ? '[' + timestamp + '] ' : '';
    const cols = termCols(chatTerm);
    const prefixLen = stripAnsi(tsPrefix).length;
    const indent = ' '.repeat(prefixLen);
    const width = Math.max(cols - prefixLen, 8);
    const paragraphs = normalizeDisplayText(text).split('\n');
    let wroteContent = false;

    paragraphs.forEach((para) => {
      if (para === '') {
        chatTerm.writeln(wroteContent ? indent : tsPrefix);
        wroteContent = true;
        return;
      }
      const parts = wrapPlainWords(para, width);
      const members = roomMemberNicks.get(room || currentRoom) || new Set();
      parts.forEach((part) => {
        const styledPart = colorMentionsInLine(part, members);
        if (!wroteContent) {
          chatTerm.writeln(tsPrefix + styledPart);
          wroteContent = true;
        } else {
          chatTerm.writeln(indent + styledPart);
        }
      });
    });

    chatTerm.writeln('');
    chatTerm.scrollToBottom();
  }

  function isTriviaNick(nick) {
    return nick === 'trivia' || nick === '*trivia*';
  }

  function isServerNick(nick) {
    return nick === 'server';
  }

  function isAsciiNick(nick) {
    return nick === 'ascii';
  }

  function isRollNick(nick) {
    return nick === 'roll';
  }

  function isEmoteNick(nick) {
    return nick === 'emote';
  }

  function nickMatches(mention, memberNick) {
    if (!mention || !memberNick) return false;
    const m = mention.toLowerCase();
    const n = memberNick.toLowerCase();
    if (m === n) return true;
    const bang = n.indexOf('!');
    if (bang > 0 && n.slice(0, bang) === m) return true;
    return false;
  }

  function isMentioned(mentions, memberNick) {
    if (!mentions || !memberNick) return false;
    return mentions.some((m) => nickMatches(m, memberNick));
  }

  function shouldBlipForRoom(room) {
    if (!room) return true;
    return room === currentRoom || joinedRooms.has(room);
  }

  function isMentionedByOther(msg, text) {
    if (!fullNick || msg.history) return false;
    if (msg.nick && !isEmoteNick(msg.nick) && !isTriviaNick(msg.nick) && !isServerNick(msg.nick) &&
        !isAsciiNick(msg.nick) && !isRollNick(msg.nick) && nickMatches(msg.nick, fullNick)) {
      return false;
    }
    if (msg.mentions && isMentioned(msg.mentions, fullNick)) return true;
    if (!text) return false;
    const plain = stripAnsi(String(text));
    let match;
    const re = /@(\S+)/g;
    while ((match = re.exec(plain)) !== null) {
      const token = match[1].replace(/[.,!?;:]+$/, '');
      if (nickMatches(token, fullNick)) return true;
    }
    return false;
  }

  function maybePlayNotifyBlip(room) {
    if (!shouldBlipForRoom(room)) return;
    playNotifyBlip();
  }

  function memberSetHas(members, token) {
    if (!members || !token) return false;
    for (const nick of members) {
      if (nickMatches(token, nick)) return true;
    }
    return false;
  }

  function colorMentionsInLine(line, members) {
    const t = THEMES[settings.theme] || THEMES.matrix;
    const reset = '\x1b[0m';
    const mc = ansiFg(t.mention || t.highlight);
    return line.replace(/@(\S+)/g, (full, token) => {
      const bare = token.replace(/[.,!?;:]+$/, '');
      const suffix = token.slice(bare.length);
      if (memberSetHas(members, bare)) {
        return mc + '@' + bare + reset + suffix;
      }
      return full;
    });
  }

  function trackRoomMembersFromSystem(text, room) {
    if (!text || !room) return;
    const join = text.match(/^(\S+) has joined\.?$/);
    const left = text.match(/^(\S+) has left\.?$/);
    const members = roomMemberNicks.get(room) || new Set();
    if (join) {
      members.add(join[1]);
      roomMemberNicks.set(room, members);
    } else if (left) {
      for (const nick of members) {
        if (nickMatches(left[1], nick)) {
          members.delete(nick);
          break;
        }
      }
      roomMemberNicks.set(room, members);
    }
  }

  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {}
    }
    return audioCtx;
  }

  function playBlip(freq, duration, volume) {
    if (!settings.sound) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  function playNotifyBlip() {
    playBlip(880, 0.07, 0.07);
  }

  function writeRollEntry(text, timestamp) {
    writeStyledChatLine(text, timestamp, triviaColor());
  }

  function writeEmoteEntry(text, timestamp) {
    writeStyledChatLine(text, timestamp, triviaColor());
  }

  function writeStyledChatLine(text, timestamp, color) {
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const tsPrefix = timestamp ? '[' + timestamp + '] ' : '';
    const cols = termCols(chatTerm);
    const prefixLen = stripAnsi(tsPrefix).length;
    const indent = ' '.repeat(prefixLen);
    const width = Math.max(cols - prefixLen, 8);
    const plain = stripAnsi(text);
    const styledPrefix = bold + color;
    const paragraphs = normalizeDisplayText(plain).split('\n');
    let wroteContent = false;

    paragraphs.forEach((para) => {
      if (para === '') {
        chatTerm.writeln(styledPrefix + (wroteContent ? indent : tsPrefix) + reset);
        wroteContent = true;
        return;
      }
      const parts = wrapPlainWords(para, width);
      parts.forEach((part) => {
        const line = !wroteContent ? tsPrefix + part : indent + part;
        chatTerm.writeln(styledPrefix + line + reset);
        wroteContent = true;
      });
    });

    chatTerm.writeln('');
    chatTerm.scrollToBottom();
  }

  function triviaColor() {
    const t = THEMES[settings.theme] || THEMES.matrix;
    return ansiFg(t.trivia || t.highlight);
  }

  function writeTriviaEntry(text, timestamp) {
    const color = triviaColor();
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const tsPrefix = timestamp ? '[' + timestamp + '] ' : '';
    const cols = termCols(chatTerm);
    const prefixLen = stripAnsi(tsPrefix).length;
    const indent = ' '.repeat(prefixLen);
    const width = Math.max(cols - prefixLen, 8);
    const plain = stripAnsi(text);
    const styledPrefix = bold + color;
    const paragraphs = normalizeDisplayText(plain).split('\n');
    let wroteContent = false;

    paragraphs.forEach((para) => {
      if (para === '') {
        chatTerm.writeln(styledPrefix + (wroteContent ? indent : tsPrefix) + reset);
        wroteContent = true;
        return;
      }
      const parts = wrapPlainWords(para, width);
      parts.forEach((part) => {
        const line = !wroteContent ? tsPrefix + part : indent + part;
        chatTerm.writeln(styledPrefix + line + reset);
        wroteContent = true;
      });
    });

    chatTerm.writeln('');
    chatTerm.scrollToBottom();
  }

  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  function normalizeDisplayText(text) {
    return String(text)
      .replace(/\t/g, '    ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  function measureCharWidth(term) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      const size = term.options.fontSize || NORMAL_FONT_SIZE;
      const weight = term.options.fontWeight || 'normal';
      const family = term.options.fontFamily || 'monospace';
      ctx.font = `${weight} ${size}px ${family}`;
      const w = ctx.measureText('M').width;
      return w > 0 ? w : size * 0.6;
    } catch (_) {
      const size = term.options.fontSize || NORMAL_FONT_SIZE;
      const weight = term.options.fontWeight || 'normal';
      return size * (weight === 'bold' ? 0.62 : 0.6);
    }
  }

  function extractAnsiPrefix(text) {
    let i = 0;
    while (i < text.length) {
      const m = text.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (!m) break;
      i += m[0].length;
    }
    return text.slice(0, i);
  }

  function termCols(term) {
    let cols = term.cols || 0;
    if (cols < 8) {
      cols = estimateColsFromHost(term);
    }
    if (cols < 8 && isMobileLayout()) {
      const w = termHostWidth(term) || window.innerWidth;
      const fontSize = term.options.fontSize || NORMAL_FONT_SIZE;
      cols = Math.floor(w / (fontSize * 0.6));
    }
    const pad = isMobileLayout() ? 2 : 1;
    return Math.max(cols - pad, 8);
  }

  function effectiveCols(cols) {
    return Math.max(cols || 80, 12);
  }

  /** Wrap plain text at word boundaries; never split a word mid-character. */
  function wrapPlainWords(text, width) {
    if (!text) return [''];
    width = Math.max(width, 8);
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [''];

    const lines = [];
    let line = '';
    for (const word of words) {
      if (!line) {
        line = word;
        if (line.length > width) {
          lines.push(line);
          line = '';
        }
        continue;
      }
      const candidate = line + ' ' + word;
      if (candidate.length <= width) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
        if (line.length > width) {
          lines.push(line);
          line = '';
        }
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function wrapPlainWordsWithPrefix(text, cols, prefixLen) {
    const width = Math.max(cols - prefixLen, 8);
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [''];

    const lines = [];
    let line = '';
    for (const word of words) {
      if (!line) {
        line = word;
        if (line.length > width) {
          lines.push(line);
          line = '';
        }
        continue;
      }
      const candidate = line + ' ' + word;
      if (candidate.length <= width) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
        if (line.length > width) {
          lines.push(line);
          line = '';
        }
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function wrapTerminalText(text, cols) {
    const width = effectiveCols(cols);
    const ansiPrefix = extractAnsiPrefix(text);
    const plain = stripAnsi(text);
    const rows = plain.split('\n');
    const out = [];
    for (let r = 0; r < rows.length; r++) {
      const wrapped = wrapPlainWords(rows[r], width);
      for (let i = 0; i < wrapped.length; i++) {
        out.push((r === 0 && i === 0 ? ansiPrefix : ansiPrefix) + wrapped[i]);
      }
    }
    return out.length ? out : [''];
  }

  function writeWrapped(term, text, cols) {
    normalizeDisplayText(text).split('\n').forEach(row => {
      wrapPlainWords(row, effectiveCols(cols)).forEach(line => term.writeln(line));
    });
  }

  function ansiFg(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return '\x1b[38;2;' + r + ';' + g + ';' + b + 'm';
  }

  function formatNickColored(nick, wrapBrackets) {
    const bang = nick.indexOf('!');
    const t = THEMES[settings.theme] || THEMES.matrix;
    const reset = '\x1b[0m';
    const nameColor = ansiFg(t.fg);
    const tripColor = ansiFg(t.tripcode);
    let inner;
    if (bang < 0) {
      inner = nameColor + nick + reset;
    } else {
      inner = nameColor + nick.slice(0, bang) + tripColor + nick.slice(bang) + reset;
    }
    return wrapBrackets ? '<' + inner + '>' : inner;
  }

  function formatTimestamp(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const time = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const now = new Date();
    if (d.toDateString() !== now.toDateString()) {
      return d.toLocaleDateString() + ' ' + time;
    }
    return time;
  }

  function writelnChat(text) {
    writeWrapped(chatTerm, text, termCols(chatTerm));
    chatTerm.scrollToBottom();
  }

  function writelnSystem(text, isError) {
    const content = isError ? '\x1b[31m' + text + '\x1b[0m' : text;
    writeWrapped(systemTerm, content, termCols(systemTerm));
    systemTerm.scrollToBottom();
  }

  function asciiArtLibrary() {
    return window.DOOM_ASCII_ART || [];
  }

  function getAsciiMaxDisplayRows() {
    fitTerminals();
    const host = document.getElementById('chat-terminal');
    const fontSize = chatTerm.options.fontSize || NORMAL_FONT_SIZE;
    const linePx = fontSize * 1.2;
    if (host && host.clientHeight > 0) {
      return Math.max(3, Math.floor((host.clientHeight * 0.5) / linePx));
    }
    return Math.max(3, Math.floor(chatTerm.rows * 0.5));
  }

  function subsampleAsciiLines(lines, target) {
    if (lines.length <= target) return lines;
    if (target <= 0) return [];
    if (target === 1) return [lines[0]];
    const out = [];
    for (let i = 0; i < target; i++) {
      const idx = Math.round(i * (lines.length - 1) / (target - 1));
      out.push(lines[idx]);
    }
    return out;
  }

  function scaleAsciiArtLines(artText) {
    const raw = normalizeDisplayText(artText).split('\n');
    while (raw.length && raw[raw.length - 1] === '') raw.pop();
    const maxTotalRows = getAsciiMaxDisplayRows();
    const maxArtRows = Math.max(1, maxTotalRows - 1);
    const maxCols = Math.max(8, chatTerm.cols - 1);
    let lines = raw.length ? raw : [''];
    let scaled = false;
    if (lines.length > maxArtRows) {
      lines = subsampleAsciiLines(lines, maxArtRows);
      scaled = true;
    }
    lines = lines.map((line) => {
      if (line.length > maxCols) {
        scaled = true;
        return line.slice(0, maxCols);
      }
      return line;
    });
    return { lines, scaled };
  }

  function findAsciiPiece(id) {
    return asciiArtLibrary().find((a) => a.id === id);
  }

  function pickRandomAsciiId() {
    const list = asciiArtLibrary();
    if (!list.length) return null;
    const piece = list[Math.floor(Math.random() * list.length)];
    return piece && piece.id ? piece.id : null;
  }

  function writeAsciiArt(piece, timestamp) {
    const { lines, scaled } = scaleAsciiArtLines(piece.art);
    const t = THEMES[settings.theme] || THEMES.matrix;
    const color = ansiFg(t.trivia || t.highlight);
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const titleSuffix = scaled ? ' (scaled to fit)' : '';
    const tsPrefix = timestamp ? '[' + timestamp + '] ' : '';
    chatTerm.writeln(tsPrefix + bold + color + '=== ' + piece.title + titleSuffix + ' ===' + reset);
    lines.forEach((line) => {
      chatTerm.writeln(color + line + reset);
    });
    chatTerm.writeln('');
    chatTerm.scrollToBottom();
  }

  function renderAsciiFromId(id, timestamp) {
    if (!id) return;
    let artId = String(id).trim().toLowerCase();
    if (artId === 'random') {
      artId = pickRandomAsciiId();
      if (!artId) {
        writeTriviaEntry('[ascii] art library not loaded', timestamp);
        return;
      }
    }
    const piece = findAsciiPiece(artId);
    if (!piece) {
      writeTriviaEntry('[ascii] missing art: ' + artId, timestamp);
      return;
    }
    writeAsciiArt(piece, timestamp);
  }

  function requestAsciiArt(arg) {
    const list = asciiArtLibrary();
    if (!list.length) {
      writelnSystem('ASCII art library not loaded.', true);
      return;
    }
    const pick = (arg || 'random').trim().toLowerCase();
    if (pick === 'list') {
      writelnSystem('ASCII art: /ascii  |  /ascii random  |  /ascii <id>');
      writelnSystem('IDs: ' + list.map((a) => a.id).join(', '));
      return;
    }
    if (!fullNick) {
      writelnSystem('Set a nick first: /nick YourName#secret', true);
      return;
    }
    if (isEncryptedRoom(currentRoom)) {
      writelnSystem('ASCII art only in public rooms.', true);
      return;
    }
    let id;
    if (pick === 'random' || pick === '') {
      id = pickRandomAsciiId();
      if (!id) {
        writelnSystem('ASCII art library not loaded.', true);
        return;
      }
    } else if (findAsciiPiece(pick)) {
      id = pick;
    } else {
      writelnSystem('Unknown ASCII art "' + pick + '". Try /ascii list', true);
      return;
    }
    if (!send({ type: 'ascii', room: currentRoom, text: id })) {
      writelnSystem('Not connected — /ascii not sent.', true);
    }
  }

  function formatScores(scores) {
    if (!scores) return '(none)';
    return Object.entries(scores).map(([k, v]) => k + ': ' + v).join(', ');
  }

  function formatRoomList(list) {
    if (!list || !list.length) return '(none)';
    return list.map(r => r.name + ' (' + r.count + ')').join(', ');
  }

  function isEncryptedRoom(room) {
    return roomKeys.has(room);
  }

  function syncSendButton() {
    if (!sendBtnEl) return;
    sendBtnEl.disabled = !inputEl.value.trim();
  }

  async function submitLine() {
    const line = inputEl.value.trim();
    if (!line) return;
    inputEl.value = '';
    syncSendButton();

    if (line.startsWith('/')) {
      try {
        await handleCommand(line);
      } catch (err) {
        writelnSystem('Command failed: ' + (err && err.message ? err.message : err), true);
      }
      if (isMobileLayout()) setMobilePane('system');
      return;
    }

    if (!fullNick) {
      writelnSystem('Set a nick first: /nick YourName#secret', true);
      return;
    }

    let text = line;
    let enc = false;
    if (isEncryptedRoom(currentRoom)) {
      const key = roomKeys.get(currentRoom);
      if (!key) {
        writelnSystem('Join encrypted room with password: /join ' + currentRoom + ' <password>', true);
        return;
      }
      text = await encryptText(line, key);
      enc = true;
    }

    send({ type: 'chat', room: currentRoom, text, enc });
  }

  const COMMAND_INDEX = [
    'ascii', 'board', 'boards', 'brimley', 'create', 'emote', 'font', 'help',
    'join', 'list', 'logout', 'nick', 'part', 'post', 'posts', 'roll', 'room',
    'rooms', 'sound', 'theme', 'thread', 'threads', 'trivia', 'users'
  ];

  function commandHelpText(name) {
    const fonts = Object.keys(FONTS).join(', ');
    const themes = Object.keys(THEMES).join(', ');
    const emotes = 'slap, hug, wave, punch, highfive, dance, flip, toast';
    const map = {
      ascii: [
        '/ascii — retro ASCII art in chat (persists 24h, auto-scaled)',
        'Usage: /ascii  |  /ascii random  |  /ascii <id>  |  /ascii list',
        'Tip: bare /ascii picks random from 100 tech & game pieces'
      ],
      board: [
        '/board — message board management',
        'Usage: /board create <name>'
      ],
      boards: [
        '/boards — list all message boards'
      ],
      brimley: [
        '/brimley — toggle VISUAL AIDS MODE (enlarged chat + system text)'
      ],
      create: [
        '/create — create a private encrypted room',
        'Usage: /create private <name> <password>'
      ],
      emote: [
        '/emote — perform an action toward another user in the room',
        'Usage: /emote <name> <nick>',
        'Emotes: ' + emotes
      ],
      font: [
        '/font — change chat and system pane font',
        'Usage: /font <name>',
        'Fonts: ' + fonts
      ],
      help: [
        '/help — list commands (A–Z)',
        'Usage: /help  |  /help <command>'
      ],
      join: [
        '/join — join a chat room',
        'Usage: /join #room  |  /join <room> <password>  (encrypted rooms)'
      ],
      list: [
        '/list — list public rooms with user counts'
      ],
      logout: [
        '/logout — clear session (refresh to start new)'
      ],
      nick: [
        '/nick — set your display nick with optional tripcode',
        'Usage: /nick YourName#secret'
      ],
      part: [
        '/part — leave a room (default: current room; cannot part #lobby)',
        'Usage: /part  |  /part #room'
      ],
      post: [
        '/post — reply to a message-board thread',
        'Usage: /post <thread_id> <body>'
      ],
      posts: [
        '/posts — list posts in a thread',
        'Usage: /posts <thread_id>'
      ],
      roll: [
        '/roll — roll D&D dice in chat (persists 24h, public rooms)',
        'Dice: d20, d12, d10, d%, d8, d6, d4, d2',
        'Usage: /roll d20  |  /roll 2d6+3  |  /roll d%-10'
      ],
      room: [
        '/room — switch active room (client-side focus)',
        'Usage: /room #name'
      ],
      rooms: [
        '/rooms — numbered public room list',
        'Usage: /rooms  |  /rooms <number>  (switch by list index)'
      ],
      sound: [
        '/sound — matrix blips for @mentions, trivia, and server chat (on by default)',
        'Usage: /sound on  |  /sound off',
        'Current: ' + (settings.sound ? 'on' : 'off')
      ],
      theme: [
        '/theme — change color theme',
        'Usage: /theme <name>',
        'Themes: ' + themes
      ],
      thread: [
        '/thread — create a message-board thread',
        'Usage: /thread create <board> <title>'
      ],
      threads: [
        '/threads — list threads on a board',
        'Usage: /threads <board>'
      ],
      trivia: [
        '/trivia — trivia game in public rooms (persists 24h)',
        'Usage: /trivia  |  /trivia start  |  /trivia stop'
      ],
      users: [
        '/users — list users in a room',
        'Usage: /users  |  /users #room'
      ]
    };
    return map[name] || null;
  }

  function showCommandIndex() {
    writelnSystem('Commands (A–Z):\n' + COMMAND_INDEX.map((c) => '/' + c).join('\n'));
    writelnSystem('Type /help <command> or /command for usage details.');
  }

  function showCommandHelp(name) {
    const lines = commandHelpText(name);
    if (!lines) {
      writelnSystem('Unknown command "' + name + '". /help for list.', true);
      return;
    }
    writelnSystem(lines.join('\n'));
  }

  async function handleCommand(line) {
    const parts = line.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();

    switch (cmd) {
      case 'help': {
        const topic = (parts[1] || '').toLowerCase();
        if (topic) {
          showCommandHelp(topic);
        } else {
          showCommandIndex();
        }
        break;
      }

      case 'nick': {
        const arg = line.slice(5).trim();
        if (!arg) {
          showCommandHelp('nick');
          return;
        }
        const trip = await parseTripcode(arg);
        if (!trip) {
          if (arg.includes('!')) {
            writelnSystem('Cannot paste a tripcode. Use /nick YourName#secret', true);
          } else {
            showCommandHelp('nick');
          }
          return;
        }
        fullNick = trip.display;
        settings.last_nick = trip.name;
        saveSettings();
        send({ type: 'nick', nick: fullNick });
        writelnSystem('Nick set locally to ' + formatNickColored(fullNick, false));
        break;
      }

      case 'join': {
        const rest = line.slice(5).trim();
        if (!rest) {
          showCommandHelp('join');
          return;
        }
        const joinParts = rest.split(/\s+/);
        let room = joinParts[0];
        if (!room.startsWith('#')) room = '#' + room;
        room = room.toLowerCase();
        if (joinParts.length >= 2) {
          const pass = joinParts.slice(1).join(' ');
          const key = await deriveKey(pass, room);
          roomKeys.set(room, key);
          writelnSystem('Encryption key derived for ' + room);
        }
        setActiveRoom(room);
        joinedRooms.add(room);
        send({ type: 'join', room });
        break;
      }

      case 'part': {
        const room = (parts[1] || currentRoom).toLowerCase();
        send({ type: 'part', room });
        joinedRooms.delete(room);
        if (room === currentRoom) setActiveRoom('#lobby');
        break;
      }

      case 'create': {
        if (parts.length === 1) {
          showCommandHelp('create');
          return;
        }
        if (parts[1] !== 'private' || parts.length < 4) {
          showCommandHelp('create');
          return;
        }
        const name = parts[2];
        const pass = parts.slice(3).join(' ');
        const room = ('#' + name).toLowerCase();
        const key = await deriveKey(pass, room);
        roomKeys.set(room, key);
        setActiveRoom(room);
        send({ type: 'create_room', name, encrypted: true });
        break;
      }

      case 'theme': {
        const name = parts[1];
        if (!name) {
          showCommandHelp('theme');
          return;
        }
        if (!THEMES[name]) {
          showCommandHelp('theme');
          return;
        }
        applyTheme(name);
        send({ type: 'theme', theme: name });
        writelnSystem('Theme set to ' + name);
        break;
      }

      case 'font': {
        const name = line.match(/\/font\s+"([^"]+)"/)?.[1] || parts.slice(1).join(' ');
        if (!name) {
          showCommandHelp('font');
          return;
        }
        if (!FONTS[name]) {
          showCommandHelp('font');
          return;
        }
        applyFont(name);
        send({ type: 'font', font: name });
        writelnSystem('Font set to ' + name + ' (chat + system panes).');
        showFontPreviewInChat(name);
        break;
      }

      case 'ascii': {
        const arg = parts.length > 1 ? parts.slice(1).join(' ').trim().toLowerCase() : 'random';
        if (arg === 'help') {
          showCommandHelp('ascii');
          return;
        }
        requestAsciiArt(arg);
        break;
      }

      case 'roll': {
        const expr = parts.slice(1).join(' ').trim();
        if (!expr) {
          showCommandHelp('roll');
          return;
        }
        if (!fullNick) {
          writelnSystem('Set a nick first: /nick YourName#secret', true);
          return;
        }
        if (isEncryptedRoom(currentRoom)) {
          writelnSystem('Rolls only in public rooms.', true);
          return;
        }
        if (!send({ type: 'roll', room: currentRoom, text: expr })) {
          writelnSystem('Not connected — /roll not sent.', true);
        }
        break;
      }

      case 'emote': {
        if (parts.length === 1) {
          showCommandHelp('emote');
          return;
        }
        const emote = parts[1].toLowerCase();
        const target = parts.slice(2).join(' ').trim();
        if (!target) {
          showCommandHelp('emote');
          return;
        }
        if (!fullNick) {
          writelnSystem('Set a nick first: /nick YourName#secret', true);
          return;
        }
        if (isEncryptedRoom(currentRoom)) {
          writelnSystem('Emotes only in public rooms.', true);
          return;
        }
        if (!send({ type: 'emote', room: currentRoom, text: emote, name: target })) {
          writelnSystem('Not connected — /emote not sent.', true);
        }
        break;
      }

      case 'sound': {
        const action = (parts[1] || '').toLowerCase();
        if (!action) {
          showCommandHelp('sound');
          return;
        }
        if (action === 'on') {
          settings.sound = true;
          saveSettings();
          writelnSystem('Sound on — blips on @mentions, trivia, and server chat.');
          playNotifyBlip();
        } else if (action === 'off') {
          settings.sound = false;
          saveSettings();
          writelnSystem('Sound off.');
        } else {
          showCommandHelp('sound');
        }
        break;
      }

      case 'trivia': {
        const action = (parts[1] || '').toLowerCase();
        if (action === 'start') {
          send({ type: 'trivia_start', room: currentRoom });
        } else if (action === 'stop') {
          send({ type: 'trivia_stop', room: currentRoom });
        } else if (action === '' || action === 'once') {
          send({ type: 'trivia_once', room: currentRoom });
        } else {
          showCommandHelp('trivia');
        }
        break;
      }

      case 'list':
        send({ type: 'list' });
        break;

      case 'rooms': {
        const arg = parts[1];
        if (!arg) {
          send({ type: 'list' });
          break;
        }
        const n = parseInt(arg, 10);
        if (!n || n < 1) {
          showCommandHelp('rooms');
          break;
        }
        if (!numberedPublicRooms.length) {
          writelnSystem('Run /rooms first to load the numbered room list.', true);
          break;
        }
        const picked = numberedPublicRooms[n - 1];
        if (!picked) {
          writelnSystem('No room #' + n + '. Run /rooms to refresh the list.', true);
          break;
        }
        const room = picked.name;
        setActiveRoom(room);
        if (!joinedRooms.has(room)) {
          joinedRooms.add(room);
          send({ type: 'join', room });
        }
        writelnSystem('Active room: ' + room);
        break;
      }

      case 'sers':
      case 'users': {
        let room = parts[1] || currentRoom;
        if (room && !room.startsWith('#')) room = '#' + room;
        send({ type: 'users', room: (room || currentRoom).toLowerCase() });
        break;
      }

      case 'boards':
        send({ type: 'board_list' });
        break;

      case 'board':
        if (parts[1] === 'create' && parts[2]) {
          send({ type: 'board_create', name: parts.slice(2).join(' ') });
        } else {
          showCommandHelp('board');
        }
        break;

      case 'threads':
        if (parts[1]) send({ type: 'thread_list', board: parts.slice(1).join(' ') });
        else showCommandHelp('threads');
        break;

      case 'thread':
        if (parts[1] === 'create' && parts.length >= 4) {
          send({ type: 'thread_create', board: parts[2], title: parts.slice(3).join(' ') });
        } else {
          showCommandHelp('thread');
        }
        break;

      case 'posts':
        if (parts[1]) send({ type: 'post_list', thread: parts[1] });
        else showCommandHelp('posts');
        break;

      case 'post':
        if (parts[1] && parts.length > 2) {
          send({ type: 'post_create', thread: parts[1], body: parts.slice(2).join(' ') });
        } else {
          showCommandHelp('post');
        }
        break;

      case 'logout':
        localStorage.removeItem(SETTINGS_KEY);
        settings = loadSettings();
        fullNick = '';
        roomKeys.clear();
        send({ type: 'logout' });
        break;

      case 'room':
        if (parts[1]) {
          const room = parts[1].startsWith('#') ? parts[1].toLowerCase() : ('#' + parts[1]).toLowerCase();
          setActiveRoom(room);
          writelnSystem('Active room: ' + currentRoom);
        } else {
          showCommandHelp('room');
        }
        break;

      case 'brimley':
        toggleBrimley();
        break;

      default:
        writelnSystem('Unknown command. /help for list.', true);
    }
  }

  async function parseTripcode(input) {
    if (input.includes('!')) {
      return null;
    }
    const idx = input.indexOf('#');
    if (idx <= 0) {
      if (!input) return null;
      return { name: input, display: input };
    }
    const name = input.slice(0, idx).trim();
    const secret = input.slice(idx + 1);
    if (!name || !secret) return null;
    const hash = await tripcodeHash(secret);
    return { name, display: name + '!' + hash.slice(0, 8) };
  }

  async function tripcodeHash(secret) {
    return sha256Hex(new TextEncoder().encode(secret));
  }

  async function deriveKey(password, room) {
    if (!hasSubtleCrypto()) {
      throw new Error('Encrypted rooms require HTTPS (or localhost).');
    }
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
      'raw', enc.encode(password + ':' + room), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('doomchat-ii:' + room), iterations: 100000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptText(plain, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipher), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async function decryptText(b64, key) {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
  }
})();
