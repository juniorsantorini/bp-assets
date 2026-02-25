/**
 * bp-speed-download.js
 * Modal Normal / Speed para .music-card .download
 * Versão estável e corrigida.
 */

(function () {
  'use strict';

  var SPEED = Math.pow(2, 133 / 1200);
  var MP3_KBPS = 128;
  var LAME_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  var LS_PREF = 'bp_dl_pref';

  var overlay, btnNormal, btnSpeed, chkRemember;
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
      '#bp-sdl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:999999;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:.2s}' +
      '#bp-sdl-overlay.show{opacity:1;pointer-events:auto}' +
      '#bp-sdl-modal{background:#120b10;border-radius:18px;padding:24px;width:100%;max-width:340px;color:#fff;text-align:center}' +
      '.sdl-btn{display:block;width:100%;margin:8px 0;padding:10px;border-radius:10px;background:#1c0e1a;color:#fff;border:none;cursor:pointer}' +
      '.sdl-btn:hover{background:#2a1023}';
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
          '<h3>Baixar faixa</h3>' +
          '<button id="bp-sdl-normal" class="sdl-btn">Versao Normal</button>' +
          '<button id="bp-sdl-speed" class="sdl-btn">Versao Speed</button>' +
          '<div style="margin-top:10px;font-size:12px;color:#aaa;">' +
            '<input type="checkbox" id="bp-sdl-chk"> Lembrar minha escolha' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }

    btnNormal = document.getElementById('bp-sdl-normal');
    btnSpeed = document.getElementById('bp-sdl-speed');
    chkRemember = document.getElementById('bp-sdl-chk');

    btnNormal.onclick = function () {
      if (chkRemember && chkRemember.checked) setPref('normal');
      window.location.href = activeUrl; // 🔥 mantém contador
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
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
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

          return offline.startRendering();
        });
      })
      .then(function (rendered) {

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

          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = url.split('/').pop().replace('.mp3','_speed.mp3');
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          closeModal();
        });
      });
  }

  /* ================= CLICK INTERCEPT ================= */

  document.addEventListener('click', function (e) {

    var link = e.target.closest('.music-card .download');
    if (!link) return;

    var url = link.getAttribute('href');
    if (!url) return;

    var pref = getPref();

    // 🔥 REMOVE download nativo antes do navegador agir
    link.removeAttribute('download');

    e.preventDefault();
    e.stopPropagation();

    if (pref === 'normal') {
      window.location.href = url;
      return;
    }

    if (pref === 'speed') {
      activeUrl = url;
      runSpeedDownload(url);
      return;
    }

    openModal(url);

  }, true);

})();
