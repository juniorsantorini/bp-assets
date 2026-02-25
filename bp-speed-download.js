/**
 * bp-speed-download.js
 * Modal Normal / Speed para botões .music-card .download
 * Seguro, estável e à prova de timing.
 */

(function () {
  'use strict';

  var SPEED = Math.pow(2, 133 / 1200);
  var MP3_KBPS = 128;
  var LAME_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  var LS_PREF = 'bp_dl_pref';

  var overlay, btnNormal, btnSpeed, chkRemember, sdlProg, sdlFill, sdlLabel;
  var activeUrl = '';

  /* ================= PREF ================= */

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

  /* ================= CSS ================= */

  function injectCSS() {
    if (document.getElementById('bp-sdl-css')) return;

    var s = document.createElement('style');
    s.id = 'bp-sdl-css';
    s.textContent =
      '#bp-sdl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .2s}' +
      '#bp-sdl-overlay.show{opacity:1;pointer-events:auto}' +
      '#bp-sdl-modal{background:#120b10;border:1px solid rgba(164,7,129,.3);border-radius:18px;padding:24px;width:100%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:sans-serif}' +
      '.sdl-opt{display:block;width:100%;padding:12px 14px;margin-bottom:10px;border-radius:12px;background:#1c0e1a;color:#fff;border:1px solid rgba(255,255,255,.08);cursor:pointer;text-align:center}' +
      '.sdl-opt:hover{background:#2a1023}' +
      '.sdl-prog{display:none;margin-top:12px}' +
      '.sdl-prog.show{display:block}' +
      '.sdl-prog-fill{height:3px;width:0;background:#a40781;transition:width .3s}';
    document.head.appendChild(s);
  }

  /* ================= MODAL ================= */

  function buildModal() {

    overlay = document.getElementById('bp-sdl-overlay');

    if (!overlay) {

      overlay = document.createElement('div');
      overlay.id = 'bp-sdl-overlay';

      overlay.innerHTML =
        '<div id="bp-sdl-modal">' +
          '<h3 style="color:#fff;margin:0 0 15px;">Baixar faixa</h3>' +

          '<a id="bp-sdl-normal" class="sdl-opt" href="#" download>Versao Normal</a>' +
          '<button id="bp-sdl-speed" class="sdl-opt">Versao Speed</button>' +

          '<div style="margin-top:10px;color:#aaa;font-size:12px;">' +
            '<input type="checkbox" id="bp-sdl-chk"> Lembrar minha escolha' +
          '</div>' +

          '<div id="bp-sdl-prog" class="sdl-prog">' +
            '<div class="sdl-prog-fill" id="bp-sdl-fill"></div>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }

    /* 🔥 SEMPRE RECAPTURA REFERÊNCIAS */
    btnNormal = document.getElementById('bp-sdl-normal');
    btnSpeed = document.getElementById('bp-sdl-speed');
    chkRemember = document.getElementById('bp-sdl-chk');
    sdlProg = document.getElementById('bp-sdl-prog');
    sdlFill = document.getElementById('bp-sdl-fill');

    if (!btnNormal || !btnSpeed) {
      console.error('Modal nao inicializado corretamente');
      return;
    }

    btnNormal.onclick = function () {
      if (chkRemember && chkRemember.checked) setPref('normal');
      closeModal();
    };

    btnSpeed.onclick = function () {
      if (chkRemember && chkRemember.checked) setPref('speed');
      runSpeedDownload(activeUrl);
    };
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
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  /* ================= SPEED ================= */

  var lameReady = false;

  function loadLame(cb) {
    if (lameReady) { cb(); return; }
    var s = document.createElement('script');
    s.src = LAME_CDN;
    s.onload = function () { lameReady = true; cb(); };
    document.head.appendChild(s);
  }

  function runSpeedDownload(url) {

    if (!url) return;

    sdlProg.classList.add('show');
    sdlFill.style.width = '10%';

    fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buffer) {

        var AC = window.AudioContext || window.webkitAudioContext;
        var ctx = new AC();

        return ctx.decodeAudioData(buffer).then(function (decoded) {

          var length = Math.ceil(decoded.length / SPEED);
          var offline = new OfflineAudioContext(decoded.numberOfChannels, length, decoded.sampleRate);

          var src = offline.createBufferSource();
          src.buffer = decoded;
          src.playbackRate.value = SPEED;
          src.connect(offline.destination);
          src.start(0);

          sdlFill.style.width = '50%';

          return offline.startRendering();
        });
      })
      .then(function (rendered) {

        sdlFill.style.width = '70%';

        loadLame(function () {

          var mp3encoder = new lamejs.Mp3Encoder(2, rendered.sampleRate, MP3_KBPS);
          var samples = rendered.getChannelData(0);
          var mp3Data = [];
          var blockSize = 1152;

          for (var i = 0; i < samples.length; i += blockSize) {
            var chunk = samples.subarray(i, i + blockSize);
            var mp3buf = mp3encoder.encodeBuffer(chunk);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
          }

          var end = mp3encoder.flush();
          if (end.length > 0) mp3Data.push(end);

          var blob = new Blob(mp3Data, { type: 'audio/mp3' });

          sdlFill.style.width = '100%';

          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = baseName(url).replace('.mp3','_speed.mp3');
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          closeModal();
        });
      })
      .catch(function (err) {
        console.error(err);
        closeModal();
      });
  }

  function baseName(url) {
    var b = String(url).split('?')[0];
    return b.substring(b.lastIndexOf('/') + 1);
  }

  /* ================= CLICK INTERCEPT ================= */

  document.addEventListener('click', function (e) {

    var link = e.target.closest('.music-card .download');
    if (!link) return;

    var url = link.getAttribute('href');
    if (!url) return;

    var pref = getPref();

    if (pref === 'normal') return;

    e.preventDefault();
    e.stopPropagation();

    if (pref === 'speed') {
      injectCSS();
      buildModal();
      activeUrl = url;
      runSpeedDownload(url);
      return;
    }

    openModal(url);

  }, true);

})();
