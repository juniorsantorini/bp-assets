(function () {
  'use strict';

  var SPEED    = Math.pow(2, 133 / 1200);
  var MP3_KBPS = 128;
  var LAME_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  var LS_PREF  = 'bp_dl_pref';

  function getPref() {
    try { var v = localStorage.getItem(LS_PREF); return (v === 'normal' || v === 'speed') ? v : ''; }
    catch(e) { return ''; }
  }
  function setPref(v) {
    try { if (v) localStorage.setItem(LS_PREF, v); else localStorage.removeItem(LS_PREF); }
    catch(e) {}
  }

  var lameReady = false, lameLoading = false, lameQ = [];
  function loadLame(cb) {
    if (lameReady)   { cb(); return; }
    if (lameLoading) { lameQ.push(cb); return; }
    lameLoading = true; lameQ.push(cb);
    var s = document.createElement('script');
    s.src = LAME_CDN; s.async = true;
    s.onload  = function () { lameReady = true; lameLoading = false; lameQ.forEach(function(f){f();}); lameQ = []; };
    s.onerror = function () { lameLoading = false; var e = new Error('lamejs não carregou'); lameQ.forEach(function(f){f(e);}); lameQ = []; };
    document.head.appendChild(s);
  }

  function injectCSS() {
    if (document.getElementById('bp-sdl-css')) return;
    var s = document.createElement('style');
    s.id = 'bp-sdl-css';
    s.textContent =
      '#bp-sdl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .22s ease}' +
      '#bp-sdl-overlay.show{opacity:1;pointer-events:auto}' +
      '#bp-sdl-modal{background:linear-gradient(150deg,#1c0e1a 0%,#120b10 100%);border:1px solid rgba(164,7,129,.3);border-radius:22px;padding:28px 24px 20px;width:100%;max-width:340px;position:relative;box-shadow:0 28px 72px rgba(0,0,0,.75);transform:translateY(20px) scale(.96);transition:transform .25s cubic-bezier(.34,1.56,.64,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '#bp-sdl-overlay.show #bp-sdl-modal{transform:translateY(0) scale(1)}';
    document.head.appendChild(s);
  }

  var overlay, btnNormal, btnSpeed, chkRemember, sdlProg, sdlFill, sdlLabel;
  var activeUrl = '';

  function buildModal() {
    if (document.getElementById('bp-sdl-overlay')) {
      overlay = document.getElementById('bp-sdl-overlay');
      btnNormal  = document.getElementById('bp-sdl-normal');
      btnSpeed   = document.getElementById('bp-sdl-speed');
      chkRemember= document.getElementById('bp-sdl-chk');
      sdlProg    = document.getElementById('bp-sdl-prog');
      sdlFill    = document.getElementById('bp-sdl-fill');
      sdlLabel   = document.getElementById('bp-sdl-label');
      return;
    }

    overlay = document.createElement('div');
    overlay.id = 'bp-sdl-overlay';
    overlay.innerHTML =
      '<div id="bp-sdl-modal">' +
        '<button id="bp-sdl-close" type="button">✕</button>' +
        '<h3>Baixar faixa</h3>' +
        '<p class="sdl-sub">Escolha o formato do download</p>' +
        '<a id="bp-sdl-normal" class="sdl-opt" href="#" download>Versão Normal</a>' +
        '<button id="bp-sdl-speed" type="button" class="sdl-opt">Versão Speed</button>' +
        '<div class="sdl-remember">' +
          '<input type="checkbox" id="bp-sdl-chk" />' +
          '<label for="bp-sdl-chk">Lembrar minha escolha</label>' +
          '<button type="button" class="sdl-reset" id="bp-sdl-reset" style="display:none">Esquecer</button>' +
        '</div>' +
        '<div class="sdl-prog" id="bp-sdl-prog">' +
          '<div class="sdl-prog-bar"><div class="sdl-prog-fill" id="bp-sdl-fill"></div></div>' +
          '<div class="sdl-prog-label" id="bp-sdl-label">Processando...</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    btnNormal  = document.getElementById('bp-sdl-normal');
    btnSpeed   = document.getElementById('bp-sdl-speed');
    chkRemember= document.getElementById('bp-sdl-chk');
    sdlProg    = document.getElementById('bp-sdl-prog');
    sdlFill    = document.getElementById('bp-sdl-fill');
    sdlLabel   = document.getElementById('bp-sdl-label');

    document.getElementById('bp-sdl-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    btnNormal.addEventListener('click', function () {
      if (chkRemember.checked) setPref('normal');
      closeModal();
    });

    btnSpeed.addEventListener('click', function () {
      if (chkRemember.checked) setPref('speed');
      runSpeedDownload(activeUrl);
    });
  }

  function openModal(url) {
    injectCSS();
    buildModal();

    activeUrl = url;
    btnNormal.href = url;
    btnNormal.setAttribute('download', baseName(url));

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
    activeUrl = '';
  }

  function baseName(url) {
    var b = String(url || '').split('?')[0];
    return decodeURIComponent(b.substring(b.lastIndexOf('/') + 1) || 'musica.mp3');
  }
  function speedName(url) { return baseName(url).replace(/\.mp3$/i, '') + '_speed.mp3'; }

  function runSpeedDownload(url) {
    if (!url) return;
    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';
    fetch(fetchUrl)
      .then(function (res) { return res.arrayBuffer(); })
      .then(function () { closeModal(); });
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('.music-card .download');
    if (!link) return;
    var url = link.getAttribute('href') || '';
    if (!url) return;

    var pref = getPref();
    if (pref === 'normal') return;

    e.preventDefault();
    e.stopPropagation();

    if (pref === 'speed') {
      runSpeedDownload(url);
      return;
    }
    openModal(url);
  }, true);

})();
