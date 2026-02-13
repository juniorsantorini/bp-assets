(function () {
  var cache = {}; // href -> meta

  function esc(s){
    return (s||"").replace(/[&<>"']/g,function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
    });
  }

  function fetchMeta(href){
    if (cache[href]) return Promise.resolve(cache[href]);

    return fetch(href, { credentials: "omit" })
      .then(function(r){ return r.text(); })
      .then(function(html){
        // parseia o HTML do post e acha o music-card REAL
        var doc = new DOMParser().parseFromString(html, "text/html");
        var real = doc.querySelector(".music-card");
        if (!real) {
          var meta0 = { audioUrl:"", artist:"", bpm:"", tags:[], title:"", cover:"" };
          cache[href] = meta0;
          return meta0;
        }

        var audioUrl = real.getAttribute("data-audio-url") || "";
        var artist   = real.getAttribute("data-artist") || "";
        var title    = real.getAttribute("data-title") || "";

        // ✅ CAPA REAL do post (agora funciona mesmo se for download.borapracima.site)
        var cover = "";
        var coverImg = real.querySelector(".cover img");
        if (coverImg) cover = coverImg.getAttribute("src") || "";

        // bpm: tenta pegar do texto "Rebbel • 117 BPM"
        var bpm = "";
        var metaTextEl = real.querySelector(".meta");
        if (metaTextEl) {
          var mt = metaTextEl.textContent || "";
          var mBpm = mt.match(/(\d+)\s*BPM/i);
          if (mBpm && mBpm[1]) bpm = mBpm[1];
          if (!artist) {
            // tenta pegar artista antes do •
            var mArt = mt.split("•")[0];
            if (mArt) artist = mArt.trim();
          }
        }

        // tags: copia as spans .tag
        var tags = [];
        real.querySelectorAll(".tags .tag").forEach(function(t){
          var tx = (t.textContent || "").trim();
          if (tx) tags.push(tx);
        });

        var meta = { audioUrl: audioUrl, artist: artist, bpm: bpm, tags: tags, title: title, cover: cover };
        cache[href] = meta;
        return meta;
      })
      .catch(function(){
        var meta = { audioUrl:"", artist:"", bpm:"", tags:[], title:"", cover:"" };
        cache[href] = meta;
        return meta;
      });
  }

  function buildCard(post){
    if (post.querySelector(".music-card")) return;

    var linkEl = post.querySelector(".post-image-link") || post.querySelector(".post-title a");
    if(!linkEl) return;
    var href = linkEl.getAttribute("href") || "#";

    var imgEl = post.querySelector(".post-image-wrap img");
    var cover = imgEl ? imgEl.getAttribute("src") : "";

    var titleEl = post.querySelector(".post-title a");
    var titleFromTheme = titleEl ? titleEl.textContent.trim() : "Música";

    // cria card base (vai preencher meta/tags depois do fetch)
    var card = document.createElement("div");
    card.className = "music-card";
    card.innerHTML =
      '<div class="left">' +
        '<button class="play-btn" type="button">▶</button>' +
        '<div class="cover">' +
          (cover ? '<img src="'+esc(cover)+'" alt="Capa"/>' : '') +
        '</div>' +
      '</div>' +
      '<div class="info">' +
        '<div class="title"><a class="title-link" href="'+esc(href)+'">'+esc(titleFromTheme)+'</a></div>' +
        '<div class="meta" data-meta></div>' +
        '<div class="tags" data-tags></div>' +
      '</div>' +
      '<div class="actions">' +
        '<a class="download" href="'+esc(href)+'">Baixar</a>' +
      '</div>';

    var info = post.querySelector(".post-info");
    if(!info) return;
    info.insertBefore(card, info.firstChild);

    var playBtn = card.querySelector(".play-btn");
    var dlBtn   = card.querySelector(".download");
    var metaEl  = card.querySelector("[data-meta]");
    var tagsEl  = card.querySelector("[data-tags]");

    function render(meta){
      // ✅ aplica CAPA REAL do post no card da home
      if (meta.cover) {
        var coverBox = card.querySelector(".cover");
        var img = coverBox ? coverBox.querySelector("img") : null;
        if (!img) {
          if (coverBox) coverBox.innerHTML = '<img alt="Capa" src="'+esc(meta.cover)+'"/>';
        } else {
          img.src = meta.cover;
        }
      }

      // título: se o post tiver data-title, usa ele (ex: Rise (Pop))
      if (meta.title) {
        var titleLink = card.querySelector(".title a");
        if (titleLink) {
          titleLink.textContent = meta.title;
        }
      }

      // meta: "Rebbel • 117 BPM"
      var line = [];
      if (meta.artist) line.push(meta.artist);
      if (meta.bpm) line.push(meta.bpm + " BPM");
      metaEl.textContent = line.length ? line.join(" • ") : "";

      // tags
      tagsEl.innerHTML = "";
      (meta.tags || []).forEach(function(t){
        var span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tagsEl.appendChild(span);
      });

      // deixa baixar direto e player pronto
      if (meta.audioUrl) {
        dlBtn.href = meta.audioUrl;
        dlBtn.setAttribute("download","");
        dlBtn.setAttribute("target","_blank");
        dlBtn.setAttribute("rel","noopener");

        card.setAttribute("data-audio-url", meta.audioUrl);
        card.setAttribute("data-artist", meta.artist || "");
        card.setAttribute("data-title", meta.title || titleFromTheme);
      }
    }

    // carrega meta em background e pinta o card igual ao post
    fetchMeta(href).then(render);

    // play: se já tem data-audio-url, deixa seu player global agir normal
    playBtn.addEventListener("click", function(e){
      if (card.getAttribute("data-audio-url")) return;

      e.preventDefault();
      e.stopPropagation();
      fetchMeta(href).then(function(meta){
        render(meta);
        if (!meta.audioUrl) { window.location.href = href; return; }
        setTimeout(function(){ playBtn.click(); }, 0);
      });
    });

    // baixar: se ainda não virou direto, busca e baixa
    dlBtn.addEventListener("click", function(e){
      var hrefNow = dlBtn.getAttribute("href") || "";
      if (hrefNow && hrefNow.indexOf("blogspot") === -1) return;

      e.preventDefault();
      fetchMeta(href).then(function(meta){
        render(meta);
        if (!meta.audioUrl) { window.location.href = href; return; }
        dlBtn.click();
      });
    });
  }

  document.querySelectorAll(".index-post").forEach(buildCard);
})();
