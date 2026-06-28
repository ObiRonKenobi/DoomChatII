(function () {
  'use strict';

  const SETTINGS_KEY = 'doomchat_settings';
  const RELEASE_SEEN_KEY = 'doomchat_release_seen';
  const RECONNECT_DELAY_MS = 2000;
  const MAX_RECONNECTS = 10;

  const THEMES = {
    matrix:  { bg: '#000000', fg: '#00FF00', system: '#00AA00', error: '#FF0000', highlight: '#00FF00', tripcode: '#00AA00' },
    amber:   { bg: '#000000', fg: '#FFB000', system: '#CC8800', error: '#FF4444', highlight: '#FFD700', tripcode: '#FFD700' },
    cobalt:  { bg: '#000000', fg: '#4488FF', system: '#3366CC', error: '#FF6666', highlight: '#66AAFF', tripcode: '#66AAFF' },
    snow:    { bg: '#000000', fg: '#FFFFFF', system: '#AAAAAA', error: '#FF4444', highlight: '#FFFFFF', tripcode: '#AAAAAA' },
    vintage: { bg: '#2B1B0E', fg: '#33FF33', system: '#228B22', error: '#FF6666', highlight: '#55FF55', tripcode: '#228B22' },
    dracula: { bg: '#282a36', fg: '#f8f8f2', system: '#bd93f9', error: '#ff5555', highlight: '#50fa7b', tripcode: '#bd93f9' },
    spawn:   { bg: '#0a0a0a', fg: '#39FF14', system: '#8B0000', error: '#FF2200', highlight: '#C0C0C0', tripcode: '#C0C0C0' },
    merica:  { bg: '#002868', fg: '#FFFFFF', system: '#BF0A30', error: '#FF6666', highlight: '#BF0A30', tripcode: '#BF0A30' }
  };

  const FONTS = {
    'Courier New': '"Courier New", Courier, monospace',
    'IBM Plex Mono': '"IBM Plex Mono", monospace',
    'Fira Code': '"Fira Code", monospace',
    'JetBrains Mono': '"JetBrains Mono", monospace',
    'Lucida Console': '"Lucida Console", "Lucida Sans Typewriter", monospace'
  };

  const BANNER = [
    ' ██████╗  ██████╗  ██████╗ ███╗   ███╗ ██████╗██╗  ██╗ █████╗ ████████╗    ██╗ ██╗',
    ' ██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║██╔════╝██║  ██║██╔══██╗╚══██╔══╝    ██║ ██║',
    ' ██║  ██║██║   ██║██║   ██║██╔████╔██║██║     ███████║███████║   ██║       ██║ ██║',
    ' ██║  ██║██║   ██║██║   ██║██║╚██╔╝██║██║     ██╔══██║██╔══██║   ██║       ██║ ██║',
    ' ██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║╚██████╗██║  ██║██║  ██║   ██║        ╚═╝ ╚═╝',
    ' ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝',
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
  const roomKeys = new Map();

  const statusEl = document.getElementById('status');
  const inputEl = document.getElementById('cmd-input');
  const bannerEl = document.getElementById('chat-banner');
  const bannerWrapEl = document.querySelector('.chat-banner-wrap');
  const toggleChatBtn = document.getElementById('toggle-chat');
  const toggleSystemBtn = document.getElementById('toggle-system');
  const chatPane = document.getElementById('chat-pane');
  const systemPane = document.getElementById('system-pane');
  const terminalGrid = document.getElementById('terminal-grid');
  bannerEl.textContent = BANNER.join('\n');

  let mobilePane = 'chat';
  const mobileQuery = window.matchMedia('(max-width: 768px), (pointer: coarse) and (max-width: 1024px)');

  const chatTerm = new Terminal({
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    scrollback: 5000,
    theme: termTheme()
  });
  const systemTerm = new Terminal({
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    scrollback: 3000,
    theme: termTheme()
  });
  const chatFit = new FitAddon.FitAddon();
  const systemFit = new FitAddon.FitAddon();
  chatTerm.loadAddon(chatFit);
  systemTerm.loadAddon(systemFit);
  chatTerm.open(document.getElementById('chat-terminal'));
  systemTerm.open(document.getElementById('system-terminal'));

  applyTheme(settings.theme);
  applyFont(settings.font);
  fitTerminals();
  fitBanner();
  applyPaneVisibility();
  initMobileSwipe();

  window.addEventListener('resize', () => {
    fitTerminals();
    fitBanner();
    applyPaneVisibility();
  });
  mobileQuery.addEventListener('change', () => {
    applyPaneVisibility();
    fitBanner();
    fitTerminals();
  });
  bindPaneToggle(toggleChatBtn, 'chat');
  bindPaneToggle(toggleSystemBtn, 'system');
  inputEl.addEventListener('keydown', onInputKey);

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
          session_id: s.session_id || randomUUID()
        };
      }
    } catch (_) {}
    return {
      theme: 'matrix',
      font: 'Courier New',
      last_nick: '',
      session_id: randomUUID()
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
    chatTerm.options.theme = termTheme();
    systemTerm.options.theme = termTheme();
    saveSettings();
  }

  function applyFont(name) {
    if (!FONTS[name]) name = 'Courier New';
    settings.font = name;
    document.documentElement.style.setProperty('--font', FONTS[name]);
    saveSettings();
  }

  function fitTerminals() {
    chatFit.fit();
    systemFit.fit();
  }

  function bindPaneToggle(btn, pane) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setMobilePane(pane);
    });
  }

  function initMobileSwipe() {
    let startX = 0;
    let startY = 0;
    terminalGrid.addEventListener('touchstart', (e) => {
      if (!isMobileLayout() || !e.changedTouches.length) return;
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
    }, { passive: true });
    terminalGrid.addEventListener('touchend', (e) => {
      if (!isMobileLayout() || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
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

  function isMobileLayout() {
    return mobileQuery.matches;
  }

  function setMobilePane(pane) {
    mobilePane = pane;
    toggleChatBtn.classList.toggle('active', pane === 'chat');
    toggleSystemBtn.classList.toggle('active', pane === 'system');
    applyPaneVisibility();
    requestAnimationFrame(() => {
      fitTerminals();
      fitBanner();
      if (pane === 'chat') chatTerm.scrollToBottom();
      else systemTerm.scrollToBottom();
    });
  }

  function applyPaneVisibility() {
    const mobile = isMobileLayout();
    if (!mobile) {
      chatPane.classList.remove('pane-hidden', 'pane-visible');
      systemPane.classList.remove('pane-hidden', 'pane-visible');
      return;
    }
    if (mobilePane === 'chat') {
      chatPane.classList.add('pane-visible');
      chatPane.classList.remove('pane-hidden');
      systemPane.classList.add('pane-hidden');
      systemPane.classList.remove('pane-visible');
    } else {
      systemPane.classList.add('pane-visible');
      systemPane.classList.remove('pane-hidden');
      chatPane.classList.add('pane-hidden');
      chatPane.classList.remove('pane-visible');
    }
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
      applyPaneVisibility();
      fitTerminals();
      fitBanner();
      chatTerm.scrollToBottom();
      setStatus('connected');
      writelnSystem('Connected.');
      send({
        type: 'hello',
        session_id: settings.session_id,
        nick: fullNick || undefined,
        theme: settings.theme,
        font: settings.font
      });
      setTimeout(() => {
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
    }
  }

  async function handleMessage(msg) {
    switch (msg.type) {
      case 'chat':
        await renderChatLine(msg);
        break;
      case 'history':
        await renderHistory(msg);
        break;
      case 'system':
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
        writelnSystem('Session restored for ' + (msg.nick || 'guest'));
        break;
      case 'session_new':
        writelnSystem('New session. Use /nick YourName#secret');
        if (settings.last_nick) {
          writelnSystem('Hint: last nick was "' + settings.last_nick + '" (re-enter tripcode secret).');
        }
        break;
      case 'room_list':
        writelnSystem('Public rooms: ' + (msg.text || formatRoomList(msg.room_list)));
        break;
      case 'trivia_question':
        writelnChat('[Trivia] ' + msg.question);
        break;
      case 'trivia_answer':
        if (msg.winner) {
          writelnChat('[Trivia] ' + formatNickColored(msg.winner, false) + ' got it! Answer: ' + msg.answer);
        } else {
          writelnChat('[Trivia] Time\'s up! Answer: ' + msg.answer);
        }
        break;
      case 'trivia_scores':
        writelnChat('[Trivia] Scores: ' + formatScores(msg.scores));
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
    for (const entry of msg.history) {
      await renderChatLine({
        nick: entry.nick,
        text: entry.text,
        timestamp: entry.timestamp,
        room: msg.room,
        enc: entry.enc
      });
    }
    chatTerm.scrollToBottom();
    requestAnimationFrame(() => {
      fitTerminals();
      fitBanner();
    });
  }

  async function renderChatLine(msg) {
    let text = msg.text;
    const room = msg.room || currentRoom;
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
    const ts = formatTimestamp(msg.timestamp);
    const head = (ts ? '[' + ts + '] ' : '') + formatNickColored(msg.nick, true) + ' ';
    writeChatMessage(head, text);
  }

  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
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
    const pad = isMobileLayout() ? 2 : 1;
    return Math.max((term.cols || 80) - pad, 8);
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
    wrapTerminalText(text, cols).forEach(line => term.writeln(line));
  }

  function writeChatMessage(head, body) {
    const cols = termCols(chatTerm);
    const indent = ' '.repeat(stripAnsi(head).length);
    const parts = wrapPlainWordsWithPrefix(body, cols, stripAnsi(head).length);
    parts.forEach((part, i) => {
      chatTerm.writeln(i === 0 ? head + part : indent + part);
    });
    chatTerm.scrollToBottom();
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

  async function onInputKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const line = inputEl.value.trim();
    inputEl.value = '';
    if (!line) return;

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

  async function handleCommand(line) {
    const parts = line.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();

    switch (cmd) {
      case 'help':
        writelnSystem([
          'Commands:',
          '/nick Name#secret  — set tripcoded nick',
          '/join #room         — join public room',
          '/join room pass     — join encrypted room',
          '/part [#room]       — leave room',
          '/create private name pass — create E2EE room',
          '/theme <name>       — matrix|amber|cobalt|snow|vintage|dracula|spawn|merica',
          '/font <name>        — Courier New|IBM Plex Mono|Fira Code|JetBrains Mono|Lucida Console',
          '/trivia             — ask one random question (30s)',
          '/trivia start|stop  — continuous trivia game',
          '/list               — public rooms and user counts',
          '/users [#room]      — users currently in a room',
          '/boards             — list message boards',
          '/board create Name  — create board',
          '/threads Board      — list threads',
          '/thread create Board Title',
          '/posts <id>         — list posts',
          '/post <id> body     — reply to thread',
          '/logout             — clear session',
          '/room <name>        — switch active room'
        ].join('\n'));
        break;

      case 'nick': {
        const arg = line.slice(5).trim();
        const trip = await parseTripcode(arg);
        if (!trip) {
          if (arg.includes('!')) {
            writelnSystem('Cannot paste a tripcode. Use /nick YourName#secret', true);
          } else {
            writelnSystem('Usage: /nick YourName#secret', true);
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
        const joinParts = rest.split(/\s+/);
        let room = joinParts[0];
        if (!room) {
          writelnSystem('Usage: /join #room OR /join roomname password', true);
          return;
        }
        if (!room.startsWith('#')) room = '#' + room;
        room = room.toLowerCase();
        if (joinParts.length >= 2) {
          const pass = joinParts.slice(1).join(' ');
          const key = await deriveKey(pass, room);
          roomKeys.set(room, key);
          writelnSystem('Encryption key derived for ' + room);
        }
        currentRoom = room;
        send({ type: 'join', room });
        break;
      }

      case 'part': {
        const room = (parts[1] || currentRoom).toLowerCase();
        send({ type: 'part', room });
        if (room === currentRoom) currentRoom = '#lobby';
        break;
      }

      case 'create': {
        if (parts[1] !== 'private' || parts.length < 4) {
          writelnSystem('Usage: /create private <name> <password>', true);
          return;
        }
        const name = parts[2];
        const pass = parts.slice(3).join(' ');
        const room = ('#' + name).toLowerCase();
        const key = await deriveKey(pass, room);
        roomKeys.set(room, key);
        currentRoom = room;
        send({ type: 'create_room', name, encrypted: true });
        break;
      }

      case 'theme': {
        const name = parts[1];
        if (!name || !THEMES[name]) {
          writelnSystem('Themes: ' + Object.keys(THEMES).join(', '), true);
          return;
        }
        applyTheme(name);
        send({ type: 'theme', theme: name });
        writelnSystem('Theme set to ' + name);
        break;
      }

      case 'font': {
        const name = line.match(/\/font\s+"([^"]+)"/)?.[1] || parts.slice(1).join(' ');
        if (!name || !FONTS[name]) {
          writelnSystem('Fonts: ' + Object.keys(FONTS).join(', '), true);
          return;
        }
        applyFont(name);
        fitTerminals();
        send({ type: 'font', font: name });
        writelnSystem('Font set to ' + name);
        break;
      }

      case 'trivia': {
        const action = (parts[1] || '').toLowerCase();
        if (!action) {
          send({ type: 'trivia_once', room: currentRoom });
        } else if (action === 'start') {
          send({ type: 'trivia_start', room: currentRoom });
        } else if (action === 'stop') {
          send({ type: 'trivia_stop', room: currentRoom });
        } else {
          writelnSystem('Usage: /trivia | /trivia start | /trivia stop', true);
        }
        break;
      }

      case 'list':
        send({ type: 'list' });
        break;

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
          writelnSystem('Usage: /board create <name>', true);
        }
        break;

      case 'threads':
        if (parts[1]) send({ type: 'thread_list', board: parts.slice(1).join(' ') });
        else writelnSystem('Usage: /threads <board>', true);
        break;

      case 'thread':
        if (parts[1] === 'create' && parts.length >= 4) {
          send({ type: 'thread_create', board: parts[2], title: parts.slice(3).join(' ') });
        } else {
          writelnSystem('Usage: /thread create <board> <title>', true);
        }
        break;

      case 'posts':
        if (parts[1]) send({ type: 'post_list', thread: parts[1] });
        else writelnSystem('Usage: /posts <thread_id>', true);
        break;

      case 'post':
        if (parts[1]) {
          send({ type: 'post_create', thread: parts[1], body: parts.slice(2).join(' ') });
        } else {
          writelnSystem('Usage: /post <thread_id> <body>', true);
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
          currentRoom = parts[1].startsWith('#') ? parts[1].toLowerCase() : ('#' + parts[1]).toLowerCase();
          writelnSystem('Active room: ' + currentRoom);
        }
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
