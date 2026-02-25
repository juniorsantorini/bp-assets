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
      '.sdl-remember input[type=checkbox]{appearance:none;-webkit-appearance:none;width:16px;height:16px;border:2px solid rgba(255,255,255,.35);border-radius:4px;background:transparent;cursor:pointer;flex-shrink:0;position:relative;transition:background .15s,border-color .15s;display:inline-flex;align-items:center;justify-content:center}' +
      '.sdl-remember input[type=checkbox]:hover{border-color:rgba(255,255,255,.65)}' +
      '.sdl-remember input[type=checkbox]:checked{background:#a40781;border-color:#a40781}' +
      '.sdl-remember input[type=checkbox]:checked::after{content:"";display:block;width:4px;height:8px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg) translate(-1px,-1px)}' +
      '.sdl-remember label{font-size:11px;color:rgba(255,255,255,.4);cursor:pointer;user-select:none;flex:1}' +
      '.sdl-prog{display:none;margin-top:16px}' +
      '.sdl-prog.show{display:block}' +
      '.sdl-prog-bar{height:3px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}' +
      '.sdl-prog-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#a40781,#e070c8);transition:width .35s ease}' +
      '.sdl-prog-label{font-size:11px;color:rgba(255,255,255,.38);margin-top:8px;text-align:center}' +
      '.bp-dl-pref-tag{display:inline-block;font-size:9px;padding:1px 5px;border-radius:999px;vertical-align:middle;margin-left:4px;background:rgba(164,7,129,.25);border:1px solid rgba(164,7,129,.4);color:#e070c8;font-weight:700;letter-spacing:.4px;pointer-events:none}';
    document.head.appendChild(s);
  }

  // =========================
  // Modal
  // =========================
  var overlay, btnNormal, btnSpeed, chkRemember, sdlProg, sdlFill, sdlLabel;
  var activeUrl = '';
  var activeMeta = null;

  function buildModal() {
    if (document.getElementById('bp-sdl-overlay')) {
      overlay = document.getElementById('bp-sdl-overlay');
      btnNormal   = document.getElementById('bp-sdl-normal');
      btnSpeed    = document.getElementById('bp-sdl-speed');
      chkRemember = document.getElementById('bp-sdl-chk');
      sdlProg     = document.getElementById('bp-sdl-prog');
      sdlFill     = document.getElementById('bp-sdl-fill');
      sdlLabel    = document.getElementById('bp-sdl-label');
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

    document.getElementById('bp-sdl-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    btnNormal.addEventListener('click', function (e) {
      e.preventDefault();
      if (Date.now() - modalOpenTime < 2000) return;
      if (chkRemember.checked) { setRemember(true); setPref('normal'); updatePrefBadges(); }
      closeModal();
      clickNormal(activeUrl);
    });

    btnSpeed.addEventListener('click', function () {
      if (Date.now() - modalOpenTime < 2000) return;
      if (chkRemember.checked) { setRemember(true); setPref('speed'); updatePrefBadges(); }
      runSpeedDownload(activeUrl);
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
  }

  var modalOpenTime = 0;

  function openModal(url, meta) {
    injectCSS();
    buildModal();

    activeUrl = url;
    activeMeta = meta || null;

    btnNormal.href = '#';

    sdlProg.classList.remove('show');
    sdlFill.style.width = '0%';
    sdlLabel.textContent = 'Processando...';
    btnSpeed.classList.remove('is-loading');

    chkRemember.checked = getRemember();

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    modalOpenTime = Date.now();
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.style.overflow = '';
    activeUrl = '';
    activeMeta = null;
  }

  // =========================
  // Badge de preferência no botão Baixar
  // =========================
  function updatePrefBadges() {
    var pref = getPref();
    document.querySelectorAll('.music-card .download').forEach(function (link) {
      var old = link.querySelector('.bp-dl-pref-tag');
      if (old) old.parentNode.removeChild(old);
      if (pref) {
        var tag = document.createElement('span');
        tag.className = 'bp-dl-pref-tag';
        tag.textContent = pref === 'speed' ? '⚡' : '↓';
        tag.title = pref === 'speed' ? 'Preferência: Speed' : 'Preferência: Normal';
        link.appendChild(tag);
      }
    });
  }

  // =========================
  // Áudio (Speed)
  // =========================
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

        setProgress(0.35, 'Renderizando...');
        offline.startRendering().then(function (rendered) {
          setProgress(0.65, 'Preparando versão Speed — renderizando em alta qualidade...');

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
      }, function () {
        try { ctx.close(); } catch(e){}
        reject(new Error('Falha ao decodificar o áudio'));
      });
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
        setProgress(0.2, 'Processando áudio...');
        return res.arrayBuffer();
      })
      .then(applySpeed)
      .then(function (blob) {
        setProgress(1, 'Pronto! Iniciando download...');

        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = speedName(url, activeMeta);

        document.body.appendChild(a);
        a.click();

        setTimeout(function () {
          try { URL.revokeObjectURL(a.href); } catch(e){}
          try { document.body.removeChild(a); } catch(e){}
          closeModal();
        }, 1800);
      })
      .catch(function (err) {
        sdlFill.style.width = '0%';
        sdlLabel.textContent = '❌ ' + (err.message || 'Erro no processamento');
        btnSpeed.classList.remove('is-loading');
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

  function clickNormal(url) {
    var fetchUrl = url.indexOf('?') === -1 ? url + '?dl=1' : url + '&dl=1';
    fetch(fetchUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = normalName(url, activeMeta);
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

    if (pref === 'normal') {
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e.stopPropagation) e.stopPropagation();
      activeMeta = meta;
      clickNormal(url);
      return;
    }

    if (pref === 'speed') {
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e.stopPropagation) e.stopPropagation();

      injectCSS();
      buildModal();
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';

      activeUrl = url;
      activeMeta = meta;

      sdlProg.classList.add('show');
      setProgress(0.05, 'Baixando arquivo...');
      btnSpeed.classList.add('is-loading');

      runSpeedDownload(url);
      return;
    }

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

  document.addEventListener('pointerdown', function (e) { intercept(e); }, true);
  document.addEventListener('click', function (e) { intercept(e); }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
