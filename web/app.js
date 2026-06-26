(function () {
  'use strict';

  const SETTINGS_KEY = 'doomchat_settings';
  const RECONNECT_DELAY_MS = 2000;
  const MAX_RECONNECTS = 10;

  const THEMES = {
    matrix:  { bg: '#000000', fg: '#00FF00', system: '#00AA00', error: '#FF0000', highlight: '#00FF00' },
    amber:   { bg: '#000000', fg: '#FFB000', system: '#CC8800', error: '#FF4444', highlight: '#FFD700' },
    cobalt:  { bg: '#000000', fg: '#4488FF', system: '#3366CC', error: '#FF6666', highlight: '#66AAFF' },
    snow:    { bg: '#000000', fg: '#FFFFFF', system: '#AAAAAA', error: '#FF4444', highlight: '#FFFFFF' },
    vintage: { bg: '#2B1B0E', fg: '#33FF33', system: '#228B22', error: '#FF6666', highlight: '#55FF55' },
    dracula: { bg: '#282a36', fg: '#f8f8f2', system: '#bd93f9', error: '#ff5555', highlight: '#50fa7b' },
    spawn:   { bg: '#0a0a0a', fg: '#39FF14', system: '#8B0000', error: '#FF2200', highlight: '#C0C0C0' }
  };

  const FONTS = {
    'Courier New': '"Courier New", Courier, monospace',
    'IBM Plex Mono': '"IBM Plex Mono", monospace',
    'Fira Code': '"Fira Code", monospace',
    'JetBrains Mono': '"JetBrains Mono", monospace',
    'Lucida Console': '"Lucida Console", "Lucida Sans Typewriter", monospace'
  };

  const BANNER = [
    ' ██████╗  ██████╗  ██████╗ ███╗   ███╗ ██████╗██╗  ██╗ █████╗ ████████╗    ██╗██╗',
    ' ██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║██╔════╝██║  ██║██╔══██╗╚══██╔══╝    ██║██║',
    ' ██║  ██║██║   ██║██║   ██║██╔████╔██║██║     ███████║███████║   ██║       ██║██║',
    ' ██║  ██║██║   ██║██║   ██║██║╚██╔╝██║██║     ██╔══██║██╔══██║   ██║       ╚═╝╚═╝',
    ' ██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║╚██████╗██║  ██║██║  ██║   ██║       ██╗██╗',
    ' ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝       ╚═╝╚═╝',
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

  let settings = loadSettings();
  let ws = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let currentRoom = '#lobby';
  let fullNick = '';
  const roomKeys = new Map();

  const statusEl = document.getElementById('status');
  const inputEl = document.getElementById('cmd-input');

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

  window.addEventListener('resize', fitTerminals);
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
      setStatus('connected');
      writelnSystem('Connected.');
      showBanner();
      send({
        type: 'hello',
        session_id: settings.session_id,
        nick: fullNick || undefined,
        theme: settings.theme,
        font: settings.font
      });
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
        await handleChatMessage(msg);
        break;
      case 'system':
        writelnSystem(msg.text);
        break;
      case 'error':
        writelnSystem(msg.text, true);
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
          writelnChat('[Trivia] ' + msg.winner + ' got it! Answer: ' + msg.answer);
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

  async function handleChatMessage(msg) {
    let text = msg.text;
    const room = msg.room || currentRoom;
    if (isEncryptedRoom(room)) {
      try {
        const key = roomKeys.get(room);
        if (key) text = await decryptText(text, key);
        else text = '[encrypted]';
      } catch (_) {
        writelnSystem('Failed to decrypt message in ' + room, true);
        return;
      }
    }
    const line = '<' + msg.nick + '> ' + text;
    writelnChat(line);
  }

  function writelnChat(text) {
    chatTerm.writeln(text);
  }

  function writelnSystem(text, isError) {
    if (isError) systemTerm.writeln('\x1b[31m' + text + '\x1b[0m');
    else systemTerm.writeln(text);
  }

  function formatScores(scores) {
    if (!scores) return '(none)';
    return Object.entries(scores).map(([k, v]) => k + ': ' + v).join(', ');
  }

  function formatRoomList(list) {
    if (!list || !list.length) return '(none)';
    return list.map(r => r.name + ' (' + r.count + ')').join(', ');
  }

  function showBanner() {
    if (sessionStorage.getItem('doomchat_banner_shown')) return;
    sessionStorage.setItem('doomchat_banner_shown', '1');
    BANNER.forEach(line => chatTerm.writeln(line));
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
      await handleCommand(line);
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
          '/theme <name>       — matrix|amber|cobalt|snow|vintage|dracula|spawn',
          '/font <name>        — Courier New|IBM Plex Mono|Fira Code|JetBrains Mono|Lucida Console',
          '/trivia             — ask one random question (30s)',
          '/trivia start|stop  — continuous trivia game',
          '/list               — public rooms and user counts',
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
          writelnSystem('Usage: /nick YourName#secret', true);
          return;
        }
        fullNick = trip.display;
        settings.last_nick = trip.name;
        saveSettings();
        send({ type: 'nick', nick: fullNick });
        writelnSystem('Nick set locally to ' + fullNick);
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
    const data = new TextEncoder().encode(secret);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function deriveKey(password, room) {
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
