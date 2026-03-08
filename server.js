<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
  <title>ghost. — anonymous messages</title>
  <meta name="theme-color" content="#0a0a0f"/>
  <meta name="mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
  <meta name="apple-mobile-web-app-title" content="ghost."/>
  <link rel="manifest" href="/manifest.json"/>
  <link rel="apple-touch-icon" href="/icon-192.png"/>
  <script src="https://anonymsgn.onrender.com/socket.io/socket.io.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      min-height: -webkit-fill-available;
      background: #0a0a0f;
      font-family: 'Space Mono', monospace;
      color: #e0d8cc;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }

    body::before {
      content: '';
      position: fixed; inset: 0;
      pointer-events: none; z-index: 0; opacity: 0.4;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
    }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: #111; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

    /* Setup */
    #setup-screen {
      position: fixed; inset: 0; background: #0a0a0f; z-index: 100;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }

    #setup-box {
      width: 100%; max-width: 420px;
      border: 1px solid #1e1e2a; border-radius: 12px;
      padding: 32px; background: #0e0e16;
    }

    #setup-box h2 {
      font-family: 'Playfair Display', serif;
      font-style: italic; font-size: 26px; font-weight: 400; margin-bottom: 4px;
    }

    #setup-box p { font-size: 11px; color: #555; letter-spacing: 1px; margin-bottom: 24px; text-transform: uppercase; }

    .field-label {
      font-size: 10px; color: #555; letter-spacing: 2px;
      text-transform: uppercase; margin-bottom: 6px; display: block;
    }

    .setup-input {
      width: 100%; background: #111118; border: 1px solid #222230;
      border-radius: 6px; padding: 12px; color: #e0d8cc;
      font-family: 'Space Mono', monospace; font-size: 16px; margin-bottom: 12px;
      transition: border-color 0.2s;
    }
    .setup-input:focus { outline: none; border-color: #6b5a46; }
    .setup-input::placeholder { color: #333; }

    .lock-hint {
      font-size: 10px; color: #3a3a4a; letter-spacing: 1px;
      margin-bottom: 14px; margin-top: -8px;
    }

    #setup-error { font-size: 11px; color: #8a4a3a; margin-bottom: 12px; min-height: 16px; letter-spacing: 1px; }

    #start-btn {
      width: 100%; background: transparent; border: 1px solid #4a3a2a;
      color: #9a8a7a; border-radius: 6px; padding: 14px;
      font-family: 'Space Mono', monospace; font-size: 12px; cursor: pointer;
      letter-spacing: 2px; text-transform: uppercase; transition: all 0.2s;
    }
    #start-btn:hover:not(:disabled) { background: #c8b49a; color: #0a0a0f; }
    #start-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .server-info {
      margin-top: 14px; font-size: 10px; color: #2a2a3a;
      letter-spacing: 1px; text-align: center; padding: 8px;
      border: 1px solid #1a1a22; border-radius: 6px;
    }

    /* Connecting */
    #connecting {
      display: none; position: fixed; inset: 0;
      background: #0a0a0f; z-index: 200;
      align-items: center; justify-content: center; flex-direction: column; gap: 16px;
    }
    #connecting.show { display: flex; }
    .spinner {
      width: 32px; height: 32px; border: 2px solid #222;
      border-top-color: #6b5a46; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #connecting p { font-size: 11px; color: #444; letter-spacing: 2px; text-transform: uppercase; }

    /* App */
    #app {
      width: 100%; max-width: 640px; display: none;
      flex-direction: column; height: 100vh;
      height: -webkit-fill-available; position: relative; z-index: 1;
    }

    #header {
      padding: 16px 20px 12px; border-bottom: 1px solid #1e1e2a;
      background: #0a0a0f; z-index: 10; flex-shrink: 0;
    }

    .header-top { display: flex; align-items: center; justify-content: space-between; }

    #header h1 {
      font-family: 'Playfair Display', serif;
      font-style: italic; font-size: 24px; font-weight: 400;
    }

    .header-actions { display: flex; align-items: center; gap: 8px; }

    #room-badge {
      font-size: 10px; color: #555; letter-spacing: 2px;
      text-transform: uppercase; border: 1px solid #222; padding: 3px 8px; border-radius: 4px;
    }

    #mute-btn {
      background: transparent; border: 1px solid #222; color: #555;
      border-radius: 6px; padding: 4px 8px; font-size: 14px;
      cursor: pointer; transition: all 0.2s;
    }
    #mute-btn:hover { border-color: #4a3a2a; color: #9a8a7a; }
    #mute-btn.muted { opacity: 0.4; }

    #identity { margin-top: 4px; font-size: 11px; color: #3a3a4a; display: flex; align-items: center; gap: 6px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: #3a5a3a; display: inline-block; }
    #identity span.name { color: #7a6a5a; }
    #timer-badge { margin-left: auto; font-size: 10px; color: #3a3a2a; letter-spacing: 1px; }

    /* Messages */
    #messages {
      flex: 1; padding: 16px; display: flex; flex-direction: column;
      overflow-y: auto; -webkit-overflow-scrolling: touch;
    }

    .msg-wrap {
      display: flex; flex-direction: column; margin-bottom: 10px;
      animation: fadeSlide 0.3s ease forwards;
    }
    .msg-wrap.mine { align-items: flex-end; }
    .msg-wrap.theirs { align-items: flex-start; }

    @keyframes fadeSlide {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .msg-meta { font-size: 10px; color: #3a3a4a; margin-bottom: 4px; letter-spacing: 1px; text-transform: uppercase; }

    .msg-bubble {
      max-width: 80%; padding: 10px 14px;
      font-family: 'Space Mono', monospace; font-size: 13px;
      line-height: 1.6; word-break: break-word;
      position: relative; cursor: pointer;
    }

    .mine .msg-bubble {
      background: #1e1a14; border: 1px solid #3a2e22;
      border-radius: 12px 12px 2px 12px; color: #d4c8b4;
    }
    .theirs .msg-bubble {
      background: #13131c; border: 1px solid #1e1e2e;
      border-radius: 12px 12px 12px 2px; color: #c0b8cc;
    }

    .msg-bubble:hover { opacity: 0.9; }

    /* Reactions */
    .reactions {
      display: flex; flex-wrap: wrap; gap: 4px;
      margin-top: 4px; max-width: 80%;
    }

    .reaction-pill {
      background: #1a1a24; border: 1px solid #2a2a3a;
      border-radius: 12px; padding: 2px 8px;
      font-size: 12px; cursor: pointer;
      transition: all 0.15s; user-select: none;
    }
    .reaction-pill:hover { background: #2a2a3a; }
    .reaction-pill.mine-reaction { border-color: #4a3a2a; background: #1e1a14; }

    /* Emoji picker */
    .emoji-picker {
      display: none; position: absolute;
      bottom: calc(100% + 6px);
      background: #0e0e16; border: 1px solid #2a2a3a;
      border-radius: 10px; padding: 8px;
      z-index: 50; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      flex-wrap: wrap; gap: 4px; width: 180px;
    }
    .mine .emoji-picker { right: 0; }
    .theirs .emoji-picker { left: 0; }
    .emoji-picker.open { display: flex; }

    .emoji-opt {
      font-size: 18px; padding: 4px; cursor: pointer;
      border-radius: 6px; transition: background 0.15s;
    }
    .emoji-opt:hover { background: #2a2a3a; }

    .system-msg {
      text-align: center; font-size: 10px; color: #333;
      letter-spacing: 1px; padding: 4px 0 12px; text-transform: uppercase;
    }

    /* Input */
    #input-area {
      padding: 12px 16px;
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
      border-top: 1px solid #1e1e2a; background: #0a0a0f;
      z-index: 10; flex-shrink: 0;
    }

    #flash { font-size: 11px; color: #5a8a5a; margin-bottom: 6px; letter-spacing: 1px; min-height: 14px; }

    .input-row { display: flex; gap: 8px; align-items: flex-end; }

    #msg-input {
      flex: 1; background: #111118; border: 1px solid #222230;
      border-radius: 8px; padding: 10px 12px; color: #e0d8cc;
      font-family: 'Space Mono', monospace; font-size: 16px;
      resize: none; line-height: 1.5; transition: border-color 0.2s; height: 56px;
    }
    #msg-input:focus { outline: none; border-color: #6b5a46; }
    #msg-input::placeholder { color: #333; }

    .input-side { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
    #char-count { font-size: 10px; color: #333; letter-spacing: 1px; }
    #char-count.warn { color: #8a4a3a; }

    #send-btn {
      background: transparent; border: 1px solid #4a3a2a; color: #9a8a7a;
      border-radius: 6px; padding: 10px 12px; font-family: 'Space Mono', monospace;
      font-size: 11px; cursor: pointer; letter-spacing: 1px;
      text-transform: uppercase; transition: all 0.2s; white-space: nowrap; min-height: 44px;
    }
    #send-btn:hover:not(:disabled) { background: #c8b49a; color: #0a0a0f; }
    #send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Toast notification */
    #toast {
      position: fixed; bottom: 90px; left: 50%;
      transform: translateX(-50%);
      background: #1e1a14; border: 1px solid #4a3a2a;
      border-radius: 8px; padding: 10px 18px;
      font-size: 12px; color: #d4c8b4; letter-spacing: 1px;
      z-index: 500; opacity: 0; pointer-events: none;
      transition: opacity 0.3s; white-space: nowrap;
    }
    #toast.show { opacity: 1; }

    /* Lock icon on room badge */
    .locked-badge::before { content: "🔒 "; }
  </style>
</head>
<body>

<!-- Connecting -->
<div id="connecting">
  <div class="spinner"></div>
  <p id="connecting-text">waking up server...</p>
</div>

<!-- Toast -->
<div id="toast"></div>

<!-- Setup -->
<div id="setup-screen">
  <div id="setup-box">
    <h2>ghost.</h2>
    <p>anonymous real-time chat</p>

    <label class="field-label">Room Name</label>
    <input class="setup-input" id="room-name" placeholder="e.g. my-secret-room" autofocus/>

    <label class="field-label">Room Password <span style="color:#2a2a3a">(optional)</span></label>
    <input class="setup-input" id="room-password" type="password" placeholder="leave empty for public room"/>
    <p class="lock-hint">🔒 Set a password to make the room private</p>

    <div id="setup-error"></div>
    <button id="start-btn">Enter →</button>

    <div class="server-info">⚡ anonymsgn.onrender.com</div>
  </div>
</div>

<!-- App -->
<div id="app">
  <div id="header">
    <div class="header-top">
      <h1>ghost.</h1>
      <div class="header-actions">
        <span id="room-badge">—</span>
        <button id="mute-btn" title="Toggle sound">🔔</button>
      </div>
    </div>
    <div id="identity">
      <span class="dot"></span>
      You are <span class="name" id="my-name"></span>
      <span id="timer-badge">🗑️ msgs delete in 24h</span>
    </div>
  </div>

  <div id="messages">
    <div class="system-msg" id="loading">joining room...</div>
  </div>

  <div id="input-area">
    <div id="flash"></div>
    <div class="input-row">
      <textarea id="msg-input" placeholder="whisper something..." maxlength="280"></textarea>
      <div class="input-side">
        <span id="char-count">0/280</span>
        <button id="send-btn" disabled>send →</button>
      </div>
    </div>
  </div>
</div>

<script>
  const SERVER_URL = "https://anonymsgn.onrender.com";
  const EMOJIS = ["👻","❤️","😂","😮","😢","🔥","👍","👎"];
  const ADJECTIVES = ["Silent","Shadow","Hollow","Ashen","Drifting","Nameless","Veiled","Pale","Lost","Echoing"];
  const ANIMALS    = ["Fox","Wolf","Bear","Owl","Hawk","Lynx","Deer","Crow","Moth","Viper","Raven","Ghost"];

  function getAnonId() {
    let id = sessionStorage.getItem("anonId");
    if (!id) { id = Math.random().toString(36).slice(2, 9); sessionStorage.setItem("anonId", id); }
    return id;
  }

  function getAnonName(id) {
    const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return `${ADJECTIVES[hash % ADJECTIVES.length]} ${ANIMALS[(hash * 7) % ANIMALS.length]}`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return "just now";
    if (diff < 60) return diff + "s ago";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    return Math.floor(diff / 3600) + "h ago";
  }

  const MY_ID   = getAnonId();
  const MY_NAME = getAnonName(MY_ID);

  // 🔔 Sound notification
  let muted = false;

  function playNotif() {
    if (muted) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  }

  document.getElementById("mute-btn").addEventListener("click", () => {
    muted = !muted;
    const btn = document.getElementById("mute-btn");
    btn.textContent = muted ? "🔕" : "🔔";
    btn.classList.toggle("muted", muted);
    showToast(muted ? "Sound off" : "Sound on");
  });

  // Toast helper
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
  }

  // PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // Setup
  const startBtn  = document.getElementById("start-btn");
  const roomInput = document.getElementById("room-name");
  const passInput = document.getElementById("room-password");
  const errEl     = document.getElementById("setup-error");
  const connecting = document.getElementById("connecting");
  const connectText = document.getElementById("connecting-text");

  startBtn.addEventListener("click", connect);
  roomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") passInput.focus(); });
  passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });

  function connect() {
    const room = roomInput.value.trim().replace(/\s+/g, "-").toLowerCase();
    const password = passInput.value.trim();
    if (!room) { errEl.textContent = "⚠ Please enter a room name"; return; }

    errEl.textContent = "";
    startBtn.disabled = true;
    startBtn.textContent = "Connecting...";
    connecting.classList.add("show");
    connectText.textContent = "connecting...";

    let attempts = 0;

    function tryConnect() {
      attempts++;
      connectText.textContent = attempts > 1 ? `retrying... (${attempts}/3)` : "connecting...";

      const socket = io(SERVER_URL, {
        timeout: 20000,
        reconnectionAttempts: 5,
        transports: ["websocket", "polling"]
      });

      let connected = false;

      socket.on("connect", () => {
        connected = true;
        socket.emit("join_room", { room, password });
      });

      // 🔒 Wrong password
      socket.on("wrong_password", () => {
        connecting.classList.remove("show");
        socket.disconnect();
        errEl.textContent = "⚠ Wrong password for this room!";
        startBtn.disabled = false;
        startBtn.textContent = "Enter →";
      });

      socket.on("load_messages", (messages) => {
        connecting.classList.remove("show");
        document.getElementById("setup-screen").style.display = "none";
        const appEl = document.getElementById("app");
        appEl.style.display = "flex";

        const badge = document.getElementById("room-badge");
        badge.textContent = (password ? "🔒 " : "") + room;
        document.getElementById("my-name").textContent = MY_NAME;

        const msgBox = document.getElementById("messages");
        document.getElementById("loading")?.remove();

        if (messages.length === 0) {
          addSystem("be the first to speak", msgBox);
        } else {
          messages.forEach(msg => renderMessage(msg, msgBox, socket, room));
          msgBox.scrollTop = msgBox.scrollHeight;
        }

        setupChat(socket, room, msgBox);
      });

      socket.on("connect_error", () => {
        if (!connected) {
          if (attempts < 3) {
            setTimeout(tryConnect, 5000);
          } else {
            connecting.classList.remove("show");
            errEl.textContent = "⚠ Cannot connect. Try again.";
            startBtn.disabled = false;
            startBtn.textContent = "Enter →";
          }
        }
      });
    }

    tryConnect();
  }

  function setupChat(socket, room, msgBox) {
    const input    = document.getElementById("msg-input");
    const sendBtn  = document.getElementById("send-btn");
    const charSpan = document.getElementById("char-count");
    const flash    = document.getElementById("flash");

    // New message from others
    socket.on("new_message", (msg) => {
      if (msg.anonId !== MY_ID) {
        renderMessage(msg, msgBox, socket, room);
        msgBox.scrollTop = msgBox.scrollHeight;
        playNotif(); // 🔔 sound
        showToast("new message 👻");
      }
    });

    // 😀 Reaction updates
    socket.on("update_reactions", ({ msgId, reactions }) => {
      const el = document.querySelector(`[data-msg-id="${msgId}"] .reactions`);
      if (el) renderReactions(el, reactions, msgId, socket, room);
    });

    socket.on("system_message", (data) => addSystem(data.text, msgBox));

    socket.on("disconnect", () => addSystem("disconnected...", msgBox));
    socket.on("reconnect", () => {
      addSystem("reconnected ✓", msgBox);
      socket.emit("join_room", { room, password: passInput.value.trim() });
    });

    input.addEventListener("focus", () => {
      setTimeout(() => msgBox.scrollTop = msgBox.scrollHeight, 300);
    });

    input.addEventListener("input", () => {
      const len = input.value.length;
      charSpan.textContent = len + "/280";
      charSpan.className   = len > 240 ? "warn" : "";
      sendBtn.disabled     = input.value.trim().length === 0;
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage();
      }
    });

    sendBtn.addEventListener("click", sendMessage);

    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      const tempMsg = { id: Date.now().toString(), text, anonId: MY_ID, anonName: MY_NAME, ts: Date.now(), reactions: {} };
      renderMessage(tempMsg, msgBox, socket, room);
      msgBox.scrollTop = msgBox.scrollHeight;
      socket.emit("send_message", { room, text, anonId: MY_ID, anonName: MY_NAME });
      input.value = "";
      charSpan.textContent = "0/280";
      ch
