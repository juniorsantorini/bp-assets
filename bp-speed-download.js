(function () {
  // SINAL DE VIDA (se isso não aparecer, o arquivo NÃO está executando)
  try { console.log('[bp-speed-download] ATIVO v3'); } catch(e) {}
  try { window.BP_SPEED_DL_OK = 'v3'; } catch(e) {}

  // Badge visual (canto inferior direito)
  try {
    var badge = document.createElement('div');
    badge.id = 'bp-sdl-badge';
    badge.textContent = 'SDL ON';
    badge.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999999;background:#a40781;color:#fff;font:700 11px/1 sans-serif;padding:6px 8px;border-radius:10px;opacity:.85';
    document.documentElement.appendChild(badge);
    setTimeout(function(){ if(badge && badge.parentNode) badge.parentNode.removeChild(badge); }, 2500);
  } catch(e) {}

  var overlay;
  var activeUrl = '';

  function buildModal() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,.7)';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '999999';

    overlay.innerHTML =
      '<div style="background:#120b10;padding:25px;border-radius:16px;color:#fff;text-align:center;width:300px;">' +
        '<h3 style="margin:0 0 12px;">Baixar faixa</h3>' +
        '<button id="dl-normal" style="width:100%;margin:10px 0;padding:10px;">Normal</button>' +
        '<button id="dl-speed" style="width:100%;margin:10px 0;padding:10px;">Speed</button>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.getElementById('dl-normal').onclick = function () {
      forceDownload(activeUrl);
      closeModal();
    };

    document.getElementById('dl-speed').onclick = function () {
      alert('Speed aqui (depois a gente coloca o processamento)');
      closeModal();
    };
  }

  function closeModal() {
    if (!overlay) return;
    overlay.style.display = 'none';
    try { document.body.style.overflow = ''; } catch(e) {}
  }

  function openModal(url) {
    buildModal();
    activeUrl = url;
    overlay.style.display = 'flex';
    try { document.body.style.overflow = 'hidden'; } catch(e) {}
  }

  function forceDownload(url) {
    var a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Fallback pro closest()
  function closestEl(el, selector) {
    while (el && el.nodeType === 1) {
      if (el.matches && el.matches(selector)) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Intercepta cliques
  document.addEventListener('click', function (e) {
    var t = e.target;

    // tenta closest nativo, se falhar usa fallback
    var link = null;
    try {
      link = t && t.closest ? t.closest('.music-card .download') : null;
    } catch (err) {
      link = null;
    }
    if (!link) link = closestEl(t, '.music-card .download');
    if (!link) return;

    var url = link.getAttribute('href') || '';
    if (!url) return;

    // trava tudo
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    openModal(url);
  }, true);

})();
