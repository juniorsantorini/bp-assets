/**
 * bp-speed-download.js
 * Intercepta clique no "Baixar" dos music-cards e abre modal Normal/Speed.
 * Speed é gerado no navegador (OfflineAudioContext + lamejs).
 *
 * FIX:
 *  - Nome do arquivo SPEED no padrão bonito: "ARTISTA - TITULO [borapracima.site]__ID_speed.mp3"
 *    (usa data-artist / data-title do .music-card + __ID da URL)
 *  - "Lembrar minha escolha" agora pode marcar e DESMARCAR (sem botão extra).
 */
(function () {
  'use strict';

  // =========================
  // CONFIG
  // =========================
  var SPEED    = Math.pow(2, 133 / 1200);
  var MP3_KBPS = 320;
  var LAME_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';

  // Preferência e "lembrar"
  var LS_PREF     = 'bp_dl_pref';      // 'normal' | 'speed' | ''
  var LS_REMEMBER = 'bp_dl_remember';  // '1' | ''

  // =========================
  // Preferência salva
  // =========================
  function getPref() {
    try {
      var v = localStorage.getItem(LS_PREF);
      return (v === 'normal' || v === 'speed') ? v : '';
    } catch (e) { return ''; }
  }
  function setPref(v) {
    try {
      if (v) localStorage.setItem(LS_PREF, v);
      else localStorage.removeItem(LS_PREF);
    } catch (e) {}
  }

  function getRemember() {
    try { return localStorage.getItem(LS_REMEMBER) === '1'; }
    catch(e){ return false; }
  }
  function setRemember(on) {
    try {
      if (on) localStorage.setItem(LS_REMEMBER, '1');
      else localStorage.removeItem(LS_REMEMBER);
    } catch(e){}
  }

  function clearRememberAndPref() {
    setRemember(false);
    setPref('');
  }

  // =========================
  // lamejs sob demanda
  // =========================
  var lameReady = false, lameLoading = false, lameQ = [];
  function loadLame(cb) {
    if (lameReady)   { cb(); return; }
    if (lameLoading) { lameQ.push(cb); return; }
    lameLoading = true;
    lameQ.push(cb);

    var s = document.createElement('script');
    s.src = LAME_CDN;
    s.async = true;

    s.onload = function () {
      lameReady = true;
      lameLoading = false;
      var q = lameQ.slice(); lameQ = [];
      q.forEach(function (f) { try { f(); } catch(e){} });
    };

    s.onerror = function () {
      lameLoading = false;
      var err = new Error('lamejs não carregou');
      var q = lameQ.slice(); lameQ = [];
      q.forEach(function (f) { try { f(err); } catch(e){} });
    };

    document.head.appendChild(s);
  }

  // =========================
  // CSS
  // =========================
  function injectCSS() {
    if (document.getElementById('bp-sdl-css')) return;
    var s = document.createElement('style');
    s.id = 'bp-sdl-css';
    s.textContent =
      '#bp-sdl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .22s ease}' +
      '#bp-sdl-overlay.show{opacity:1;pointer-events:auto}' +
      '#bp-sdl-modal{background:linear-gradient(150deg,#1e0f1c 0%,#110a0f 100%);border:1px solid rgba(164,7,129,.35);border-radius:24px;padding:26px 22px 20px;width:100%;max-width:340px;position:relative;box-shadow:0 32px 80px rgba(0,0,0,.8),0 0 0 1px rgba(164,7,129,.08);transform:translateY(20px) scale(.96);transition:transform .25s cubic-bezier(.34,1.56,.64,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '#bp-sdl-overlay.show #bp-sdl-modal{transform:translateY(0) scale(1)}' +
      '#bp-sdl-modal h3{font-size:16px;font-weight:800;color:#fff;margin:0 0 2px;letter-spacing:.1px}' +
      '#bp-sdl-modal .sdl-sub{font-size:11px;color:rgba(255,255,255,.3);margin:0 0 18px;letter-spacing:.2px}' +
      '#bp-sdl-close{position:absolute;top:14px;right:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:50%;width:26px;height:26px;color:rgba(255,255,255,.4);font-size:13px;cursor:pointer;padding:0;line-height:26px;text-align:center;transition:background .15s,color .15s}' +
      '#bp-sdl-close:hover{background:rgba(255,255,255,.14);color:#fff}' +
      '.sdl-opt{display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.09);border-radius:14px;cursor:pointer;text-align:left;margin-bottom:10px;transition:background .18s,border-color .18s,transform .18s;font-family:inherit;text-decoration:none;box-sizing:border-box;color:#fff}' +
      '.sdl-opt:hover{background:rgba(164,7,129,.18);border-color:rgba(164,7,129,.45);transform:translateY(-2px)}' +
      '.sdl-opt:active{transform:translateY(0)}' +
      '.sdl-opt.is-loading{opacity:.55;cursor:wait;pointer-events:none}' +
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
      '@keyframes bp-shine{0%{background-position:200% center}100%{background-position:-200% center}}' +
      '@keyframes bp-glow{0%,100%{box-shadow:0 0 6px rgba(164,7,129,.5)}50%{box-shadow:0 0 16px rgba(224,112,200,.9)}}' +
      '@keyframes bp-pulse-in{0%{opacity:0;transform:scale(.97)}100%{opacity:1;transform:scale(1)}}' +
      '.sdl-prog{display:none;margin-top:4px;animation:bp-pulse-in .2s ease both}' +
      '.sdl-prog.show{display:block}' +
      '.sdl-dl-header{font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-.3px;line-height:1.2}' +
      '.sdl-dl-header.is-speed{color:#e070c8}' +
      '.sdl-dl-file{font-size:12px;color:rgba(255,255,255,.35);margin-bottom:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.sdl-prog-bar{height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:visible;position:relative}' +
      '.sdl-prog-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#6b0057,#a40781 40%,#e070c8 70%,#f0a0e0);background-size:300% auto;transition:width .45s cubic-bezier(.4,0,.2,1);animation:bp-shine 2s linear infinite;position:relative}' +
      '.sdl-prog-fill::after{content:"";position:absolute;right:-2px;top:50%;transform:translateY(-50%);width:14px;height:14px;border-radius:50%;background:#e070c8;box-shadow:0 0 0 3px rgba(224,112,200,.2);animation:bp-glow 1.4s ease-in-out infinite;transition:opacity .3s}' +
      '.sdl-prog-footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px}' +
      '.sdl-prog-label{font-size:11px;color:rgba(255,255,255,.35)}' +
      '.sdl-prog-pct{font-size:14px;font-weight:800;color:#e070c8}' +
      '@keyframes bp-toast-in{0%{opacity:0;transform:translateY(-12px) scale(.97)}100%{opacity:1;transform:translateY(0) scale(1)}}' +
      '#bp-toasts-wrapper{position:fixed;top:18px;right:18px;left:18px;max-width:320px;margin:0 auto;z-index:9999999;display:flex;flex-direction:column;gap:8px;pointer-events:none}' +
      '@media(min-width:480px){#bp-toasts-wrapper{left:auto;right:20px;max-width:300px;margin:0}}' +
      '#bp-toast{background:linear-gradient(150deg,#1e0f1c 0%,#110a0f 100%);border:1px solid rgba(164,7,129,.45);border-radius:18px;padding:16px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.75),0 0 0 1px rgba(164,7,129,.1);display:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:auto}' +
      '#bp-toast.show{display:block;animation:bp-toast-in .26s cubic-bezier(.34,1.56,.64,1) both}' +
      '#bp-toast-pref{background:linear-gradient(150deg,#1e0f1c 0%,#110a0f 100%);border:1px solid rgba(164,7,129,.35);border-radius:14px;padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.6),0 0 0 1px rgba(164,7,129,.08);display:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:auto}' +
      '#bp-toast-pref.show{display:block;animation:bp-toast-in .26s cubic-bezier(.34,1.56,.64,1) both}' +
      '#bp-toast-close{position:absolute;top:11px;right:13px;background:rgba(255,255,255,.07);border:none;border-radius:50%;width:22px;height:22px;color:rgba(255,255,255,.45);font-size:11px;cursor:pointer;padding:0;line-height:22px;text-align:center;transition:background .15s,color .15s}' +
      '#bp-toast-close:hover{background:rgba(255,255,255,.15);color:#fff}' +
      '#bp-toast-title{font-size:12px;font-weight:700;color:#e070c8;margin:0 24px 2px 0;letter-spacing:.2px;text-transform:uppercase}' +
      '#bp-toast-file{font-size:11px;color:rgba(255,255,255,.35);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90%}' +
      '#bp-toast-bar{height:5px;background:rgba(255,255,255,.08);border-radius:999px;overflow:visible;position:relative}' +
      '#bp-toast-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#6b0057,#a40781 40%,#e070c8 70%,#f9a8e8);background-size:300% auto;transition:width .45s cubic-bezier(.4,0,.2,1);animation:bp-shine 2s linear infinite;position:relative}' +
      '#bp-toast-fill::after{content:"";position:absolute;right:-1px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:#e070c8;animation:bp-glow 1.4s ease-in-out infinite}' +
      '#bp-toast-footer{display:flex;justify-content:space-between;align-items:center;margin-top:7px}' +
      '#bp-toast-pct{font-size:12px;font-weight:800;color:#e070c8}' +
      '#bp-toast-status{font-size:10px;color:rgba(255,255,255,.35);text-align:right}' +
      '#bp-toast-queue{display:none;font-size:11px;font-weight:700;color:#e070c8;margin-top:7px;letter-spacing:.2px}' +
      '#bp-toast-queue.show{display:block}' +
      '@keyframes bp-dedup-flash{0%,100%{opacity:1}30%{opacity:.3}60%{opacity:.85}}' +
      '.bp-dedup-flash{animation:bp-dedup-flash .5s ease both!important}' +
      '#bp-toast-switch{display:block;width:100%;background:none;border:none;padding:0;font-size:11px;color:rgba(164,7,129,.8);cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px;letter-spacing:.2px;text-align:center}' +
      '#bp-toast-switch:hover{color:#e070c8}' +
      '.bp-dl-pref-tag{display:inline-block;font-size:9px;padding:1px 5px;border-radius:999px;vertical-align:middle;margin-left:4px;background:rgba(164,7,129,.25);border:1px solid rgba(164,7,129,.4);color:#e070c8;font-weight:700;letter-spacing:.4px;pointer-events:none}' +
      '.sdl-switch{display:none;width:100%;margin-top:14px;padding:11px 16px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.15);border-radius:14px;color:rgba(255,255,255,.65);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .18s,border-color .18s}' +
      '.sdl-switch:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.3)}' +
      '.sdl-switch.show{display:block}';
    document.head.appendChild(s);
  }

  // =========================
  // Modal
  // =========================
  var overlay, btnNormal, btnSpeed, chkRemember, sdlProg, sdlFill, sdlLabel, sdlPct, sdlDlHeader, sdlDlFile, btnSwitch, btnClose;
  var toastEl, toastFill, toastPct, toastStatus, toastTitle, toastFile;
  var dlQueue   = [];   // { url, meta, type:'normal'|'speed' }
  var dlRunning = false;
  var currentMeta = null;
  var activeUrl = '';
  var activeMeta = null;

  // Crawl da barra de progresso
  var barCurrent = 0;   // % atual exibida (0-100)
  var barTarget  = 0;   // teto que o crawl persegue (0-100)
  var barRaf     = null;

  function buildModal() {
    if (document.getElementById('bp-sdl-overlay')) {
      overlay = document.getElementById('bp-sdl-overlay');
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
      return;
    }

    overlay = document.createElement('div');
    overlay.id = 'bp-sdl-overlay';
    overlay.innerHTML =
      '<div id="bp-sdl-modal">' +
        '<button id="bp-sdl-close" type="button">✕</button>' +
        '<h3>Baixar faixa</h3>' +
        '<p class="sdl-sub">Escolha o formato do download</p>' +

        // IMPORTANTE: sem atributo download aqui, pra deixar o servidor dar o filename bonitão
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

    // Toast cards (visible when modal is closed, desktop)
    if (!document.getElementById('bp-toasts-wrapper')) {
      var toastsWrapper = document.createElement('div');
      toastsWrapper.id = 'bp-toasts-wrapper';

      toastEl = document.createElement('div');
      toastEl.id = 'bp-toast';
      toastEl.innerHTML =
        '<button id="bp-toast-close" type="button">✕</button>' +
        '<div id="bp-toast-title">Baixando…</div>' +
        '<div id="bp-toast-file"></div>' +
        '<div id="bp-toast-bar"><div id="bp-toast-fill"></div></div>' +
        '<div id="bp-toast-footer">' +
          '<span id="bp-toast-pct">0%</span>' +
          '<span id="bp-toast-status">Preparando…</span>' +
        '</div>' +
        '<div id="bp-toast-queue"></div>';

      var prefToastEl = document.createElement('div');
      prefToastEl.id = 'bp-toast-pref';
      prefToastEl.innerHTML =
        '<button type="button" id="bp-toast-switch">🔄 Trocar preferência de download</button>';

      toastsWrapper.appendChild(toastEl);
      toastsWrapper.appendChild(prefToastEl);
      document.body.appendChild(toastsWrapper);

      document.getElementById('bp-toast-close').addEventListener('click', function () {
        toastEl.classList.remove('show');
      });
      document.getElementById('bp-toast-switch').addEventListener('click', function () {
        clearRememberAndPref();
        updatePrefBadges();
        document.getElementById('bp-toast-pref').classList.remove('show');
      });
    } else {
      toastEl = document.getElementById('bp-toast');
    }
    toastFill   = document.getElementById('bp-toast-fill');
    toastPct    = document.getElementById('bp-toast-pct');
    toastStatus = document.getElementById('bp-toast-status');
    toastTitle  = document.getElementById('bp-toast-title');
    toastFile   = document.getElementById('bp-toast-file');

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

    btnClose.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    btnNormal.addEventListener('click', function (e) {
      e.preventDefault();
      if (!chkRemember.checked && Date.now() - modalOpenTime < 1000) return;
      if (chkRemember.checked) { setRemember(true); setPref('normal'); updatePrefBadges(); }
      var u = activeUrl, m = activeMeta;
      closeModal();
      enqueue(u, m, 'normal');
    });

    btnSpeed.addEventListener('click', function () {
      if (!chkRemember.checked && Date.now() - modalOpenTime < 1000) return;
      if (chkRemember.checked) { setRemember(true); setPref('speed'); updatePrefBadges(); }
      var u = activeUrl, m = activeMeta;
      closeModal();
      enqueue(u, m, 'speed');
    });

    // ✅ Só desmarcar = esquecer tudo
    chkRemember.addEventListener('change', function () {
      if (chkRemember.checked) {
        setRemember(true);
      } else {
        clearRememberAndPref();
        updatePrefBadges();
      }
    });

    btnSwitch.addEventListener('click', function () {
      clearRememberAndPref();
      updatePrefBadges();
      resetModalToChoice();
    });
  }

  var modalOpenTime = 0;

  // =========================
  // Fila de downloads
  // =========================
  function enqueue(url, meta, type) {
    // Dedup: URL já rodando ou já na fila
    if (dlRunning && activeUrl === url) { flashDuped(url); return; }
    for (var i = 0; i < dlQueue.length; i++) {
      if (dlQueue[i].url === url) { flashDuped(url); return; }
    }
    dlQueue.push({ url: url, meta: meta, type: type });
    updateQueueBadge();
    if (!dlRunning) processNext();
  }

  function flashDuped(url) {
    // Pisca o botão do card correspondente
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
  }

  function processNext() {
    if (dlQueue.length === 0) {
      dlRunning = false;
      return;
    }
    dlRunning = true;
    var item = dlQueue.shift();
    activeUrl  = item.url;
    activeMeta = item.meta;
    updateQueueBadge();
    if (item.type === 'speed') {
      runSpeedDownload(item.url);
    } else {
      runNormalDownload(item.url);
    }
  }

  function updateQueueBadge() {
    var el = document.getElementById('bp-toast-queue');
    if (!el) return;
    var n = dlQueue.length;
    if (n === 1) {
      el.textContent = '🎵 mais 1 na fila';
      el.classList.add('show');
    } else if (n > 1) {
      el.textContent = '🎵 mais ' + n + ' na fila';
      el.classList.add('show');
    } else {
      el.textContent = '';
      el.classList.remove('show');
    }
    // Atualiza título do toast em tempo real se ele está visível
    if (toastEl && toastEl.classList.contains('show') && toastTitle && dlRunning) {
      var cur = toastTitle.textContent.split(' · ')[0]; // parte base sem o contador
      toastTitle.textContent = n > 0 ? cur + ' · +' + n + ' NA FILA' : cur;
    }
  }

  function resetModalToChoice() {
    // Mostra botões + checkbox, esconde progresso + switch, mostra ✕
    btnNormal.style.display = '';
    btnSpeed.style.display  = '';
    btnSpeed.classList.remove('is-loading');
    document.querySelector('.sdl-remember').style.display = '';
    sdlProg.classList.remove('show');
    sdlFill.style.width = '0%';
    if (sdlPct)  sdlPct.textContent  = '0%';
    if (sdlDlHeader) { sdlDlHeader.textContent = ''; sdlDlHeader.classList.remove('is-speed'); }
    if (sdlDlFile)   sdlDlFile.textContent = '';
    sdlLabel.textContent = 'Preparando…';
    // Restore modal title/sub
    var h3 = overlay && overlay.querySelector('#bp-sdl-modal h3');
    var sub = overlay && overlay.querySelector('.sdl-sub');
    if (h3)  h3.style.display  = '';
    if (sub) sub.style.display = '';
    btnSwitch.classList.remove('show');
    btnClose.hidden = false;
    chkRemember.checked = false;
    modalOpenTime = Date.now();
  }

  function openModal(url, meta) {
    injectCSS();
    buildModal();

    btnNormal.href = '#';
    var pref = getPref();

    if (getRemember() && pref) {
      // Pref salva: enfileira direto, sem abrir modal
      var prefToast = document.getElementById('bp-toast-pref');
      if (prefToast) prefToast.classList.add('show');
      enqueue(url, meta, pref);
    } else {
      // Choice mode: abre modal para o usuário escolher
      activeUrl  = url;
      activeMeta = meta || null;
      resetModalToChoice();
      chkRemember.checked = getRemember();
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.style.overflow = '';
    if (dlRunning && toastEl) {
      toastEl.classList.remove('show');
      void toastEl.offsetWidth;
      toastEl.classList.add('show');
    }
    // Só limpa se não tem download rodando — runners capturam meta localmente
    if (!dlRunning) {
      activeUrl  = '';
      activeMeta = null;
    }
  }

  // =========================
  // Badge de preferência no botão Baixar
  // =========================
  function updatePrefBadges() {
    document.querySelectorAll('.music-card .download').forEach(function (link) {
      var old = link.querySelector('.bp-dl-pref-tag');
      if (old) old.parentNode.removeChild(old);
    });
  }

  // =========================
  // Áudio (Speed)
  // =========================
  // Worker inline — f32ToI16 + lamejs encoding rodam fora do main thread
  var _speedWorker = null;
  var _speedWorkerReady = false;

  function getSpeedWorker() {
    if (_speedWorker) return _speedWorker;
    var code = [
      '(function(){',
      '  var lamejsCDN = "' + LAME_CDN + '";',
      '  var lameReady = false;',
      '  function ensureLame(cb) {',
      '    if (lameReady) { cb(); return; }',
      '    try { importScripts(lamejsCDN); lameReady = true; cb(); }',
      '    catch(e) { self.postMessage({ error: "lamejs nao carregou: " + e.message }); }',
      '  }',
      '  function f32ToI16(buf) {',
      '    var out = new Int16Array(buf.length);',
      '    for (var i = 0; i < buf.length; i++) {',
      '      var v = Math.max(-1, Math.min(1, buf[i]));',
      '      out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;',
      '    }',
      '    return out;',
      '  }',
      '  self.onmessage = function(e) {',
      '    var d = e.data;',
      '    ensureLame(function() {',
      '      try {',
      '        var stereo = d.channels >= 2;',
      '        var enc = new lamejs.Mp3Encoder(stereo ? 2 : 1, d.sampleRate, d.kbps);',
      '        var L = f32ToI16(new Float32Array(d.left));',
      '        var R = stereo ? f32ToI16(new Float32Array(d.right)) : null;',
      '        var BLK = 1152, parts = [];',
      '        for (var i = 0; i < L.length; i += BLK) {',
      '          var lc = L.subarray(i, i + BLK);',
      '          var b = stereo ? enc.encodeBuffer(lc, R.subarray(i, i + BLK)) : enc.encodeBuffer(lc);',
      '          if (b.length) parts.push(new Uint8Array(b));',
      '        }',
      '        var tail = enc.flush();',
      '        if (tail.length) parts.push(new Uint8Array(tail));',
      '        var total = parts.reduce(function(s,p){return s+p.length;},0);',
      '        var out = new Uint8Array(total); var offset = 0;',
      '        parts.forEach(function(p){out.set(p,offset);offset+=p.length;});',
      '        self.postMessage({ mp3: out.buffer }, [out.buffer]);',
      '      } catch(e) { self.postMessage({ error: e.message }); }',
      '    });',
      '  };',
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

      // Copia os buffers — necessário para transferência
      var left  = rendered.getChannelData(0).buffer.slice(0);
      var right = ch >= 2 ? rendered.getChannelData(1).buffer.slice(0) : null;

      var transferable = right ? [left, right] : [left];

      worker.onmessage = function(e) {
        if (e.data.error) { reject(new Error(e.data.error)); return; }
        resolve(new Blob([e.data.mp3], { type: 'audio/mpeg' }));
      };
      worker.onerror = function(e) {
        reject(new Error(e.message || 'Erro no worker'));
      };

      worker.postMessage({
        left: left,
        right: right,
        channels: ch,
        sampleRate: sr,
        kbps: MP3_KBPS
      }, transferable);
    });
  }

  function setProgress(pct, msg) {
    var w = Math.round(pct * 100) + '%';
    sdlFill.style.width = w;
    if (sdlPct)  sdlPct.textContent  = w;
    if (msg) sdlLabel.textContent = msg;
    // Update toast
    if (toastFill) toastFill.style.width = w;
    if (toastPct)  toastPct.textContent  = w;
    if (toastStatus && msg) toastStatus.textContent = msg;
  }

  function setProgressToast(pct, msg, crawlCeiling) {
    // pct: valor real do checkpoint (0-1)
    // crawlCeiling: até onde rasteja enquanto espera o próximo checkpoint (0-1, opcional)
    barCurrent = pct * 100;
    barTarget  = (crawlCeiling !== undefined ? crawlCeiling : pct) * 100;
    applyBarWidth(barCurrent);
    if (toastStatus && msg) toastStatus.textContent = msg;
    if (barTarget > barCurrent && !barRaf) barRaf = requestAnimationFrame(barCrawlStep);
  }

  function barCrawlStep() {
    if (barCurrent >= barTarget) { barRaf = null; return; }
    var diff = barTarget - barCurrent;
    // Velocidade: rápida quando longe, lenta quando perto — nunca chega no teto
    var step = Math.max(0.04, diff * 0.012);
    barCurrent = Math.min(barTarget - 0.1, barCurrent + step);
    applyBarWidth(barCurrent);
    barRaf = requestAnimationFrame(barCrawlStep);
  }

  function applyBarWidth(pct) {
    var w = pct.toFixed(1) + '%';
    if (toastFill) toastFill.style.width = w;
    if (toastPct)  toastPct.textContent  = Math.round(pct) + '%';
  }

  function stopCrawl() {
    if (barRaf) { cancelAnimationFrame(barRaf); barRaf = null; }
    barCurrent = 0;
    barTarget  = 0;
  }

  function showToast(title, filename, pendingAfterThis) {
    if (!toastEl) return;
    var label = title;
    if (pendingAfterThis && pendingAfterThis > 0) {
      label = title + ' · +' + pendingAfterThis + ' NA FILA';
    }
    if (toastTitle) toastTitle.textContent = label;
    if (toastFile)  toastFile.textContent  = filename || '';
    if (toastFill)  toastFill.style.width  = '0%';
    if (toastPct)   toastPct.textContent   = '0%';
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    updateQueueBadge();
  }

  function hideToast() {
    stopCrawl();
    if (toastEl) toastEl.classList.remove('show');
    var ts = document.getElementById('bp-toast-pref');
    if (ts) ts.classList.remove('show');
  }

  function applySpeed(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { reject(new Error('AudioContext não suportado')); return; }

      var ctx = new AC();
      ctx.decodeAudioData(arrayBuffer.slice(0), function (decoded) {
        try { ctx.close(); } catch(e){}

        var ch = decoded.numberOfChannels, sr = decoded.sampleRate;
        var outL = Math.ceil(decoded.length / SPEED);

        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) { reject(new Error('OfflineAudioContext não suportado')); return; }

        var offline = new OAC(ch, outL, sr);
        var src = offline.createBufferSource();
        src.buffer = decoded;
        src.playbackRate.value = SPEED;

        try { src.preservesPitch = false; }       catch(e) {}
        try { src.mozPreservesPitch = false; }    catch(e) {}
        try { src.webkitPreservesPitch = false; } catch(e) {}

        src.connect(offline.destination);
        src.start(0);

        setProgressToast(0.35, 'Renderizando…', 0.62);
        offline.startRendering().then(function (rendered) {
          setProgressToast(0.65, 'Convertendo para MP3…', 0.95);
          // Encoding no Web Worker — não trava o main thread
          encodeWithWorker(rendered, ch, sr).then(resolve).catch(reject);
        }).catch(reject);
      }, function () {
        try { ctx.close(); } catch(e){}
        reject(new Error('Falha ao decodificar o áudio'));
      });
    });
  }

  function runNormalDownload(url) {
    if (!url) return;
    dlRunning = true;
    var meta = activeMeta;
    currentMeta = meta;
    var queueTotal = dlQueue.length; // quantas ainda esperam depois desta
    var fname = meta && meta.title ? (meta.artist ? meta.artist + ' — ' + meta.title : meta.title) : 'Versão Normal';
    showToast('⬇️ BAIXANDO FAIXA', fname, queueTotal);
    setProgressToast(0.05, 'Baixando…', 0.75);
    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';
    fetch(fetchUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setProgressToast(0.8, 'Quase lá…', 0.95);
        return res.blob();
      })
      .then(function (blob) {
        setProgressToast(1, 'Pronto ✔');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = normalName(url, meta);
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          try { URL.revokeObjectURL(a.href); } catch(e){}
          try { document.body.removeChild(a); } catch(e){}
        }, 400);
        setTimeout(function () {
          if (dlQueue.length > 0) {
            processNext(); // próximo item — showToast vai atualizar o toast
          } else {
            dlRunning = false;
            hideToast();
          }
        }, 1200);
      })
      .catch(function (err) {
        dlRunning = false;
        if (toastStatus) toastStatus.textContent = '❌ ' + (err.message || 'Erro no download');
        setTimeout(function() { hideToast(); processNext(); }, 2000);
      });
  }

  function runSpeedDownload(url) {
    if (!url) return;
    dlRunning = true;
    var meta = activeMeta;
    var queueTotal = dlQueue.length;
    var fname = meta && meta.title ? (meta.artist ? meta.artist + ' — ' + meta.title : meta.title) : 'Versão Speed';
    showToast('⚡ PROCESSANDO SPEED', fname, queueTotal);
    setProgressToast(0.05, 'Baixando…', 0.18);

    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';

    fetch(fetchUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setProgressToast(0.2, 'Acelerando o áudio…', 0.33);
        return res.arrayBuffer();
      })
      .then(applySpeed)
      .then(function (blob) {
        setProgressToast(1, 'Pronto ✔');

        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = speedName(url, meta);

        document.body.appendChild(a);
        a.click();

        setTimeout(function () {
          try { URL.revokeObjectURL(a.href); } catch(e){}
          try { document.body.removeChild(a); } catch(e){}
          if (dlQueue.length > 0) {
            processNext();
          } else {
            dlRunning = false;
            hideToast();
          }
        }, 1800);
      })
      .catch(function (err) {
        dlRunning = false;
        if (toastStatus) toastStatus.textContent = '❌ ' + (err.message || 'Erro no processamento');
        setTimeout(function() { hideToast(); processNext(); }, 2000);
      });
  }

  // =========================
  // Helpers: filename bonito
  // =========================
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
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function niceBaseNameFromMeta(url, meta) {
    var fn = baseName(url);
    var id = extractIdFromFilename(fn);

    var artist = meta && meta.artist ? meta.artist : '';
    var title  = meta && meta.title ? meta.title : '';

    artist = sanitizeFilenamePart(artist);
    title  = sanitizeFilenamePart(title);

    if (!artist && !title) {
      var raw = fn.replace(/\.mp3$/i, '');
      raw = raw.replace(/__([a-z0-9_-]+)$/i, '');
      raw = sanitizeFilenamePart(raw);
      artist = raw || 'BoraPraCima';
      title  = '';
    }

    var name = '';
    if (artist && title) name = artist + ' - ' + title;
    else if (artist)     name = artist;
    else                 name = title || 'BoraPraCima';

    name += ' [borapracima.site]';
    if (id) name += '__' + id;
    return name;
  }

  function speedName(url, meta) {
    return niceBaseNameFromMeta(url, meta) + '_speed.mp3';
  }

  function normalName(url, meta) {
    return niceBaseNameFromMeta(url, meta) + '.mp3';
  }

  // =========================
  // Coletar meta do card
  // =========================
  function getMetaFromLink(link) {
    try {
      var card = link && link.closest ? link.closest('.music-card') : null;
      if (!card) return null;

      var artist = (card.dataset && (card.dataset.artist || card.getAttribute('data-artist'))) || '';
      var title  = (card.dataset && (card.dataset.title  || card.getAttribute('data-title')))  || '';

      if (!title) {
        var tl = card.querySelector('.title-link');
        if (tl && tl.textContent) title = tl.textContent.trim();
      }

      if (!artist) {
        var al = card.querySelector('.artist-link');
        if (al && al.textContent) artist = al.textContent.trim();
      }

      return { artist: artist, title: title };
    } catch (e) { return null; }
  }

  // =========================
  // Neutralizar <a download>
  // =========================
  function neutralizeOne(link) {
    try {
      if (!link || !link.getAttribute) return;
      link.removeAttribute('download');
      link.removeAttribute('target');
    } catch (e) {}
  }

  function neutralizeAll() {
    document.querySelectorAll('.music-card .download').forEach(neutralizeOne);
  }

  function watchMutations() {
    try {
      var mo = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === 'attributes' && m.target && m.target.matches && m.target.matches('.music-card .download')) {
            neutralizeOne(m.target);
          }
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
    } catch (e) {}
  }

  // =========================
  // Interceptar evento
  // =========================
  function findDownloadLinkFromTarget(t) {
    try { return t && t.closest ? t.closest('.music-card .download') : null; } catch(e) {}
    while (t && t.nodeType === 1) {
      if (t.matches && t.matches('.music-card .download')) return t;
      t = t.parentElement;
    }
    return null;
  }

  function clickNormal(url, meta) {
    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';
    fetch(fetchUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = normalName(url, meta);
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          try { URL.revokeObjectURL(a.href); } catch(e){}
          try { document.body.removeChild(a); } catch(e){}
        }, 1800);
      })
      .catch(function (err) {
        console.error('bp-sdl normal download error:', err);
      });
  }

  function intercept(e) {
    var link = findDownloadLinkFromTarget(e.target);
    if (!link) return;

    var url = link.getAttribute('href') || '';
    if (!url) return;

    var meta = getMetaFromLink(link);

    neutralizeOne(link);

    var pref = getPref();

    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.stopPropagation) e.stopPropagation();
    openModal(url, meta);
  }

  // =========================
  // Init
  // =========================
  function init() {
    injectCSS();
    buildModal();
    updatePrefBadges();

    neutralizeAll();
    watchMutations();
  }

  document.addEventListener('click', function (e) { intercept(e); }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
