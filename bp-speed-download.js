(function () {

  console.log('[bp-speed-download] ATIVO v4');

  var overlay;
  var activeUrl = '';

  // 🔥 REMOVE atributo download automaticamente
  function neutralizarLinks() {
    document.querySelectorAll('.music-card .download').forEach(function(link){
      link.removeAttribute('download');
      link.removeAttribute('target');
    });
  }

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
        '<h3>Baixar faixa</h3>' +
        '<button id="dl-normal" style="width:100%;margin:10px 0;padding:10px;">Normal</button>' +
        '<button id="dl-speed" style="width:100%;margin:10px 0;padding:10px;">Speed</button>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e){
      if(e.target === overlay) closeModal();
    });

    document.getElementById('dl-normal').onclick = function(){
      forceDownload(activeUrl);
      closeModal();
    };

    document.getElementById('dl-speed').onclick = function(){
      alert('Speed aqui depois');
      closeModal();
    };
  }

  function openModal(url) {
    buildModal();
    activeUrl = url;
    overlay.style.display = 'flex';
  }

  function closeModal() {
    overlay.style.display = 'none';
  }

  function forceDownload(url) {
    var a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  document.addEventListener('click', function(e){

    var link = e.target.closest('.music-card .download');
    if(!link) return;

    var url = link.getAttribute('href');
    if(!url) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    openModal(url);

  }, true);

  // 🔥 EXECUTA APÓS CARREGAR
  window.addEventListener('load', function(){
    neutralizarLinks();
  });

})();
