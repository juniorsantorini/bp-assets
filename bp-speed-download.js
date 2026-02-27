/**
 * bp-speed-download.js
 * Intercepta clique no "Baixar" dos music-cards e abre modal Normal/Speed.
 * Speed é gerado no navegador (OfflineAudioContext + lamejs).
 *
 * CORREÇÕES v2:
 *  1. "Lembrar escolha" tem grace period de 2.5s com "Desfazer" antes de iniciar
 *  2. overflow:hidden sempre liberado (popstate, visibilitychange, beforeunload)
 *  3. Proteção silenciosa de 1s removida — botão desativa visualmente por 350ms
 *  4. ✕ do DM é só minimizar; botão "Cancelar" real via AbortController
 *  5. Cancelamento de item individual na fila com ✕ por item
 *  6. Contador "2 de 7" no header do DM
 *  7. "Já na fila" visível quando dedup dispara
 *  8. Normal download via fetch+blob (filename controlado, sem processamento de áudio)
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════
  // CONFIG
  // ═══════════════════════════════════════
  var SPEED    = Math.pow(2, 133 / 1200);
  var MP3_KBPS = 320;
  var LAME_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';

  var LS_PREF     = 'bp_dl_pref';
  var LS_REMEMBER = 'bp_dl_remember';

  // ═══════════════════════════════════════
  // PREFERÊNCIA
  // ═══════════════════════════════════════
  function getPref() {
    try { var v = localStorage.getItem(LS_PREF); return (v === 'normal' || v === 'speed') ? v : ''; } catch(e) { return ''; }
  }
  function setPref(v) {
    try { if (v) localStorage.setItem(LS_PREF, v); else localStorage.removeItem(LS_PREF); } catch(e) {}
  }
  function getRemember() {
    try { return localStorage.getItem(LS_REMEMBER) === '1'; } catch(e) { return false; }
  }
  function setRemember(on) {
    try { if (on) localStorage.setItem(LS_REMEMBER, '1'); else localStorage.removeItem(LS_REMEMBER); } catch(e) {}
  }
  function clearRememberAndPref() { setRemember(false); setPref(''); }

  // ═══════════════════════════════════════
  // lamejs sob demanda
  // ═══════════════════════════════════════
  var lameReady = false, lameLoading = false, lameQ = [];
  function loadLame(cb) {
    if (lameReady)   { cb(); return; }
    if (lameLoading) { lameQ.push(cb); return; }
    lameLoading = true; lameQ.push(cb);
    var s = document.createElement('script'); s.src = LAME_CDN; s.async = true;
    s.onload  = function () { lameReady = true; lameLoading = false; var q = lameQ.slice(); lameQ = []; q.forEach(function(f){ try{f();}catch(e){} }); };
    s.onerror = function () { lameLoading = false; var err = new Error('lamejs não carregou'); var q = lameQ.slice(); lameQ = []; q.forEach(function(f){ try{f(err);}catch(e){} }); };
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════
  // CSS
  // ═══════════════════════════════════════
  function injectCSS() {
    if (document.getElementById('bp-sdl-css')) return;
    var s = document.createElement('style');
    s.id = 'bp-sdl-css';
    s.textContent =
      // ── overlay + modal ───────────────────────────────────────────────────
      '#bp-sdl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .22s ease}' +
      '#bp-sdl-overlay.show{opacity:1;pointer-events:auto}' +
      '#bp-sdl-modal{background:linear-gradient(150deg,#1e0f1c 0%,#110a0f 100%);border:1px solid rgba(164,7,129,.35);border-radius:24px;padding:26px 22px 20px;width:100%;max-width:340px;position:relative;box-shadow:0 32px 80px rgba(0,0,0,.8),0 0 0 1px rgba(164,7,129,.08);transform:translateY(20px) scale(.96);transition:transform .25s cubic-bezier(.34,1.56,.64,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '#bp-sdl-overlay.show #bp-sdl-modal{transform:translateY(0) scale(1)}' +
      '#bp-sdl-modal h3{font-size:16px;font-weight:800;color:#fff;margin:0 0 2px;letter-spacing:.1px}' +
      '#bp-sdl-modal .sdl-sub{font-size:11px;color:rgba(255,255,255,.3);margin:0 0 18px;letter-spacing:.2px}' +
      '#bp-sdl-close{position:absolute;top:14px;right:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:50%;width:26px;height:26px;color:rgba(255,255,255,.4);font-size:13px;cursor:pointer;padding:0;line-height:26px;text-align:center;transition:background .15s,color .15s}' +
      '#bp-sdl-close:hover{background:rgba(255,255,255,.14);color:#fff}' +
      '.sdl-opt{display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.09);border-radius:14px;cursor:pointer;text-align:left;margin-bottom:10px;transition:background .18s,border-color .18s,transform .18s,opacity .18s;font-family:inherit;text-decoration:none;box-sizing:border-box;color:#fff}' +
      '.sdl-opt:hover{background:rgba(164,7,129,.18);border-color:rgba(164,7,129,.45);transform:translateY(-2px)}' +
      '.sdl-opt:active{transform:translateY(0)}' +
      '.sdl-opt.is-loading{opacity:.45;cursor:wait;pointer-events:none}' +
      '.sdl-icon{font-size:22px;line-height:1;flex-shrink:0}' +
      '.sdl-info{flex:1;min-width:0}' +
      '.sdl-title{font-size:14px;font-weight:700;color:#fff;line-height:1.3;display:flex;align-items:center;gap:7px;flex-wrap:wrap}' +
      '.sdl-badge{font-size:10px;padding:2px 7px;border-radius:999px;background:rgba(164,7,129,.3);border:1px solid rgba(164,7,129,.55);color:#e070c8;font-weight:700;letter-spacing:.5px;flex-shrink:0}' +
      '.sdl-desc{font-size:11px;color:rgba(255,255,255,.38);margin-top:3px;line-height:1.45}' +
      '.sdl-remember{display:flex;align-items:center;gap:8px;padding:12px 4px 4px;border-top:1px solid rgba(255,255,255,.07);margin-top:6px}' +
      '.sdl-remember input[type=checkbox]{appearance:none;-webkit-appearance:none;width:16px;height:16px;border:2px solid rgba(255,255,255,.35);border-radius:4px;background:transparent;cursor:pointer;flex-shrink:0;position:relative;transition:background .15s,border-color .15s;display:inline-flex;align-items:center;justify-content:center}' +
      '.sdl-remember input[type=checkbox]:hover{border-color:rgba(255,255,255,.65)}' +
      '.sdl-remember input[type=checkbox]:checked{background:#a40781;border-color:#a40781}' +
      '.sdl-remember input[type=checkbox]:checked::after{content:"";display:block;width:4px;height:8px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg) translate(-1px,-1px)}' +
      '.sdl-remember label{font-size:11px;color:rgba(255,255,255,.4);cursor:pointer;user-select:none;flex:1}' +
      '.sdl-prog{display:none;margin-top:4px}' +
      '.sdl-prog.show{display:block}' +
      '.sdl-dl-header{font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-.3px;line-height:1.2}' +
      '.sdl-dl-header.is-speed{color:#e070c8}' +
      '.sdl-dl-file{font-size:12px;color:rgba(255,255,255,.35);margin-bottom:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.sdl-prog-bar{height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:visible;position:relative}' +
      '.sdl-prog-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#6b0057,#a40781 40%,#e070c8 70%,#f0a0e0);background-size:300% auto;transition:width .45s cubic-bezier(.4,0,.2,1);animation:bp-shine 2s linear infinite;position:relative}' +
      '.sdl-prog-fill::after{content:"";position:absolute;right:-2px;top:50%;transform:translateY(-50%);width:14px;height:14px;border-radius:50%;background:#e070c8;box-shadow:0 0 0 3px rgba(224,112,200,.2);animation:bp-glow 1.4s ease-in-out infinite}' +
      '.sdl-prog-footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px}' +
      '.sdl-prog-label{font-size:11px;color:rgba(255,255,255,.35)}' +
      '.sdl-prog-pct{font-size:14px;font-weight:800;color:#e070c8}' +
      '.sdl-switch{display:none;width:100%;margin-top:14px;padding:11px 16px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.15);border-radius:14px;color:rgba(255,255,255,.65);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .18s,border-color .18s}' +
      '.sdl-switch:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.3)}' +
      '.sdl-switch.show{display:block}' +

      // ── animações globais ──────────────────────────────────────────────────
      '@keyframes bp-shine{0%{background-position:200% center}100%{background-position:-200% center}}' +
      '@keyframes bp-glow{0%,100%{box-shadow:0 0 6px rgba(164,7,129,.5)}50%{box-shadow:0 0 16px rgba(224,112,200,.9)}}' +
      '@keyframes bp-dedup-flash{0%,100%{opacity:1}30%{opacity:.3}60%{opacity:.85}}' +
      '.bp-dedup-flash{animation:bp-dedup-flash .5s ease both!important}' +
      '.bp-dl-pref-tag{display:inline-block;font-size:9px;padding:1px 5px;border-radius:999px;vertical-align:middle;margin-left:4px;background:rgba(164,7,129,.25);border:1px solid rgba(164,7,129,.4);color:#e070c8;font-weight:700;letter-spacing:.4px;pointer-events:none}' +

      // ── GRACE SNACKBAR — "Desfazer" preferência ───────────────────────────
      '@keyframes bp-grace-in{0%{opacity:0;transform:translateY(12px) scale(.97)}100%{opacity:1;transform:translateY(0) scale(1)}}' +
      '@keyframes bp-grace-progress{0%{width:100%}100%{width:0%}}' +
      '#bp-grace{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:linear-gradient(150deg,#1e0f1c 0%,#110a0f 100%);border:1px solid rgba(164,7,129,.38);border-radius:14px;padding:12px 16px 10px;box-shadow:0 12px 40px rgba(0,0,0,.75);z-index:10000001;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:none;min-width:260px;max-width:calc(100vw - 32px)}' +
      '#bp-grace.show{display:block;animation:bp-grace-in .24s cubic-bezier(.34,1.2,.64,1) both}' +
      '#bp-grace-row{display:flex;align-items:center;justify-content:space-between;gap:12px}' +
      '#bp-grace-msg{font-size:12px;color:rgba(255,255,255,.65);flex:1}' +
      '#bp-grace-msg strong{color:#fff;font-weight:700}' +
      '#bp-grace-undo{background:rgba(164,7,129,.25);border:1px solid rgba(164,7,129,.45);border-radius:8px;padding:5px 11px;font-size:11px;font-weight:800;color:#e070c8;cursor:pointer;font-family:inherit;transition:background .15s;white-space:nowrap;letter-spacing:.3px}' +
      '#bp-grace-undo:hover{background:rgba(164,7,129,.42)}' +
      '#bp-grace-bar{height:3px;background:rgba(255,255,255,.07);border-radius:999px;margin-top:9px;overflow:hidden}' +
      '#bp-grace-fill{height:100%;width:100%;background:linear-gradient(90deg,#6b0057,#a40781,#e070c8);border-radius:999px;transform-origin:left}' +
      '#bp-grace-fill.running{animation:bp-grace-progress 2.4s linear forwards}' +

      // ── DOWNLOAD MANAGER PANEL ─────────────────────────────────────────────
      '@keyframes bp-dm-item-in{0%{opacity:0;transform:translateX(12px)}100%{opacity:1;transform:translateX(0)}}' +
      '@keyframes bp-dm-item-out{0%{opacity:1;transform:translateX(0);max-height:40px}100%{opacity:0;transform:translateX(-14px);max-height:0}}' +

      '#bp-dm{position:fixed;bottom:20px;right:20px;width:308px;background:linear-gradient(150deg,#1e0f1c 0%,#110a0f 100%);border:1px solid rgba(164,7,129,.38);border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,.82),0 0 0 1px rgba(164,7,129,.07);z-index:9999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;opacity:0;transform:translateY(16px) scale(.97);pointer-events:none;transition:opacity .28s ease,transform .32s cubic-bezier(.34,1.2,.64,1)}' +
      '#bp-dm.show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}' +
      '@media(max-width:479px){#bp-dm{left:12px;right:12px;width:auto;bottom:12px}}' +

      // Seção ativa
      '#bp-dm-active{padding:14px 16px 13px}' +

      // Header: tipo + contador + minimizar
      '#bp-dm-hd{display:flex;align-items:center;gap:6px;margin-bottom:9px}' +
      '#bp-dm-type{display:flex;align-items:center;gap:6px;flex:1;min-width:0}' +
      '#bp-dm-type-icon{font-size:12px;line-height:1;flex-shrink:0}' +
      '#bp-dm-type-label{font-size:10px;font-weight:800;color:#e070c8;letter-spacing:.8px;text-transform:uppercase;white-space:nowrap}' +
      '#bp-dm-counter{font-size:10px;color:rgba(255,255,255,.28);font-weight:600;white-space:nowrap;flex-shrink:0}' +
      '#bp-dm-minimize{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:50%;width:22px;height:22px;color:rgba(255,255,255,.38);font-size:10px;cursor:pointer;padding:0;line-height:22px;text-align:center;transition:background .15s,color .15s;flex-shrink:0}' +
      '#bp-dm-minimize:hover{background:rgba(255,255,255,.14);color:#fff}' +

      // Nome da faixa atual
      '#bp-dm-track{font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:10px;line-height:1.35}' +

      // Barra
      '#bp-dm-bar{height:5px;background:rgba(255,255,255,.08);border-radius:999px;overflow:visible;position:relative;margin-bottom:8px}' +
      '#bp-dm-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#6b0057,#a40781 40%,#e070c8 70%,#f9a8e8);background-size:300% auto;transition:width .5s cubic-bezier(.4,0,.2,1);animation:bp-shine 2s linear infinite;position:relative}' +
      '#bp-dm-fill::after{content:"";position:absolute;right:-1px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:#e070c8;animation:bp-glow 1.4s ease-in-out infinite}' +

      // Rodapé da barra + cancelar atual
      '#bp-dm-foot{display:flex;align-items:center;justify-content:space-between}' +
      '#bp-dm-status{font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.1px}' +
      '#bp-dm-right{display:flex;align-items:center;gap:10px}' +
      '#bp-dm-pct{font-size:12px;font-weight:800;color:#e070c8}' +
      '#bp-dm-cancel{background:none;border:none;padding:0;font-size:10px;color:rgba(255,100,100,.55);cursor:pointer;font-family:inherit;transition:color .15s;letter-spacing:.2px}' +
      '#bp-dm-cancel:hover{color:rgba(255,120,120,.9)}' +

      // Separador
      '#bp-dm-sep{height:1px;background:rgba(255,255,255,.07);margin:0 16px;display:none}' +
      '#bp-dm-sep.show{display:block}' +

      // Seção de fila
      '#bp-dm-queue{padding:10px 16px 13px;display:none}' +
      '#bp-dm-queue.show{display:block}' +
      '#bp-dm-queue-lbl{font-size:9px;font-weight:800;color:rgba(255,255,255,.22);letter-spacing:1.1px;text-transform:uppercase;margin-bottom:8px}' +
      '#bp-dm-queue-list{display:flex;flex-direction:column;gap:0}' +

      // Item da fila
      '.bp-dm-qi{display:flex;align-items:center;gap:9px;padding:5px 0;animation:bp-dm-item-in .22s ease both;overflow:hidden}' +
      '.bp-dm-qi.removing{animation:bp-dm-item-out .2s ease forwards;pointer-events:none}' +
      '.bp-dm-qi-icon{font-size:11px;flex-shrink:0;opacity:.5;line-height:1}' +
      '.bp-dm-qi-name{font-size:11px;color:rgba(255,255,255,.36);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}' +
      '.bp-dm-qi-remove{background:none;border:none;padding:0 0 0 6px;font-size:12px;color:rgba(255,255,255,.18);cursor:pointer;line-height:1;flex-shrink:0;transition:color .15s}' +
      '.bp-dm-qi-remove:hover{color:rgba(255,100,100,.7)}' +

      // Dedup tooltip inline no DM
      '#bp-dm-dedup{display:none;font-size:10px;color:rgba(255,200,100,.7);margin-top:8px;font-style:italic;letter-spacing:.1px}' +
      '#bp-dm-dedup.show{display:block}' +

      // Botão trocar preferência dentro do DM
      '#bp-dm-switch{display:none;background:none;border:none;padding:0 16px 12px;font-size:10px;color:rgba(164,7,129,.7);cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px;letter-spacing:.2px;transition:color .15s}' +
      '#bp-dm-switch:hover{color:#e070c8}' +
      '#bp-dm-switch.show{display:block}';

    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════
  // ESTADO
  // ═══════════════════════════════════════
  var overlay, btnNormal, btnSpeed, chkRemember, sdlProg, sdlFill, sdlLabel, sdlPct, sdlDlHeader, sdlDlFile, btnSwitch, btnClose;
  var dmEl, dmFill, dmPct, dmStatusEl, dmTrackEl, dmQueueSection, dmQueueList, dmSep, dmCounter, dmCancelBtn;

  var dlQueue     = [];   // { url, meta, type }
  var dlRunning   = false;
  var activeUrl   = '';
  var activeMeta  = null;

  // Contadores para "N de Y"
  var dlBatchTotal     = 0;
  var dlBatchCompleted = 0;

  // AbortController do fetch atual
  var currentAbort = null;

  // Crawl da barra
  var barCurrent = 0, barTarget = 0, barRaf = null;

  // Grace period (lembrar preferência)
  var _graceTimer = null;
  var _graceEl    = null;

  var modalOpenTime = 0;

  // ═══════════════════════════════════════
  // FIX 2 — overflow:hidden sempre limpo
  // ═══════════════════════════════════════
  function releaseOverflow() { document.body.style.overflow = ''; }

  window.addEventListener('popstate', function () { closeModal(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) releaseOverflow();
  });
  window.addEventListener('beforeunload', releaseOverflow);

  // ═══════════════════════════════════════
  // GRACE SNACKBAR (FIX 1 — lembrar pref)
  // ═══════════════════════════════════════
  function showGrace(url, meta, type) {
    if (!_graceEl) {
      _graceEl = document.createElement('div');
      _graceEl.id = 'bp-grace';
      _graceEl.innerHTML =
        '<div id="bp-grace-row">' +
          '<div id="bp-grace-msg"></div>' +
          '<button id="bp-grace-undo" type="button">Desfazer</button>' +
        '</div>' +
        '<div id="bp-grace-bar"><div id="bp-grace-fill"></div></div>';
      document.body.appendChild(_graceEl);
      document.getElementById('bp-grace-undo').addEventListener('click', function () {
        _graceClear();
        clearRememberAndPref();
        updatePrefBadges();
        // Abre modal normalmente para o usuário escolher
        activeUrl  = url;
        activeMeta = meta;
        resetModalToChoice();
        chkRemember.checked = false;
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
      });
    }

    var icon  = type === 'speed' ? '⚡' : '⬇️';
    var label = type === 'speed' ? 'Speed' : 'Normal';
    var msg   = icon + ' Baixando em <strong>' + label + '</strong> (preferência salva)';
    document.getElementById('bp-grace-msg').innerHTML = msg;

    var fill = document.getElementById('bp-grace-fill');
    fill.classList.remove('running');
    void fill.offsetWidth;

    _graceEl.classList.add('show');
    fill.classList.add('running');

    if (_graceTimer) clearTimeout(_graceTimer);
    _graceTimer = setTimeout(function () {
      _graceClear();
      enqueue(url, meta, type);
    }, 2500);
  }

  function _graceClear() {
    if (_graceTimer) { clearTimeout(_graceTimer); _graceTimer = null; }
    if (_graceEl) _graceEl.classList.remove('show');
  }

  // ═══════════════════════════════════════
  // BUILD (modal + DM panel)
  // ═══════════════════════════════════════
  function buildModal() {
    if (document.getElementById('bp-sdl-overlay')) {
      overlay     = document.getElementById('bp-sdl-overlay');
      btnNormal   = document.getElementById('bp-sdl-normal');
      btnSpeed    = document.getElementById('bp-sdl-speed');
      chkRemember = document.getElementById('bp-sdl-chk');
      sdlProg     = document.getElementById('bp-sdl-prog');
      sdlFill     = document.getElementById('bp-sdl-fill');
      sdlLabel    = document.getElementById('bp-sdl-label');
      sdlPct      = document.getElementById('bp-sdl-pct');
      sdlDlHeader = document.getElementById('bp-sdl-dl-header');
      sdlDlFile   = document.getElementById('bp-sdl-dl-file');
      btnSwitch   = document.getElementById('bp-sdl-switch');
      btnClose    = document.getElementById('bp-sdl-close');
      _bindDmRefs();
      return;
    }

    // Modal overlay
    overlay = document.createElement('div');
    overlay.id = 'bp-sdl-overlay';
    overlay.innerHTML =
      '<div id="bp-sdl-modal">' +
        '<button id="bp-sdl-close" type="button">✕</button>' +
        '<h3>Baixar faixa</h3>' +
        '<p class="sdl-sub">Escolha o formato do download</p>' +
        '<a id="bp-sdl-normal" class="sdl-opt" href="#" rel="noopener">' +
          '<span class="sdl-icon">⬇️</span>' +
          '<span class="sdl-info">' +
            '<span class="sdl-title">Versão Normal</span>' +
            '<span class="sdl-desc">Arquivo original · Recomendada para DJs</span>' +
          '</span>' +
        '</a>' +
        '<button id="bp-sdl-speed" type="button" class="sdl-opt">' +
          '<span class="sdl-icon">⚡</span>' +
          '<span class="sdl-info">' +
            '<span class="sdl-title">Versão Speed <span class="sdl-badge">SPEED</span></span>' +
            '<span class="sdl-desc">Acelerada · mesmo efeito do botão SPEED do player</span>' +
          '</span>' +
        '</button>' +
        '<div class="sdl-remember">' +
          '<input type="checkbox" id="bp-sdl-chk" />' +
          '<label for="bp-sdl-chk">Lembrar minha escolha</label>' +
        '</div>' +
        '<div class="sdl-prog" id="bp-sdl-prog">' +
          '<div class="sdl-dl-header" id="bp-sdl-dl-header">Baixando…</div>' +
          '<div class="sdl-dl-file" id="bp-sdl-dl-file"></div>' +
          '<div class="sdl-prog-bar"><div class="sdl-prog-fill" id="bp-sdl-fill"></div></div>' +
          '<div class="sdl-prog-footer">' +
            '<div class="sdl-prog-label" id="bp-sdl-label">Preparando…</div>' +
            '<div class="sdl-prog-pct" id="bp-sdl-pct">0%</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="sdl-switch" id="bp-sdl-switch">🔄 Trocar preferência</button>' +
      '</div>';
    document.body.appendChild(overlay);

    // Download Manager panel
    if (!document.getElementById('bp-dm')) {
      dmEl = document.createElement('div');
      dmEl.id = 'bp-dm';
      dmEl.innerHTML =
        '<div id="bp-dm-active">' +
          '<div id="bp-dm-hd">' +
            '<div id="bp-dm-type"><span id="bp-dm-type-icon">⬇️</span><span id="bp-dm-type-label">BAIXANDO</span></div>' +
            '<span id="bp-dm-counter"></span>' +
            '<button id="bp-dm-minimize" type="button" title="Minimizar">—</button>' +
          '</div>' +
          '<div id="bp-dm-track"></div>' +
          '<div id="bp-dm-bar"><div id="bp-dm-fill"></div></div>' +
          '<div id="bp-dm-foot">' +
            '<span id="bp-dm-status">Preparando…</span>' +
            '<div id="bp-dm-right"><button id="bp-dm-cancel" type="button">Cancelar</button><span id="bp-dm-pct">0%</span></div>' +
          '</div>' +
          '<div id="bp-dm-dedup">Essa faixa já está na fila ✓</div>' +
        '</div>' +
        '<div id="bp-dm-sep"></div>' +
        '<div id="bp-dm-queue">' +
          '<div id="bp-dm-queue-lbl">NA FILA</div>' +
          '<div id="bp-dm-queue-list"></div>' +
        '</div>' +
        '<button type="button" id="bp-dm-switch">🔄 Trocar preferência de download</button>';
      document.body.appendChild(dmEl);

      document.getElementById('bp-dm-minimize').addEventListener('click', function () {
        dmEl.classList.remove('show');
      });
      document.getElementById('bp-dm-cancel').addEventListener('click', function () {
        _cancelCurrent();
      });
      document.getElementById('bp-dm-switch').addEventListener('click', function () {
        clearRememberAndPref();
        updatePrefBadges();
        document.getElementById('bp-dm-switch').classList.remove('show');
      });
    } else {
      dmEl = document.getElementById('bp-dm');
    }

    _bindDmRefs();

    // Refs modal
    btnNormal   = document.getElementById('bp-sdl-normal');
    btnSpeed    = document.getElementById('bp-sdl-speed');
    chkRemember = document.getElementById('bp-sdl-chk');
    sdlProg     = document.getElementById('bp-sdl-prog');
    sdlFill     = document.getElementById('bp-sdl-fill');
    sdlLabel    = document.getElementById('bp-sdl-label');
    sdlPct      = document.getElementById('bp-sdl-pct');
    sdlDlHeader = document.getElementById('bp-sdl-dl-header');
    sdlDlFile   = document.getElementById('bp-sdl-dl-file');
    btnSwitch   = document.getElementById('bp-sdl-switch');
    btnClose    = document.getElementById('bp-sdl-close');

    // Eventos modal
    btnClose.addEventListener('click', function () { closeModal(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    // FIX 3 — sem proteção silenciosa: botão desativa visualmente por 350ms
    btnNormal.addEventListener('click', function (e) {
      e.preventDefault();
      if (btnNormal.classList.contains('is-loading')) return;
      btnNormal.classList.add('is-loading');
      setTimeout(function () { btnNormal.classList.remove('is-loading'); }, 350);
      if (chkRemember.checked) { setRemember(true); setPref('normal'); updatePrefBadges(); }
      var u = activeUrl, m = activeMeta;
      closeModal();
      enqueue(u, m, 'normal');
    });

    btnSpeed.addEventListener('click', function () {
      if (btnSpeed.classList.contains('is-loading')) return;
      btnSpeed.classList.add('is-loading');
      setTimeout(function () { btnSpeed.classList.remove('is-loading'); }, 350);
      if (chkRemember.checked) { setRemember(true); setPref('speed'); updatePrefBadges(); }
      var u = activeUrl, m = activeMeta;
      closeModal();
      enqueue(u, m, 'speed');
    });

    chkRemember.addEventListener('change', function () {
      if (chkRemember.checked) { setRemember(true); }
      else { clearRememberAndPref(); updatePrefBadges(); }
    });

    btnSwitch.addEventListener('click', function () {
      clearRememberAndPref();
      updatePrefBadges();
      resetModalToChoice();
    });
  }

  function _bindDmRefs() {
    dmFill         = document.getElementById('bp-dm-fill');
    dmPct          = document.getElementById('bp-dm-pct');
    dmStatusEl     = document.getElementById('bp-dm-status');
    dmTrackEl      = document.getElementById('bp-dm-track');
    dmQueueSection = document.getElementById('bp-dm-queue');
    dmQueueList    = document.getElementById('bp-dm-queue-list');
    dmSep          = document.getElementById('bp-dm-sep');
    dmCounter      = document.getElementById('bp-dm-counter');
    dmCancelBtn    = document.getElementById('bp-dm-cancel');
  }

  // ═══════════════════════════════════════
  // FILA
  // ═══════════════════════════════════════
  function enqueue(url, meta, type) {
    // Dedup — FIX 7: mostra feedback visível
    if (dlRunning && activeUrl === url) { _showDedup(url); return; }
    for (var i = 0; i < dlQueue.length; i++) {
      if (dlQueue[i].url === url) { _showDedup(url); return; }
    }

    dlQueue.push({ url: url, meta: meta, type: type });
    dlBatchTotal++;
    _dmSyncQueue();
    if (!dlRunning) processNext();
  }

  // FIX 7 — dedup: pisca botão do card + mostra mensagem no DM
  var _dedupTimer = null;
  function _showDedup(url) {
    try {
      document.querySelectorAll('.music-card .download').forEach(function (link) {
        if ((link.getAttribute('href') || '') === url) {
          link.classList.remove('bp-dedup-flash');
          void link.offsetWidth;
          link.classList.add('bp-dedup-flash');
          setTimeout(function () { link.classList.remove('bp-dedup-flash'); }, 600);
        }
      });
    } catch(e) {}

    var el = document.getElementById('bp-dm-dedup');
    if (!el) return;
    if (_dedupTimer) clearTimeout(_dedupTimer);
    el.classList.add('show');
    _dedupTimer = setTimeout(function () { el.classList.remove('show'); }, 2500);
    if (dmEl) dmEl.classList.add('show');
  }

  function processNext() {
    if (dlQueue.length === 0) {
      dlRunning = false;
      dlBatchTotal = 0;
      dlBatchCompleted = 0;
      return;
    }
    dlRunning = true;
    var item = dlQueue.shift();
    activeUrl  = item.url;
    activeMeta = item.meta;
    _dmRemoveQueueItem(item.url);
    if (item.type === 'speed') { runSpeedDownload(item.url); }
    else                       { runNormalDownload(item.url); }
  }

  // FIX 4 — cancelar download atual via AbortController
  function _cancelCurrent() {
    if (currentAbort) {
      try { currentAbort.abort(); } catch(e) {}
      currentAbort = null;
    }
    dlRunning = false;
    dlBatchCompleted++;
    if (dmStatusEl) dmStatusEl.textContent = 'Cancelado';
    setTimeout(function () {
      if (dlQueue.length > 0) { processNext(); }
      else { dlBatchTotal = 0; dlBatchCompleted = 0; dmHide(); }
    }, 800);
  }

  // FIX 5 — remover item individual da fila pelo ✕
  function _removeFromQueue(url) {
    dlQueue = dlQueue.filter(function(i) { return i.url !== url; });
    dlBatchTotal = Math.max(0, dlBatchTotal - 1);
    _dmRemoveQueueItem(url);
    _dmUpdateCounter();
    if (dlQueue.length === 0 && dmQueueSection) {
      dmQueueSection.classList.remove('show');
      if (dmSep) dmSep.classList.remove('show');
    }
  }

  // ═══════════════════════════════════════
  // DOWNLOAD MANAGER — UI
  // ═══════════════════════════════════════
  function dmShow(type, meta) {
    if (!dmEl) return;
    var isSpeed = type === 'speed';
    var typeIconEl  = document.getElementById('bp-dm-type-icon');
    var typeLabelEl = document.getElementById('bp-dm-type-label');
    if (typeIconEl)  typeIconEl.textContent  = isSpeed ? '⚡' : '⬇️';
    if (typeLabelEl) typeLabelEl.textContent = isSpeed ? 'PROCESSANDO SPEED' : 'BAIXANDO';
    if (dmTrackEl)   dmTrackEl.textContent   = _trackLabel(meta);

    stopCrawl();
    if (dmFill) { dmFill.style.transition = 'none'; dmFill.style.width = '0%'; }
    if (dmPct)  dmPct.textContent  = '0%';
    if (dmStatusEl) dmStatusEl.textContent = 'Preparando…';
    setTimeout(function () { if (dmFill) dmFill.style.transition = ''; }, 30);

    _dmUpdateCounter();
    _dmSyncQueue();
    dmEl.classList.add('show');
  }

  function dmHide() {
    stopCrawl();
    if (!dmEl) return;
    if (dmFill) dmFill.style.width = '100%';
    if (dmPct)  dmPct.textContent  = '100%';
    setTimeout(function () {
      if (dmEl) dmEl.classList.remove('show');
      var sw = document.getElementById('bp-dm-switch');
      if (sw) sw.classList.remove('show');
    }, 520);
  }

  // FIX 6 — contador "N de Y"
  function _dmUpdateCounter() {
    if (!dmCounter) return;
    var done  = dlBatchCompleted;
    var total = dlBatchTotal;
    if (total > 1) {
      dmCounter.textContent = (done + 1) + ' de ' + total;
    } else {
      dmCounter.textContent = '';
    }
  }

  function _dmSyncQueue() {
    if (!dmQueueList || !dmQueueSection) return;

    var hasItems = dlQueue.length > 0;
    if (hasItems) { dmQueueSection.classList.add('show'); if (dmSep) dmSep.classList.add('show'); }
    else          { dmQueueSection.classList.remove('show'); if (dmSep) dmSep.classList.remove('show'); }

    var existing    = dmQueueList.querySelectorAll('.bp-dm-qi');
    var existingUrls = [];
    existing.forEach(function(n) { existingUrls.push(n.dataset.url || ''); });

    var qUrls = dlQueue.map(function(i) { return i.url; });

    // Remover itens que saíram da fila
    existing.forEach(function(n) {
      if (qUrls.indexOf(n.dataset.url) === -1 && !n.classList.contains('removing')) {
        n.classList.add('removing');
        setTimeout(function() { try { dmQueueList.removeChild(n); } catch(e){} }, 220);
      }
    });

    // Adicionar itens novos
    dlQueue.forEach(function(item, idx) {
      if (existingUrls.indexOf(item.url) === -1) {
        var el = document.createElement('div');
        el.className = 'bp-dm-qi';
        el.dataset.url = item.url;
        el.style.animationDelay = (idx * 35) + 'ms';

        var removeBtn = '<button class="bp-dm-qi-remove" type="button" title="Remover da fila">✕</button>';
        el.innerHTML =
          '<span class="bp-dm-qi-icon">' + (item.type === 'speed' ? '⚡' : '⬇️') + '</span>' +
          '<span class="bp-dm-qi-name">' + _esc(_trackLabel(item.meta)) + '</span>' +
          removeBtn;

        // FIX 5 — botão ✕ por item
        (function(capturedUrl) {
          el.querySelector('.bp-dm-qi-remove').addEventListener('click', function () {
            _removeFromQueue(capturedUrl);
          });
        })(item.url);

        dmQueueList.appendChild(el);
      }
    });
  }

  function _dmRemoveQueueItem(url) {
    if (!dmQueueList) return;
    var el = dmQueueList.querySelector('[data-url="' + _escapeSel(url) + '"]');
    if (!el || el.classList.contains('removing')) return;
    el.classList.add('removing');
    setTimeout(function() { try { dmQueueList.removeChild(el); } catch(e){} }, 220);
    setTimeout(function() {
      if (dlQueue.length === 0) {
        if (dmQueueSection) dmQueueSection.classList.remove('show');
        if (dmSep) dmSep.classList.remove('show');
      }
    }, 260);
  }

  // ═══════════════════════════════════════
  // BARRA — crawl suave
  // ═══════════════════════════════════════
  function setProgressToast(pct, msg, crawlCeiling) {
    barCurrent = pct * 100;
    barTarget  = (crawlCeiling !== undefined ? crawlCeiling : pct) * 100;
    _applyBar(barCurrent);
    if (dmStatusEl && msg) dmStatusEl.textContent = msg;
    if (barTarget > barCurrent && !barRaf) barRaf = requestAnimationFrame(_crawlStep);
  }

  function _crawlStep() {
    if (barCurrent >= barTarget) { barRaf = null; return; }
    var diff = barTarget - barCurrent;
    var step = Math.max(0.04, diff * 0.012);
    barCurrent = Math.min(barTarget - 0.08, barCurrent + step);
    _applyBar(barCurrent);
    barRaf = requestAnimationFrame(_crawlStep);
  }

  function _applyBar(pct) {
    var w = pct.toFixed(1) + '%';
    if (dmFill) dmFill.style.width = w;
    if (dmPct)  dmPct.textContent  = Math.round(pct) + '%';
  }

  function stopCrawl() {
    if (barRaf) { cancelAnimationFrame(barRaf); barRaf = null; }
    barCurrent = 0; barTarget = 0;
  }

  function setProgress(pct, msg) {
    var w = Math.round(pct * 100) + '%';
    if (sdlFill) sdlFill.style.width = w;
    if (sdlPct)  sdlPct.textContent  = w;
    if (msg && sdlLabel) sdlLabel.textContent = msg;
    setProgressToast(pct, msg);
  }

  // ═══════════════════════════════════════
  // MODAL helpers
  // ═══════════════════════════════════════
  function resetModalToChoice() {
    if (btnNormal) { btnNormal.style.display = ''; btnNormal.classList.remove('is-loading'); }
    if (btnSpeed)  { btnSpeed.style.display  = ''; btnSpeed.classList.remove('is-loading'); }
    var rem = overlay && overlay.querySelector('.sdl-remember');
    if (rem) rem.style.display = '';
    if (sdlProg) sdlProg.classList.remove('show');
    if (sdlFill) sdlFill.style.width = '0%';
    if (sdlPct)  sdlPct.textContent  = '0%';
    if (sdlDlHeader) { sdlDlHeader.textContent = ''; sdlDlHeader.classList.remove('is-speed'); }
    if (sdlDlFile)   sdlDlFile.textContent = '';
    if (sdlLabel)    sdlLabel.textContent = 'Preparando…';
    var h3  = overlay && overlay.querySelector('#bp-sdl-modal h3');
    var sub = overlay && overlay.querySelector('.sdl-sub');
    if (h3)  h3.style.display  = '';
    if (sub) sub.style.display = '';
    if (btnSwitch)   btnSwitch.classList.remove('show');
    if (btnClose)    btnClose.hidden = false;
    if (chkRemember) chkRemember.checked = false;
    modalOpenTime = Date.now();
  }

  function openModal(url, meta) {
    injectCSS();
    buildModal();
    btnNormal.href = '#';

    if (getRemember() && getPref()) {
      // FIX 1 — grace period antes de iniciar
      var sw = document.getElementById('bp-dm-switch');
      if (sw) sw.classList.add('show');
      showGrace(url, meta, getPref());
    } else {
      activeUrl  = url;
      activeMeta = meta || null;
      resetModalToChoice();
      chkRemember.checked = getRemember();
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }

  // FIX 2 — closeModal sempre libera overflow
  function closeModal(forced) {
    if (!overlay) return;
    overlay.classList.remove('show');
    releaseOverflow();                        // sempre, sem condição
    if (dlRunning && dmEl && !forced) {
      dmEl.classList.remove('show');
      void dmEl.offsetWidth;
      dmEl.classList.add('show');
    }
    if (!dlRunning) { activeUrl = ''; activeMeta = null; }
  }

  // ═══════════════════════════════════════
  // BADGE DE PREFERÊNCIA
  // ═══════════════════════════════════════
  function updatePrefBadges() {
    document.querySelectorAll('.music-card .download').forEach(function (link) {
      var old = link.querySelector('.bp-dl-pref-tag');
      if (old) old.parentNode.removeChild(old);
    });
  }

  // ═══════════════════════════════════════
  // ÁUDIO — Speed Worker (inalterado)
  // ═══════════════════════════════════════
  var _speedWorker = null;

  function getSpeedWorker() {
    if (_speedWorker) return _speedWorker;
    var code = [
      '(function(){',
      '  var lamejsCDN="' + LAME_CDN + '";var lameReady=false;',
      '  function ensureLame(cb){if(lameReady){cb();return;}try{importScripts(lamejsCDN);lameReady=true;cb();}catch(e){self.postMessage({error:"lamejs:"+e.message});}}',
      '  function f32ToI16(buf){var out=new Int16Array(buf.length);for(var i=0;i<buf.length;i++){var v=Math.max(-1,Math.min(1,buf[i]));out[i]=v<0?v*0x8000:v*0x7FFF;}return out;}',
      '  self.onmessage=function(e){var d=e.data;ensureLame(function(){try{',
      '    var stereo=d.channels>=2;var enc=new lamejs.Mp3Encoder(stereo?2:1,d.sampleRate,d.kbps);',
      '    var L=f32ToI16(new Float32Array(d.left));var R=stereo?f32ToI16(new Float32Array(d.right)):null;',
      '    var BLK=1152,parts=[];',
      '    for(var i=0;i<L.length;i+=BLK){var lc=L.subarray(i,i+BLK);var b=stereo?enc.encodeBuffer(lc,R.subarray(i,i+BLK)):enc.encodeBuffer(lc);if(b.length)parts.push(new Uint8Array(b));}',
      '    var tail=enc.flush();if(tail.length)parts.push(new Uint8Array(tail));',
      '    var total=parts.reduce(function(s,p){return s+p.length;},0);var out=new Uint8Array(total);var offset=0;',
      '    parts.forEach(function(p){out.set(p,offset);offset+=p.length;});',
      '    self.postMessage({mp3:out.buffer},[out.buffer]);',
      '  }catch(e){self.postMessage({error:e.message});}});};',
      '})()'
    ].join('\n');
    try {
      var blob = new Blob([code], { type: 'application/javascript' });
      _speedWorker = new Worker(URL.createObjectURL(blob));
    } catch(e) { _speedWorker = null; }
    return _speedWorker;
  }

  function encodeWithWorker(rendered, ch, sr) {
    return new Promise(function(resolve, reject) {
      var worker = getSpeedWorker();
      if (!worker) { reject(new Error('Web Worker não suportado')); return; }
      var left  = rendered.getChannelData(0).buffer.slice(0);
      var right = ch >= 2 ? rendered.getChannelData(1).buffer.slice(0) : null;
      var transferable = right ? [left, right] : [left];
      worker.onmessage = function(e) { if (e.data.error) reject(new Error(e.data.error)); else resolve(new Blob([e.data.mp3], { type: 'audio/mpeg' })); };
      worker.onerror   = function(e) { reject(new Error(e.message || 'Erro no worker')); };
      worker.postMessage({ left: left, right: right, channels: ch, sampleRate: sr, kbps: MP3_KBPS }, transferable);
    });
  }

  function applySpeed(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { reject(new Error('AudioContext não suportado')); return; }
      var ctx = new AC();
      ctx.decodeAudioData(arrayBuffer.slice(0), function (decoded) {
        try { ctx.close(); } catch(e) {}
        var ch = decoded.numberOfChannels, sr = decoded.sampleRate;
        var outL = Math.ceil(decoded.length / SPEED);
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) { reject(new Error('OfflineAudioContext não suportado')); return; }
        var offline = new OAC(ch, outL, sr);
        var src = offline.createBufferSource();
        src.buffer = decoded; src.playbackRate.value = SPEED;
        try { src.preservesPitch = false; }       catch(e) {}
        try { src.mozPreservesPitch = false; }    catch(e) {}
        try { src.webkitPreservesPitch = false; } catch(e) {}
        src.connect(offline.destination); src.start(0);
        setProgressToast(0.35, 'Renderizando…', 0.62);
        offline.startRendering().then(function (rendered) {
          setProgressToast(0.65, 'Convertendo para MP3…', 0.95);
          encodeWithWorker(rendered, ch, sr).then(resolve).catch(reject);
        }).catch(reject);
      }, function () { try { ctx.close(); } catch(e) {} reject(new Error('Falha ao decodificar o áudio')); });
    });
  }

  // ═══════════════════════════════════════
  // RUNNERS
  // ═══════════════════════════════════════
  function runNormalDownload(url) {
    if (!url) return;
    dlRunning = true;
    var meta = activeMeta;
    dmShow('normal', meta);
    setProgressToast(0.05, 'Baixando…', 0.75);

    currentAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var fetchOpts = currentAbort ? { signal: currentAbort.signal } : {};
    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';

    fetch(fetchUrl, fetchOpts)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setProgressToast(0.8, 'Quase lá…', 0.95);
        return res.blob();
      })
      .then(function (blob) {
        currentAbort = null;
        setProgressToast(1, 'Pronto ✔');
        _triggerDownload(blob, normalName(url, meta));
        dlBatchCompleted++;
        setTimeout(function () {
          if (dlQueue.length > 0) { processNext(); }
          else { dlRunning = false; dlBatchTotal = 0; dlBatchCompleted = 0; dmHide(); }
        }, 1200);
      })
      .catch(function (err) {
        currentAbort = null;
        dlRunning = false;
        var wasAborted = err && (err.name === 'AbortError' || err.message === 'The user aborted a request.');
        if (!wasAborted) {
          if (dmStatusEl) dmStatusEl.textContent = '❌ ' + (err.message || 'Erro no download');
          setTimeout(function () { if (dlQueue.length > 0) processNext(); else { dlBatchTotal = 0; dlBatchCompleted = 0; dmHide(); } }, 2200);
        }
      });
  }

  function runSpeedDownload(url) {
    if (!url) return;
    dlRunning = true;
    var meta = activeMeta;
    dmShow('speed', meta);
    setProgressToast(0.05, 'Baixando…', 0.18);

    currentAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var fetchOpts = currentAbort ? { signal: currentAbort.signal } : {};
    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';

    fetch(fetchUrl, fetchOpts)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        currentAbort = null; // fetch concluído, a partir daqui é processamento local
        setProgressToast(0.2, 'Acelerando o áudio…', 0.33);
        return res.arrayBuffer();
      })
      .then(applySpeed)
      .then(function (blob) {
        setProgressToast(1, 'Pronto ✔');
        _triggerDownload(blob, speedName(url, meta));
        dlBatchCompleted++;
        setTimeout(function () {
          if (dlQueue.length > 0) { processNext(); }
          else { dlRunning = false; dlBatchTotal = 0; dlBatchCompleted = 0; dmHide(); }
        }, 1800);
      })
      .catch(function (err) {
        currentAbort = null;
        dlRunning = false;
        var wasAborted = err && (err.name === 'AbortError' || err.message === 'The user aborted a request.');
        if (!wasAborted) {
          if (dmStatusEl) dmStatusEl.textContent = '❌ ' + (err.message || 'Erro no processamento');
          setTimeout(function () { if (dlQueue.length > 0) processNext(); else { dlBatchTotal = 0; dlBatchCompleted = 0; dmHide(); } }, 2200);
        }
      });
  }

  function _triggerDownload(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); } catch(e) {}
      try { document.body.removeChild(a); } catch(e) {}
    }, 600);
  }

  // ═══════════════════════════════════════
  // HELPERS — filename (inalterado)
  // ═══════════════════════════════════════
  function baseName(url) {
    var b = String(url || '').split('?')[0];
    return decodeURIComponent(b.substring(b.lastIndexOf('/') + 1) || 'musica.mp3');
  }
  function extractIdFromFilename(fn) {
    var m = String(fn || '').match(/__([a-z0-9_-]+)\.mp3$/i);
    return m ? m[1] : '';
  }
  function sanitizeFilenamePart(s) {
    s = String(s || '').trim();
    s = s.replace(/[\\\/:*?"<>|]+/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }
  function niceBaseNameFromMeta(url, meta) {
    var fn     = baseName(url);
    var id     = extractIdFromFilename(fn);
    var artist = sanitizeFilenamePart(meta && meta.artist ? meta.artist : '');
    var title  = sanitizeFilenamePart(meta && meta.title  ? meta.title  : '');
    if (!artist && !title) {
      var raw = fn.replace(/\.mp3$/i, '').replace(/__([a-z0-9_-]+)$/i, '');
      artist = sanitizeFilenamePart(raw) || 'BoraPraCima';
    }
    var name = (artist && title) ? artist + ' - ' + title : (artist || title || 'BoraPraCima');
    name += ' [borapracima.site]';
    if (id) name += '__' + id;
    return name;
  }
  function speedName(url, meta)  { return niceBaseNameFromMeta(url, meta) + '_speed.mp3'; }
  function normalName(url, meta) { return niceBaseNameFromMeta(url, meta) + '.mp3'; }

  // ═══════════════════════════════════════
  // HELPERS — UI
  // ═══════════════════════════════════════
  function _trackLabel(meta) {
    if (!meta) return 'Faixa';
    if (meta.artist && meta.title) return meta.artist + ' — ' + meta.title;
    return meta.artist || meta.title || 'Faixa';
  }
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  // Para uso em querySelector com URLs que podem ter caracteres especiais
  function _escapeSel(s) {
    return String(s || '').replace(/["\\]/g, '\\$&');
  }

  // ═══════════════════════════════════════
  // COLETAR META DO CARD (inalterado)
  // ═══════════════════════════════════════
  function getMetaFromLink(link) {
    try {
      var card = link && link.closest ? link.closest('.music-card') : null;
      if (!card) return null;
      var artist = (card.dataset && (card.dataset.artist || card.getAttribute('data-artist'))) || '';
      var title  = (card.dataset && (card.dataset.title  || card.getAttribute('data-title')))  || '';
      if (!title)  { var tl = card.querySelector('.title-link');  if (tl  && tl.textContent)  title  = tl.textContent.trim(); }
      if (!artist) { var al = card.querySelector('.artist-link'); if (al && al.textContent) artist = al.textContent.trim(); }
      return { artist: artist, title: title };
    } catch(e) { return null; }
  }

  // ═══════════════════════════════════════
  // NEUTRALIZAR <a download> (inalterado)
  // ═══════════════════════════════════════
  function neutralizeOne(link) {
    try { if (!link || !link.getAttribute) return; link.removeAttribute('download'); link.removeAttribute('target'); } catch(e) {}
  }
  function neutralizeAll() { document.querySelectorAll('.music-card .download').forEach(neutralizeOne); }
  function watchMutations() {
    try {
      var mo = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === 'attributes' && m.target && m.target.matches && m.target.matches('.music-card .download')) neutralizeOne(m.target);
          if (m.addedNodes && m.addedNodes.length) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (!n || n.nodeType !== 1) continue;
              if (n.matches && n.matches('.music-card .download')) neutralizeOne(n);
              var inner = n.querySelectorAll ? n.querySelectorAll('.music-card .download') : null;
              if (inner && inner.length) inner.forEach(neutralizeOne);
            }
          }
        }
      });
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['download','target'] });
    } catch(e) {}
  }

  // ═══════════════════════════════════════
  // INTERCEPTAR CLIQUE (inalterado)
  // ═══════════════════════════════════════
  function findDownloadLinkFromTarget(t) {
    try { return t && t.closest ? t.closest('.music-card .download') : null; } catch(e) {}
    while (t && t.nodeType === 1) {
      if (t.matches && t.matches('.music-card .download')) return t;
      t = t.parentElement;
    }
    return null;
  }

  function intercept(e) {
    var link = findDownloadLinkFromTarget(e.target);
    if (!link) return;
    var url = link.getAttribute('href') || '';
    if (!url) return;
    var meta = getMetaFromLink(link);
    neutralizeOne(link);
    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.stopPropagation) e.stopPropagation();
    openModal(url, meta);
  }

  // ═══════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════
  function init() {
    injectCSS();
    buildModal();
    updatePrefBadges();
    neutralizeAll();
    watchMutations();
  }

  document.addEventListener('click', function (e) { intercept(e); }, true);

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

})();
