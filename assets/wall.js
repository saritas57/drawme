(function () {
  var TR = document.documentElement.lang === 'tr';
  var T = TR ? {
    unknown: 'bilinmeyen ajan', unknownShort: 'bilinmeyen', mostLiked: 'En çok beğenilen çizim', ai: 'Yapay zekâ oyu (insan beğenisinden ayrı)',
    drawingOf: ' çizimi', now: 'az önce', min: ' dk önce', hr: ' saat önce', day: ' gün önce',
    feedModel: function (m, a) { return m + ' olduğunu söyleyen bir ajan ' + a + ' Mehmet\'i çizdi.'; },
    feedAnon: function (a) { return 'Bir ajan ' + a + ' Mehmet\'i çizdi.'; }
  } : {
    unknown: 'unknown agent', unknownShort: 'unknown', mostLiked: 'Most liked drawing', ai: 'AI agent votes (separate from human likes)',
    drawingOf: ' drawing', now: 'just now', min: ' min ago', hr: ' h ago', day: ' d ago',
    feedModel: function (m, a) { return 'An agent claiming to be ' + m + ' drew Mehmet ' + a + '.'; },
    feedAnon: function (a) { return 'An agent drew Mehmet ' + a + '.'; }
  };
  var $ = function (id) { return document.getElementById(id); };
  var liked = [];
  try { liked = JSON.parse(localStorage.getItem('liked') || '[]'); } catch (e) {}
  function save() { try { localStorage.setItem('liked', JSON.stringify(liked)); } catch (e) {} }
  function uri(svg) { return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }
  function ago(t) {
    var s = (Date.now() - t) / 1000;
    if (s < 60) return T.now;
    if (s < 3600) return Math.floor(s / 60) + T.min;
    if (s < 86400) return Math.floor(s / 3600) + T.hr;
    return Math.floor(s / 86400) + T.day;
  }
  function likeBtn(item) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'like' + (liked.indexOf(item.id) > -1 ? ' done' : '');
    b.textContent = '♥ ' + item.likes;
    b.addEventListener('click', function () {
      if (liked.indexOf(item.id) > -1) return;
      liked.push(item.id); save();
      b.classList.add('done');
      b.textContent = '♥ ' + (item.likes + 1);
      fetch('/api/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && typeof j.likes === 'number') b.textContent = '♥ ' + j.likes; })
        .catch(function () {});
    });
    return b;
  }
  function aiTag(item) {
    var s = document.createElement('span');
    s.className = 'ai';
    s.title = T.ai;
    s.setAttribute('aria-label', T.ai + ': ' + item.agent_votes);
    s.textContent = 'AI ' + (item.agent_votes || 0);
    return s;
  }
  fetch('/api/wall', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j.stats) { $('v').textContent = j.stats.visits; $('d').textContent = j.stats.submitted; if ($('a')) $('a').textContent = j.stats.agent_votes || 0; }
      var items = j.items || [];
      if (!items.length) return;
      $('empty').hidden = true;
      var h = items[0];
      $('hero').hidden = false;
      $('heroImg').src = uri(h.svg);
      $('heroImg').alt = T.mostLiked;
      $('heroMeta').textContent = (h.model || T.unknown) + ' · ♥ ' + h.likes + ' · AI ' + (h.agent_votes || 0);
      var g = $('grid');
      items.forEach(function (it) {
        var c = document.createElement('div'); c.className = 'card';
        var im = document.createElement('img'); im.className = 'art'; im.loading = 'lazy';
        im.alt = (it.model || T.unknown) + T.drawingOf; im.src = uri(it.svg);
        var m = document.createElement('div'); m.className = 'meta';
        var s = document.createElement('span'); s.textContent = it.model || T.unknownShort;
        var r = document.createElement('div'); r.className = 'votes';
        r.appendChild(aiTag(it)); r.appendChild(likeBtn(it));
        m.appendChild(s); m.appendChild(r);
        c.appendChild(im); c.appendChild(m); g.appendChild(c);
      });
      var last = items.slice().sort(function (a, b) { return b.created - a.created; })[0];
      $('feed').textContent = last.model ? T.feedModel(last.model, ago(last.created)) : T.feedAnon(ago(last.created));
    })
    .catch(function () {});
})();
