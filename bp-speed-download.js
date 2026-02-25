(function () {

  var overlay;
  var activeUrl = '';

  function buildModal() {

    if (overlay) return;

    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,.7)';
    overlay.style.display = 'flex';
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
      alert('Aqui entra o speed (mantemos seu código depois)');
      closeModal();
    };
  }

  function closeModal() {
    if (!overlay) return;
    overlay.style.display = 'none';
  }

  function openModal(url) {
    buildModal();
    activeUrl = url;
    overlay.style.display = 'flex';
  }

  // 🔥 força download sem usar o <a> original
  function forceDownload(url) {
    var a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 🔥 intercepta ANTES do navegador agir
  document.addEventListener('click', function(e){

    var link = e.target.closest('.music-card .download');
    if(!link) return;

    var url = link.getAttribute('href');
    if(!url) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    openModal(url);

  }, true);

})();
