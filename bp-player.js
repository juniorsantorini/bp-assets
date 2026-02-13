(function () {
  'use strict';

  // =========================
  // STORAGE KEYS
  // =========================
  var LS_KEY_STATE = "bp_player_state_v5";
  var LS_KEY_MINIMIZED = "bp_player_minimized";
  var LS_KEY_META = "bp_nowplaying_meta_v1";

  // Playlist do drawer
  var LS_KEY_QUEUE = "bp_queue_final2";

  // Modo de navegação do player
  // "playlist" | "page" | (vazio = AUTO)
  var LS_KEY_MODE = "bp_player_nav_mode_v1";

  // =========================
  // CONFIG
  // =========================
  var SEMITONE_UP = Math.pow(2, 133 / 1200); // +133 cents
  var state = { url: "", time: 0, playing: false, volume: 0.9, pitch: 0 };
  var isMinimized = false;

  // ✅ MODIFICAÇÃO 1: tenta usar áudio pré-carregado (e reutiliza singleton)
  var audio = null;

  // ✅ MOBILE FIX: se já existe um <audio> do BP_GLOBAL, reutiliza.
  // Isso evita o bug "tocando... mas esqueceu a playlist" quando troca de página rápido (principalmente no celular).
  if (window.BP_GLOBAL && window.BP_GLOBAL.__audio && (window.BP_GLOBAL.__audio instanceof HTMLAudioElement)) {
    audio = window.BP_GLOBAL.__audio;
  } else if (window._bpPreloadAudio && (window._bpPreloadAudio instanceof HTMLAudioElement)) {
    audio = window._bpPreloadAudio;
    // não deletar aqui pra não perder referência em navegação agressiva
  } else {
    audio = new Audio();
  }
  audio.preload = "metadata";

  // =========================
  // Anti-pause indevido (boot/primeira música)
  // =========================
  var __bpAutoPauseLockUntil = 0;
  var __bpAllowPause = false;
  var __bpOrigPause = null;

  function __bpLockAutoPause(ms){
    __bpAutoPauseLockUntil = Date.now() + (ms || 0);
  }
  function __bpCanAutoPause(){
    return Date.now() >= __bpAutoPauseLockUntil;
  }

  // Protege contra pause() disparado por fluxos automáticos logo após o play iniciar
  try {
    if (audio && typeof audio.pause === "function") {
      __bpOrigPause = audio.pause.bind(audio);
      audio.pause = function(){
        if (!__bpAllowPause && !__bpCanAutoPause()) {
          return;
        }
        return __bpOrigPause();
      };
    }
  } catch (e) {}


  var DOWNLOAD_PREFIX = "https://download.borapracima.site/";
  function isAllowed(url) { return !!url && url.indexOf(DOWNLOAD_PREFIX) === 0; }
  
  function __bpIsHomePagination(){
    if (location.pathname === "/" || location.pathname === "") return true;
    if (location.pathname !== "/search") return false;
    // Blogger paginação: /search?...#PageNo=2 (e variações)
    if (/#PageNo=\d+/i.test(location.hash || "")) return true;
    if (/[?&]updated-max=/i.test(location.search || "")) return true;
    return false;
  }
function warnBlocked() { try { alert("Áudio bloqueado"); } catch (e) {} }

  // pitch flags
  try { audio.preservesPitch = false; } catch (e) {}
  try { audio.mozPreservesPitch = false; } catch (e) {}
  try { audio.webkitPreservesPitch = false; } catch (e) {}

  // UI refs
  var UI = {
    root: null, wrap: null, toggleBtn: null,
    cover: null, title: null, artist: null,
    play: null, prev: null, next: null,
    vol: null, prog: null, time: null, dur: null,
    pitch: null
  };

  // =========================
  // HELPERS
  // =========================
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  function saveState() { try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(state)); } catch (e) {} }
  function saveMin() { try { localStorage.setItem(LS_KEY_MINIMIZED, JSON.stringify(isMinimized)); } catch (e) {} }

  function loadMin() {
    try {
      var v = JSON.parse(localStorage.getItem(LS_KEY_MINIMIZED));
      if (typeof v === "boolean") isMinimized = v;
    } catch (e) {}
  }

  function loadState() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_KEY_STATE));
      if (o && typeof o === "object") {
        state.url = o.url || "";
        state.time = Number(o.time || 0) || 0;
        state.playing = !!o.playing;
        state.volume = (typeof o.volume === "number") ? o.volume : 0.9;
        state.pitch = (o.pitch === 1) ? 1 : 0;
      }
    } catch (e) {}
  }

  function saveMeta(meta) {
    try {
      localStorage.setItem(LS_KEY_META, JSON.stringify({
        title: meta && meta.title ? String(meta.title) : "",
        artist: meta && meta.artist ? String(meta.artist) : "",
        cover: meta && meta.cover ? String(meta.cover) : ""
      }));
    } catch (e) {}
  }

  function loadMeta() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_KEY_META));
      if (o && typeof o === "object") return o;
    } catch (e) {}
    return { title: "", artist: "", cover: "" };
  }

  function applyVolume() {
    var v = Math.min(1, Math.max(0, Number(state.volume) || 0));
    var cap = 0.94;

    // guerra
    try {
      var card = findCardByUrl(state.url);
      var a = card ? (card.getAttribute("data-artist") || "") : "";
      a = a.toLowerCase();
      if (a.indexOf("junior santorini") !== -1 || a.indexOf("jr santorini") !== -1) cap = 1;
    } catch (e) {}

    audio.volume = Math.min(1, Math.max(0, v * cap));
    if (UI.vol) UI.vol.value = String(Math.round(100 * v));
  }

  function applyPitch() {
    try { audio.preservesPitch = false; } catch (e) {}
    try { audio.mozPreservesPitch = false; } catch (e) {}
    try { audio.webkitPreservesPitch = false; } catch (e) {}
    audio.playbackRate = (state.pitch === 1) ? SEMITONE_UP : 1;
    if (UI.pitch) UI.pitch.classList.toggle("is-on", state.pitch === 1);
  }

  // =========================
  // MODE: playlist/page (com AUTO)
  // =========================
  function getModeRaw() {
    try { return localStorage.getItem(LS_KEY_MODE) || ""; }
    catch (e) { return ""; }
  }

  function getMode() {
    var m = getModeRaw();
    return (m === "playlist" || m === "page") ? m : ""; // "" = AUTO
  }

  // ✅ NOVO (mínimo): trava de navegação em AUTO quando clique veio da página (HOME)
  // - "page": Prev/Next usa a lista da página mesmo se a faixa estiver na playlist
  // - "": comportamento normal
  var navLock = "";

  function setMode(m) {
    var oldMode = getMode();
    var newMode = "";

    try {
      if (m === "playlist" || m === "page") {
        localStorage.setItem(LS_KEY_MODE, m);
        newMode = m;
      } else {
        localStorage.removeItem(LS_KEY_MODE); // volta pro AUTO
        newMode = "";
      }
    } catch (e) {}

    // ✅ se o modo vira explícito (playlist/page), solta o lock
    if (newMode !== "") navLock = "";

    if (oldMode !== newMode) {
      lastMode = newMode;
      showModeToast(newMode);
    }
  }


  // compara pelo basename pra sobreviver a ?token etc
  function sameTrack(a, b) {
    if (!a || !b) return false;
    var A = String(a).split("?")[0];
    var B = String(b).split("?")[0];
    var aName = A.substring(A.lastIndexOf("/") + 1);
    var bName = B.substring(B.lastIndexOf("/") + 1);
    return !!aName && !!bName && (aName === bName);
  }

  function getQueueItems() {
    try {
      var raw = localStorage.getItem(LS_KEY_QUEUE);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function getQueueUrls() {
    var arr = getQueueItems();
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var u = arr[i] && arr[i].url ? String(arr[i].url) : "";
      if (u && out.indexOf(u) === -1) out.push(u);
    }
    return out;
  }

  function getQueueMetaByUrl(url) {
    if (!url) return { title:"", artist:"", cover:"" };
    var arr = getQueueItems();
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i] || {};
      if (it.url && sameTrack(it.url, url)) {
        return {
          title: it.title ? String(it.title) : "",
          artist: it.artist ? String(it.artist) : "",
          cover: it.cover ? String(it.cover) : ""
        };
      }
    }
    return { title:"", artist:"", cover:"" };
  }

  function getPageUrls() {
    var out = [];
    document.querySelectorAll(".music-card[data-audio-url]").forEach(function (card) {
      var u = card.getAttribute("data-audio-url") || "";
      if (u && out.indexOf(u) === -1) out.push(u);
    });
    return out;
  }

  function isCurrentInQueue() {
    if (!state.url) return false;
    var q = getQueueUrls();
    for (var i = 0; i < q.length; i++) {
      if (sameTrack(q[i], state.url)) return true;
    }
    return false;
  }

  // Lista atual usada por Prev/Next
  function getNavList() {
    var explicit = getMode(); // "playlist" | "page" | ""(AUTO)
    var q = getQueueUrls();
    var p = getPageUrls();

    if (explicit === "page") return p;

    if (explicit === "playlist") {
      if (q.length >= 2) return q;
      return p;
    }

    // ✅ AUTO com lock de página: Prev/Next segue a página (HOME), mesmo se a faixa existir na playlist
    if (navLock === "page") return p;

    // AUTO normal:
    if (q.length >= 2 && isCurrentInQueue()) return q;
    return p;
  }

  // =========================
  // UI create/minimize
  // =========================
  function toggleMin() { isMinimized = !isMinimized; saveMin(); applyMin(); }

  function applyMin() {
    if (!UI.root || !UI.wrap || !UI.toggleBtn) return;
    if (isMinimized) {
      UI.wrap.style.setProperty("display", "none", "important");
      UI.toggleBtn.innerHTML = "▲";
      UI.toggleBtn.setAttribute("title", "Maximizar player");
    } else {
      UI.wrap.style.removeProperty("display");
      UI.toggleBtn.innerHTML = "▼";
      UI.toggleBtn.setAttribute("title", "Minimizar player");
    }
  }

  function injectCSS() {
    if (document.getElementById("bp_global_player_css")) return;

    var s = document.createElement("style");
    s.id = "bp_global_player_css";
    s.textContent =
      "#bpGlobalPlayer{position:fixed;left:0;right:0;bottom:0;z-index:999999;background:#0b0b0b;color:#fff;border-top:1px solid rgba(255,255,255,.08);padding:8px 14px;font-family:inherit}" +
      "#bpGlobalPlayer .bp-toggle-container{position:relative;width:100%}" +
      "#bpGlobalPlayer .bp-toggle-btn{border:0;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;padding:4px 12px;border-radius:6px;font-size:11px;line-height:1;user-select:none;transition:all .15s ease;font-weight:700;opacity:.7;transform:translateY(-6px)}" +
      "#bpGlobalPlayer .bp-toggle-btn:hover{opacity:1;background:rgba(255,255,255,.18)}" +
      "#bpGlobalPlayer .bp-wrap{display:flex;align-items:center;gap:18px;min-height:56px}" +
      "#bpGlobalPlayer .bp-meta{display:flex;align-items:center;gap:10px;min-width:0}" +
      "#bpGlobalPlayer .bp-cover{width:44px;height:44px;border-radius:10px;overflow:hidden;background:rgba(255,255,255,.08);flex:0 0 auto}" +
      "#bpGlobalPlayer .bp-cover img{width:100%;height:100%;object-fit:cover;display:block}" +
      "#bpGlobalPlayer .bp-text{min-width:0}" +
      "#bpGlobalPlayer .bp-title{font-weight:700;font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#bpGlobalPlayer .bp-artist{font-size:12px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#bpGlobalPlayer .bp-controls{display:flex;align-items:center;gap:12px}" +
      "#bpGlobalPlayer button.bp-btn{border:0;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;padding:10px 12px;border-radius:999px;font-size:14px;line-height:1;user-select:none;transition:transform .1s ease}" +
      "#bpGlobalPlayer button.bp-btn:active{transform:scale(.95)}" +
      "#bpGlobalPlayer button.bp-btn[disabled]{opacity:.35;cursor:not-allowed}" +
      "#bpGlobalPlayer button.bp-btn.bp-main{font-weight:900;padding:12px 14px}" +
      "#bpGlobalPlayer .bp-progress{display:flex;align-items:center;gap:10px}" +
      "#bpGlobalPlayer .bp-time{font-size:11px;opacity:.85;width:42px;text-align:center;flex:0 0 auto}" +
      "#bpGlobalPlayer input[type=range]{-webkit-appearance:none;appearance:none;height:18px;background:transparent;cursor:pointer}" +
      "#bpGlobalPlayer input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:999px;background:rgba(255,255,255,.18)}" +
      "#bpGlobalPlayer input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:50%;background:#fff}" +
      "#bpGlobalPlayer input[type=range]::-moz-range-track{height:4px;border-radius:999px;background:rgba(255,255,255,.18)}" +
      "#bpGlobalPlayer input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:none}" +
      "#bpGlobalPlayer .bp-right{display:flex;align-items:center;gap:12px}" +
      "#bpGlobalPlayer .bp-vol{display:flex;align-items:center;gap:8px}" +
      "#bpGlobalPlayer .bp-vol span{font-size:12px;opacity:.85;font-weight:600;letter-spacing:.3px}" +
      "#bpGlobalPlayer .bp-pitch{font-size:12px;padding:10px 14px;letter-spacing:.5px;font-weight:600}" +
      "#bpGlobalPlayer .bp-pitch.is-on{background:#a40781;color:#0b0b0b;font-weight:900}" +
      "@media (min-width:701px){#bpGlobalPlayer .bp-toggle-container{text-align:center;margin-bottom:-12px}" +
      "#bpGlobalPlayer .bp-wrap{display:grid !important;grid-template-columns:1fr auto auto 1fr;align-items:center;column-gap:18px}" +
      "#bpGlobalPlayer .bp-meta{grid-column:1;justify-self:start;max-width:260px}" +
      "#bpGlobalPlayer .bp-title,#bpGlobalPlayer .bp-artist{max-width:220px}" +
      "#bpGlobalPlayer .bp-controls{grid-column:2;justify-self:end}" +
      "#bpGlobalPlayer .bp-progress{grid-column:3;justify-self:start}" +
      "#bpGlobalPlayer .bp-progress input[type=range]{width:620px}" +
      "#bpGlobalPlayer .bp-right{grid-column:4;justify-self:end;margin-right:20px}" +
      "#bpGlobalPlayer .bp-vol input[type=range]{width:110px}}" +
      "@media (max-width:700px){#bpGlobalPlayer{padding:12px 12px}" +
      "#bpGlobalPlayer .bp-toggle-container{text-align:right;margin-bottom:-10px}" +
      "#bpGlobalPlayer .bp-wrap{flex-wrap:wrap;gap:12px}" +
      "#bpGlobalPlayer .bp-meta{width:100%;flex:0 0 100%}" +
      "#bpGlobalPlayer .bp-title,#bpGlobalPlayer .bp-artist{max-width:75vw}" +
      "#bpGlobalPlayer .bp-progress{display:none !important}" +
      "#bpGlobalPlayer .bp-controls{width:100%;position:relative;justify-content:center}" +
      "#bpGlobalPlayer .bp-right{width:0;height:0;overflow:visible}" +
      "#bpGlobalPlayer .bp-pitch{position:absolute;left:0;top:67%;transform:translateY(-50%);font-size:11px;padding:9px 12px;letter-spacing:.4px}" +
      "#bpGlobalPlayer .bp-vol{position:absolute;right:0;top:67%;transform:translate(-20px,-50%);gap:6px}" +
      "#bpGlobalPlayer .bp-vol span{font-size:10px}" +
      "#bpGlobalPlayer .bp-vol input[type=range]{width:60px}}";

    document.head.appendChild(s);
  }

  function ensureUI() {
    if (UI.root) return;
    injectCSS();
    ensureToastCSS();
    var root = document.createElement("div");
    root.id = "bpGlobalPlayer";
    root.innerHTML =
      '<div class="bp-toggle-container"><button class="bp-toggle-icon" id="bpToggle" type="button" title="Minimizar player" aria-label="Minimizar player">▼</button></div>' +
      '<div class="bp-wrap">' +
        '<div class="bp-meta">' +
          '<div class="bp-cover"><img alt="Capa" /></div>' +
          '<div class="bp-text"><div class="bp-title">Nada tocando</div><div class="bp-artist"></div></div>' +
        '</div>' +
        '<div class="bp-controls">' +
          '<button class="bp-btn" id="bpPrev" type="button" title="Anterior">⏮</button>' +
          '<button class="bp-btn bp-main" id="bpPlay" type="button" title="Play/Pause">▶</button>' +
          '<button class="bp-btn" id="bpNext" type="button" title="Próxima">⏭</button>' +
        '</div>' +
        '<div class="bp-progress">' +
          '<div class="bp-time" id="bpTime">0:00</div>' +
          '<input id="bpProg" type="range" min="0" max="1000" value="0" />' +
          '<div class="bp-time" id="bpDur">0:00</div>' +
        '</div>' +
        '<div class="bp-right">' +
          '<button class="bp-btn bp-pitch" id="bpPitch" type="button" title="Speed (Modo Festa)">SPEED</button>' +
          '<div class="bp-vol"><span>VOL</span><input id="bpVol" type="range" min="0" max="100" value="90" /></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(root);

    UI.root = root;
    UI.wrap = root.querySelector(".bp-wrap");
    UI.toggleBtn = root.querySelector("#bpToggle");
    UI.cover = root.querySelector(".bp-cover img");
    UI.title = root.querySelector(".bp-title");
    UI.artist = root.querySelector(".bp-artist");
    UI.play = root.querySelector("#bpPlay");
    UI.prev = root.querySelector("#bpPrev");
    UI.next = root.querySelector("#bpNext");
    UI.vol = root.querySelector("#bpVol");
    UI.prog = root.querySelector("#bpProg");
    UI.time = root.querySelector("#bpTime");
    UI.dur = root.querySelector("#bpDur");
    UI.pitch = root.querySelector("#bpPitch");

    UI.toggleBtn.addEventListener("click", toggleMin);

    UI.play.addEventListener("click", function () {
      if (!state.url) return;
      if (audio.paused) playUrl(state.url);
      else pause();
    });

    UI.vol.addEventListener("input", function () {
      state.volume = (Number(UI.vol.value) || 0) / 100;
      applyVolume(); saveState();
    });

    UI.prog.addEventListener("change", function () {
      var d = audio.duration || 0;
      if (!(d > 0 && isFinite(d))) return;

      var desired = (Number(UI.prog.value) / 1000) * d;
      var seekableEnd = d;
      try {
        if (audio.seekable && audio.seekable.length) {
          seekableEnd = Math.min(seekableEnd, audio.seekable.end(audio.seekable.length - 1));
        }
      } catch (e) {}

      var safeEnd = Math.max(0, seekableEnd - 0.25);
      var t = Math.min(desired, safeEnd);

      try { audio.currentTime = t; } catch (e) {}
      state.time = audio.currentTime || t;
      saveState();
      paint();
    });

    UI.pitch.addEventListener("click", function () {
      state.pitch = (state.pitch === 1) ? 0 : 1;
      applyPitch(); saveState(); paint();
    });

    UI.prev.addEventListener("click", function () { step(-1); });
    UI.next.addEventListener("click", function () { step(1); });

    applyVolume();
    applyPitch();
    paint();
    updatePrevNextEnabled();
    loadMin();
    applyMin();
  }

  // =========================
  // Card lookup/meta
  // =========================
  function findCardByUrl(url) {
    if (!url) return null;
    var base = String(url).split("?")[0];
    var name = base.substring(base.lastIndexOf("/") + 1);

    var cards = document.querySelectorAll(".music-card[data-audio-url]");
    for (var i = 0; i < cards.length; i++) {
      var u = cards[i].getAttribute("data-audio-url") || "";
      if (!u) continue;
      var u0 = String(u).split("?")[0];
      var uName = u0.substring(u0.lastIndexOf("/") + 1);
      if (uName && name && uName === name) return cards[i];
    }
    return null;
  }

  function getMetaFromDom(url) {
    var card = findCardByUrl(url);
    if (!card) return { title: "", artist: "", cover: "" };

    var title = card.getAttribute("data-title") || "";
    if (!title) {
      var tEl = card.querySelector(".title");
      title = tEl ? (tEl.textContent || "").trim() : "";
    }

    var artist = card.getAttribute("data-artist") || "";
    if (!artist) {
      var mEl = card.querySelector(".meta");
      var mt = mEl ? (mEl.textContent || "").trim() : "";
      if (mt && mt.indexOf("•") !== -1) artist = mt.split("•")[0].trim();
    }

    var cover = "";
    var img = card.querySelector(".cover img");
    if (img) cover = img.getAttribute("src") || "";

    return { title: title, artist: artist, cover: cover };
  }

  function resolveMeta(url) {
    if (!url) return { title:"", artist:"", cover:"" };

    // 1) DOM (se existir na página)
    var m1 = getMetaFromDom(url);
    if (m1.title || m1.artist || m1.cover) return m1;

    // 2) QUEUE (corrige: pega o meta da fila ao navegar em outras páginas)
    var mQ = getQueueMetaByUrl(url);
    if (mQ && (mQ.title || mQ.artist || mQ.cover)) return mQ;

    // 3) meta salvo (último now playing) — ÚLTIMO recurso
    var m2 = loadMeta();
    return m2 && (m2.title || m2.artist || m2.cover) ? m2 : { title:"", artist:"", cover:"" };
  }

  // =========================
  // Paint UI + sync cards
  // =========================
  function syncCards() {
    document.querySelectorAll(".music-card").forEach(function (card) {
      var u = card.getAttribute("data-audio-url");
      var btn = card.querySelector(".play-btn");
      if (!btn) return;

      if (u && state.url && sameTrack(u, state.url) && state.playing && !audio.paused) {
        btn.textContent = "II";
        card.classList.add("is-playing");
      } else {
        btn.textContent = "▶";
        card.classList.remove("is-playing");
      }
    });
  }

  // =========================
  // 🔥 VERIFICAÇÃO DE ARTISTAS + TOASTS (INJETADO)
  // =========================
  function slugify(text) {
    if (!text) return "";
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function isArtistVerified(artistName) {
    if (!artistName) return false;

    var slug = slugify(artistName);
    var widget = document.getElementById("bp-artist-plans");
    if (!widget) return false;

    var spans = widget.querySelectorAll("span[data-slug]");
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      var dataSlug = span.getAttribute("data-slug");
      var dataPlan = span.getAttribute("data-plan");
      var dataExp = span.getAttribute("data-exp");

      if (dataSlug !== slug) continue;
      if (dataPlan !== "starter" && dataPlan !== "astro") continue;

      if (dataExp) {
        try {
          var expDate = new Date(dataExp);
          if (expDate < new Date()) continue;
        } catch (e) {
          continue;
        }
      }

      return true;
    }
    return false;
  }

  function renderArtistWithBadge(artistString) {
    if (!artistString) return "";

    // mantém o " • " e tudo após (ex: " • 2026" etc)
    var parts = String(artistString).split("•");
    var artistsPart = (parts[0] || "").trim();
    var restPart = parts.length > 1 ? " • " + parts.slice(1).join("•").trim() : "";

    // separa por vírgula e feat/ft
    var artists = artistsPart.split(/,|feat\.?|ft\.?/i);
    var result = [];

    for (var i = 0; i < artists.length; i++) {
      var artist = (artists[i] || "").trim();
      if (!artist) continue;

      var badge = isArtistVerified(artist)
        ? ' <span class="bp-verified-badge" title="Artista verificado" aria-label="Verificado"></span>'
        : '';

      result.push(escapeHtml(artist) + badge);
    }

    return result.join(", ") + escapeHtml(restPart);
  }

  // (segurança) evitar HTML injection na UI do artista
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // =========================
  // 🔥 SISTEMA DE TOASTS (INJETADO)
  // =========================
  var lastMode = "";

  function showModeToast(mode) {
    var toastEl = document.getElementById("bp-mode-toast");
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "bp-mode-toast";
      toastEl.className = "bp-mode-toast";
      document.body.appendChild(toastEl);
    }

    var messages = {
      "playlist": {
        title: "Modo playlist ativado",
        subtitle: "Tocando sua playlist • Para voltar à Home, toque uma faixa na Home"
      },
      "": {
        title: "Explorando a Home",
        subtitle: "Tocando as faixas da página • Para voltar à Playlist, toque uma faixa na Playlist"
      },
      "page": {
        title: "Modo artista ativado",
        subtitle: "Tocando todas as faixas deste artista"
      }
    };

    var msg = messages.hasOwnProperty(mode) ? messages[mode] : messages[""];

    toastEl.innerHTML =
      '<div class="bp-toast-title">' + msg.title + '</div>' +
      '<div class="bp-toast-subtitle">' + msg.subtitle + '</div>';

    toastEl.classList.add("show");

    setTimeout(function () {
      toastEl.classList.remove("show");
    }, 6500);
  }

  function ensureToastCSS() {
    if (document.getElementById("bp_toast_css")) return;

    var s = document.createElement("style");
    s.id = "bp_toast_css";
    s.textContent =
      ".bp-mode-toast{position:fixed;bottom:120px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(30,30,30,.95);color:#fff;padding:16px 24px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:999998;min-width:300px;max-width:90vw;opacity:0;transition:all .3s ease;pointer-events:none}" +
      ".bp-mode-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}" +
      ".bp-toast-title{font-size:14px;font-weight:700;margin-bottom:4px}" +
      ".bp-toast-subtitle{font-size:12px;opacity:.8;line-height:1.4}" +
      ".bp-verified-badge{display:inline-block;width:14px;height:14px;vertical-align:-2px;margin-left:4px;border-radius:50%;background:#4DC4FF;position:relative}" +
      ".bp-verified-badge:after{content:'';position:absolute;left:4px;top:3px;width:6px;height:3px;border-left:2px solid #ECEFF1;border-bottom:2px solid #ECEFF1;transform:rotate(-45deg)}";
    document.head.appendChild(s);
  }

  function detectContextAndSetMode(url, source) {
    // source === "page": clique veio de um card da página (HOME ou página do artista)
    // Nesse caso, a HOME deve continuar em HOME mesmo se a faixa também existir na playlist.
    if (source === "page") {
      var trackCardsPage = document.querySelectorAll(".track-card[data-audio]");
      if (trackCardsPage.length > 0) {
        setMode("page");
        // ✅ em modo explícito, navLock já é limpo pelo setMode()
        return;
      }
      setMode("");
      // ✅ trava a navegação na página (HOME)
      navLock = "page";
      return;
    }

    // AUTO (chamadas do drawer/API): comportamento normal
    navLock = "";

    // AUTO (chamadas do drawer/API):
    // se estou numa PÁGINA DE ARTISTA e esta faixa existe aqui, o modo correto é "page"
    // (mesmo que ela esteja na playlist).
    try{
      var tcs = document.querySelectorAll(".track-card[data-audio]");
      if(tcs && tcs.length){
        for(var ti=0; ti<tcs.length; ti++){
          var tu = tcs[ti].getAttribute("data-audio") || "";
          if(tu && sameTrack(tu, url)){
            setMode("page");
            return;
          }
        }
      }
    }catch(e){}

    // se a faixa estiver na playlist, ativa modo playlist.
    var qUrls = getQueueUrls();
    var inQueue = false;
    for (var i = 0; i < qUrls.length; i++) {
      if (sameTrack(qUrls[i], url)) { inQueue = true; break; }
    }

    if (inQueue) { setMode("playlist"); return; }

    // fallback: se tem track-cards na página, prefiro "page"
    var trackCards = document.querySelectorAll(".track-card[data-audio]");
    if (trackCards.length > 0) { setMode("page"); return; }

    setMode("");
  }



  function paint() {
    if (!UI.root) return;

    var meta = resolveMeta(state.url);

    UI.title.textContent = meta.title || (state.url ? "Tocando..." : "Nada tocando");
    UI.artist.innerHTML = renderArtistWithBadge(meta.artist);
    UI.cover.src = meta.cover || "";
    UI.cover.style.visibility = meta.cover ? "visible" : "hidden";
    UI.play.textContent = (state.url && state.playing && !audio.paused) ? "II" : "▶";
    UI.time.textContent = fmtTime(audio.currentTime || state.time || 0);

    var d = audio.duration || 0;
    UI.dur.textContent = (d > 0 && isFinite(d)) ? fmtTime(d) : "0:00";

    if (d > 0 && isFinite(d)) {
      UI.prog.value = String(Math.min(1000, Math.max(0, Math.round((audio.currentTime || 0) / d * 1000))));
    } else {
      UI.prog.value = "0";
    }

    applyPitch();
    applyVolume();
  }

  // =========================
  // Prev/Next (mode-aware + AUTO)
  // =========================
  function updatePrevNextEnabled() {
    if (!UI.root) return;

    var list = getNavList();
    var explicit = getMode(); // "playlist" | "page" | ""(AUTO)

    // ✅ Em HOME/paginação do Blogger, as setas seguem a página visível mesmo se a faixa atual veio de outra página.
    var ok = false;
    if (explicit !== "playlist" && __bpIsHomePagination()) {
      ok = (list.length > 0);
    } else {
      ok = (list.length > 1 && state.url && list.some(function (u) { return sameTrack(u, state.url); }));
    }

    UI.prev.disabled = !ok;
    UI.next.disabled = !ok;

  }

  
  function step(dir) {
    var list = getNavList();
    if (!list || !list.length) return;

    // ✅ Se a faixa atual não estiver na lista da página visível (ex: veio da Page 1 e você está na Page 2),
    // usa o primeiro/último card da página atual.
    var idx = -1;
    if (state.url) {
      for (var i = 0; i < list.length; i++) {
        if (sameTrack(list[i], state.url)) { idx = i; break; }
      }
    }

    var nextUrl = "";
    if (idx === -1) {
      if (__bpIsHomePagination()) {
        nextUrl = (dir > 0) ? list[0] : list[list.length - 1];
      } else {
        return;
      }
    } else {
      if (list.length < 2) return;
      var n = idx + dir;
      if (n < 0) n = list.length - 1;
      if (n >= list.length) n = 0;
      nextUrl = list[n];
    }

    if (!nextUrl) return;
    state.time = 0;
    saveState();
    playUrl(nextUrl);
  }


  // =========================
  // Play/Pause
  // =========================
  function playUrl(url) {
    if (!url) return;
    if (!isAllowed(url)) { warnBlocked(); return; }

    ensureUI();

    if (audio.src !== url) {
      try { __bpAllowPause = true; audio.pause(); } catch (e) {} finally { __bpAllowPause = false; }
      try { audio.currentTime = 0; } catch (e) {}
      audio.src = url;
    }

    applyVolume();
    applyPitch();

    __bpLockAutoPause(2500);

    __bpLockAutoPause(2500);
            audio.play().then(function () {
      state.url = url;
      state.playing = true;

      // salva meta "bom" (DOM se tiver, senão QUEUE, senão LS_META)
      saveMeta(resolveMeta(url));
      saveState();

      syncCards();
      paint();
      updatePrevNextEnabled();
    }).catch(function () {});
  }

  function pause() {
    ensureUI();
    try { __bpAllowPause = true; audio.pause(); } catch (e) {} finally { __bpAllowPause = false; }
state.playing = false;
    saveState();
    syncCards();
    paint();
    updatePrevNextEnabled();
  }

  // =========================
  // Boot restore - ✅ MODIFICAÇÃO 2
  // =========================
  function restore() {
    ensureUI();
    loadState();

    if (state.url && !isAllowed(state.url)) {
      state.url = ""; state.time = 0; state.playing = false;
      saveState();
    }

    var explicit = getMode();
    if (explicit === "playlist") {
      var q = getQueueUrls();
      if (!q.length) setMode("");
    }

    if (state.url) {
      // ✅ verifica se já estava pré-carregado
      var alreadyPreloaded = (audio.src && sameTrack(audio.src, state.url) && !audio.paused);
      
      if (!alreadyPreloaded) {
        audio.src = state.url;
      }
      
      applyVolume();
      applyPitch();

      (function () {
        if (!alreadyPreloaded) {
          try { audio.currentTime = state.time || 0; } catch (e) {}
        }
        
        if (state.playing) {
          if (!alreadyPreloaded) {
            audio.play().then(function () {
              syncCards(); paint(); updatePrevNextEnabled();
            }).catch(function () {
              state.playing = false; saveState();
              syncCards(); paint(); updatePrevNextEnabled();
            });
          } else {
            syncCards(); paint(); updatePrevNextEnabled();
          }
        } else {
          syncCards(); paint(); updatePrevNextEnabled();
        }
      })();
    } else {
      syncCards(); paint(); updatePrevNextEnabled();
    }

    lastMode = getMode();

  }

  // =========================
  // Click on cards: ✅ force PAGE mode
  // =========================
  document.addEventListener("click", function (e) {
    if (e.target.closest(".music-card .download") || e.target.closest("button.download[data-download]")) return;

    var card = e.target.closest(".music-card");
    if (!card) return;

    var playBtn = e.target.closest(".music-card .play-btn");
    var cover = e.target.closest(".music-card .cover");
    if (!playBtn && !cover) return;

    var url = card.getAttribute("data-audio-url");
    if (!url) return;

    // 🔥 Context-aware mode: HOME stays HOME, artist pages become PAGE, playlist stays PLAYLIST
    detectContextAndSetMode(url, "page");

    if (sameTrack(state.url, url)) {
      if (audio.paused) playUrl(url);
      else pause();
    } else {
      state.url = url;
      state.time = 0;
      saveState();
      playUrl(url);
    }
  }, true);

  // =========================
  // Expose API
  // =========================
  window.BP_GLOBAL = window.BP_GLOBAL || {};

  // ✅ garante singleton do áudio entre páginas
  window.BP_GLOBAL.__audio = audio;
  window.BP_GLOBAL.play = function (url) { playUrl(url); };
  window.BP_GLOBAL.pause = function () { pause(); };
  window.BP_GLOBAL.toggle = function (url) {
    if (!url) return;

    // 🔥 Detecta contexto e seta modo automaticamente (só quando muda de faixa)
    if (!sameTrack(state.url, url)) {
      detectContextAndSetMode(url);
    }

    if (sameTrack(state.url, url)) {
      if (audio.paused) playUrl(url);
      else pause();
    } else {
      state.url = url;
      state.time = 0;
      saveState();
      playUrl(url);
    }
  };

  window.BP_GLOBAL.setMode = function (m) {
    if (m === "playlist" || m === "page") setMode(m);
    else setMode("");
    updatePrevNextEnabled();
    paint();
  };

  window.BP_GLOBAL.minimize = function () {
    if (typeof toggleMin === "function") toggleMin();
  };

  // =========================
  // Audio events
  // =========================
  if (!audio._bpBound) {
  audio._bpBound = true;

  audio.addEventListener("timeupdate", function () {
      state.time = audio.currentTime || 0;
      saveState();
      paint();
    });
  
    audio.addEventListener("loadedmetadata", function () { paint(); });
  
    audio.addEventListener("ended", function () {
      var list = getNavList();
      var has = (state.url && list.length > 1 && list.some(function (u) { return sameTrack(u, state.url); }));
      if (has) step(1);
      else { state.playing = false; saveState(); syncCards(); paint(); updatePrevNextEnabled(); }
    });
  
    
}
// =========================
  // React to changes
  // =========================
  if (!window.__bpGlobalWinBound) {
  window.__bpGlobalWinBound = true;

  window.addEventListener("storage", function (ev) {
      if (!ev || !ev.key) return;
  
      if (ev.key === LS_KEY_QUEUE || ev.key === LS_KEY_MODE || ev.key === LS_KEY_META) {
        updatePrevNextEnabled();
        paint();
      }
      if (ev.key === LS_KEY_STATE) {
        updatePrevNextEnabled();
        paint();
      }
    });
  
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        updatePrevNextEnabled();
        paint();
        syncCards();
      }
    });
  
    
}
// =========================
  // Init
  // =========================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", restore);
  } else {
    restore();
  }
})();
