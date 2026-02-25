/**
 * bp-speed-download.js
 * Intercepta o clique no "Baixar" dos music-cards e abre modal
 * com opcoes Normal / Speed + "lembrar minha escolha".
 *
 * Cole este arquivo como JS puro (sem <script>) no GitHub/Pages.
 * No Blogger, carregue com:
 *   <script src=".../bp-player.js"></script>
 *   <script src=".../bp-speed-download.js" defer></script>
 */
(function () {
  'use strict';

  var SPEED    = Math.pow(2, 133 / 1200); // mesma constante do player
  var MP3_KBPS = 128;
  var LAME_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  var LS_PREF  = 'bp_dl_pref'; // 'normal' | 'speed' | ''

  /* ─── Preferência salva ─────────────────────────────────────────────────── */
  function getPref() {
    try { var v = localStorage.getItem(LS_PREF); return (v === 'normal' || v === 'speed') ? v : ''; }
    catch(e) { return ''; }
  }
  function setPref(v) {
    try { if (v) localStorage.setItem(LS_PREF, v); else localStorage.removeItem(LS_PREF); }
    catch(e) {}
  }

  /* ─── lamejs carregado sob demanda ──────────────────────────────────────── */
  var lameReady = false, lameLoading = false, lameQ = [];
  function loadLame(cb) {
    if (lameReady)   { cb(); return; }
    if (lameLoading) { lameQ.push(cb); return; }
    lameLoading = true; lameQ.push(cb);
    var s = document.createElement('script');
    s.src = LAME_CDN; s.async = true;
    s.onload  = function () {
      lameReady = true; lameLoading = false;
      var q = lameQ.slice(); lameQ = [];
      q.forEach(function (f) { try { f(); } catch(e) {} });
    };
    s.onerror = function () {
      lameLoading = false;
      var err = new Error('lamejs nao carregou');
      var q = lameQ.slice(); lameQ = [];
      q.forEach(function (f) { try { f(err); } catch(e) {} });
    };
    document.head.appendChild(s);
  }

  /* ─── CSS ───────────────────────────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('bp-sdl-css')) return;
    var s = document.createElement('style');
    s.id = 'bp-sdl-css';
    s.textContent =
      '#bp-sdl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .22s ease}' +
      '#bp-sdl-overlay.show{opacity:1;pointer-events:auto}' +
      '#bp-sdl-modal{background:linear-gradient(150deg,#1c0e1a 0%,#120b10 100%);border:1px solid rgba(164,7,129,.3);border-radius:22px;padding:28px 24px 20px;width:100%;max-width:340px;position:relative;box-shadow:0 28px 72px rgba(0,0,0,.75);transform:translateY(20px) scale(.96);transition:transform .25s cubic-bezier(.34,1.56,.64,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '#bp-sdl-overlay.show #bp-sdl-modal{transform:translateY(0) scale(1)}' +
      '#bp-sdl-modal h3{font-size:15px;font-weight:800;color:#fff;margin:0 0 4px;letter-spacing:.2px}' +
      '#bp-sdl-modal .sdl-sub{font-size:12px;color:rgba(255,255,255,.38);margin:0 0 20px}' +
      '#bp-sdl-close{position:absolute;top:14px;right:16px;background:none;border:none;color:rgba(255,255,255,.3);font-size:17px;cursor:pointer;padding:4px 6px;line-height:1;transition:color .15s}' +
      '#bp-sdl-close:hover{color:#fff}' +
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
      '.sdl-remember input[type=checkbox]{width:15px;height:15px;accent-color:#a40781;cursor:pointer;flex-shrink:0}' +
      '.sdl-remember label{font-size:11px;color:rgba(255,255,255,.4);cursor:pointer;user-select:none;flex:1}' +
      '.sdl-remember .sdl-reset{margin-left:auto;font-size:10px;color:rgba(164,7,129,.7);background:none;border:none;cursor:pointer;padding:0;font-family:inherit;text-decoration:underline;white-space:nowrap}' +
      '.sdl-remember .sdl-reset:hover{color:#e070c8}' +
      '.sdl-prog{display:none;margin-top:16px}' +
      '.sdl-prog.show{display:block}' +
      '.sdl-prog-bar{height:3px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}' +
      '.sdl-prog-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#a40781,#e070c8);transition:width .35s ease}' +
      '.sdl-prog-label{font-size:11px;color:rgba(255,255,255,.38);margin-top:8px;text-align:center}' +
      '.bp-dl-pref-tag{display:inline-block;font-size:9px;padding:1px 5px;border-radius:999px;vertical-align:middle;margin-left:4px;background:rgba(164,7,129,.25);border:1px solid rgba(164,7,129,.4);color:#e070c8;font-weight:700;letter-spacing:.4px;pointer-events:none}';
    document.head.appendChild(s);
  }

  /* ─── Modal ─────────────────────────────────────────────────────────────── */
  var overlay, btnNormal, btnSpeed, chkRemember, sdlProg, sdlFill, sdlLabel;
  var activeUrl = '';

  function buildModal() {
    if (document.getElementById('bp-sdl-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'bp-sdl-overlay';
    overlay.innerHTML =
      '<div id="bp-sdl-modal">' +
        '<button id="bp-sdl-close" type="button">x</button>' +
        '<h3>Baixar faixa</h3>' +
        '<p class="sdl-sub">Escolha o formato do download</p>' +

        '<a id="bp-sdl-normal" class="sdl-opt" href="#" download>' +
          '<span class="sdl-icon">↓</span>' +
          '<span class="sdl-info">' +
            '<span class="sdl-title">Versao Normal</span>' +
            '<span class="sdl-desc">Arquivo original</span>' +
          '</span>' +
        '</a>' +

        '<button id="bp-sdl-speed" type="button" class="sdl-opt">' +
          '<span class="sdl-icon">⚡</span>' +
          '<span class="sdl-info">' +
            '<span class="sdl-title">Versao Speed <span class="sdl-badge">SPEED</span></span>' +
            '<span class="sdl-desc">Acelerada (igual ao botao SPEED do player)</span>' +
          '</span>' +
        '</button>' +

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

    btnNormal   = document.getElementById('bp-sdl-normal');
    btnSpeed    = document.getElementById('bp-sdl-speed');
    chkRemember = document.getElementById('bp-sdl-chk');
    sdlProg     = document.getElementById('bp-sdl-prog');
    sdlFill     = document.getElementById('bp-sdl-fill');
    sdlLabel    = document.getElementById('bp-sdl-label');

    var btnReset = document.getElementById('bp-sdl-reset');

    document.getElementById('bp-sdl-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    btnNormal.addEventListener('click', function () {
      if (chkRemember.checked) { setPref('normal'); updatePrefBadges(); }
      closeModal();
    });

    btnSpeed.addEventListener('click', function () {
      if (chkRemember.checked) { setPref('speed'); updatePrefBadges(); }
      runSpeedDownload(activeUrl);
    });

    btnReset.addEventListener('click', function (e) {
      e.stopPropagation();
      setPref('');
      chkRemember.checked = false;
      btnReset.style.display = 'none';
      updatePrefBadges();
    });

    chkRemember.addEventListener('change', function () {
      if (!chkRemember.checked) { setPref(''); updatePrefBadges(); }
    });
  }

  function openModal(url) {
    // ✅ correção pedida: garante CSS + modal mesmo se clicar cedo
    injectCSS();
    buildModal();

    activeUrl = url;
    btnNormal.href = url;
    btnNormal.setAttribute('download', baseName(url));
    sdlProg.classList.remove('show');
    sdlFill.style.width = '0%';
    sdlLabel.textContent = 'Processando...';
    btnSpeed.classList.remove('is-loading');

    var pref = getPref();
    chkRemember.checked = !!pref;
    var btnReset = document.getElementById('bp-sdl-reset');
    btnReset.style.display = pref ? 'inline' : 'none';

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
    activeUrl = '';
  }

  /* ─── Badge da preferência ──────────────────────────────────────────────── */
  function updatePrefBadges() {
    var pref = getPref();
    document.querySelectorAll('.music-card .download').forEach(function (link) {
      var old = link.querySelector('.bp-dl-pref-tag');
      if (old) old.parentNode.removeChild(old);
      if (pref) {
        var tag = document.createElement('span');
        tag.className = 'bp-dl-pref-tag';
        tag.textContent = pref === 'speed' ? '⚡' : '↓';
        tag.title = pref === 'speed' ? 'Preferencia: Speed' : 'Preferencia: Normal';
        link.appendChild(tag);
      }
    });
  }

  /* ─── Processamento de áudio ────────────────────────────────────────────── */
  function f32ToI16(buf) {
    var out = new Int16Array(buf.length);
    for (var i = 0; i < buf.length; i++) {
      var v = Math.max(-1, Math.min(1, buf[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
    }
    return out;
  }

  function setProgress(pct, msg) {
    sdlFill.style.width = Math.round(pct * 100) + '%';
    if (msg) sdlLabel.textContent = msg;
  }

  function applySpeed(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { reject(new Error('AudioContext nao suportado')); return; }
      var ctx = new AC();
      ctx.decodeAudioData(arrayBuffer.slice(0), function (decoded) {
        ctx.close();
        var ch = decoded.numberOfChannels, sr = decoded.sampleRate;
        var outL = Math.ceil(decoded.length / SPEED);
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) { reject(new Error('OfflineAudioContext nao suportado')); return; }
        var offline = new OAC(ch, outL, sr);
        var src = offline.createBufferSource();
        src.buffer = decoded;
        src.playbackRate.value = SPEED;
        try { src.preservesPitch = false; }       catch(e) {}
        try { src.mozPreservesPitch = false; }    catch(e) {}
        try { src.webkitPreservesPitch = false; } catch(e) {}
        src.connect(offline.destination);
        src.start(0);
        setProgress(0.35, 'Renderizando...');
        offline.startRendering().then(function (rendered) {
          setProgress(0.65, 'Codificando MP3...');
          loadLame(function (err) {
            if (err) { reject(err); return; }
            try {
              var stereo = ch >= 2;
              var enc = new lamejs.Mp3Encoder(stereo ? 2 : 1, sr, MP3_KBPS);
              var L = f32ToI16(rendered.getChannelData(0));
              var R = stereo ? f32ToI16(rendered.getChannelData(1)) : null;
              var BLK = 1152, parts = [];
              for (var i = 0; i < L.length; i += BLK) {
                var lc = L.subarray(i, i + BLK);
                var buf = stereo ? enc.encodeBuffer(lc, R.subarray(i, i + BLK)) : enc.encodeBuffer(lc);
                if (buf.length) parts.push(buf);
              }
              var tail = enc.flush();
              if (tail.length) parts.push(tail);
              resolve(new Blob(parts, { type: 'audio/mpeg' }));
            } catch (e) { reject(e); }
          });
        }).catch(reject);
      }, function () { ctx.close(); reject(new Error('Falha ao decodificar o audio')); });
    });
  }

  function runSpeedDownload(url) {
    if (!url) return;
    btnSpeed.classList.add('is-loading');
    sdlProg.classList.add('show');
    setProgress(0.05, 'Baixando arquivo...');
    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';
    fetch(fetchUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setProgress(0.2, 'Processando audio...');
        return res.arrayBuffer();
      })
      .then(applySpeed)
      .then(function (blob) {
        setProgress(1, 'Pronto! Iniciando download...');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = speedName(url);
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); closeModal(); }, 1800);
      })
      .catch(function (err) {
        console.error('[bp-speed-dl]', err);
        sdlFill.style.width = '0%';
        sdlLabel.textContent = 'Erro: ' + (err.message || 'Falha no processamento');
        btnSpeed.classList.remove('is-loading');
      });
  }

  function baseName(url) {
    var b = String(url || '').split('?')[0];
    return decodeURIComponent(b.substring(b.lastIndexOf('/') + 1) || 'musica.mp3');
  }
  function speedName(url) { return baseName(url).replace(/\.mp3$/i, '') + '_speed.mp3'; }

  /* ─── Interceptar cliques ───────────────────────────────────────────────── */
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
      // garante modal pra barra de progresso
      injectCSS(); buildModal();
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
      activeUrl = url;
      sdlProg.classList.add('show');
      setProgress(0.05, 'Baixando arquivo...');
      btnSpeed.classList.add('is-loading');
      runSpeedDownload(url);
      return;
    }

    openModal(url);
  }, true);

  function init() {
    injectCSS();
    buildModal();
    updatePrefBadges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
