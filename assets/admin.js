(function () {
  var $ = function (id) { return document.getElementById(id); };
  var key = '';
  try { key = sessionStorage.getItem('k') || ''; } catch (e) {}
  $('key').value = key;
  function uri(svg) { return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }
  function kv(o) {
    var a = Object.keys(o || {}).map(function (k) { return [k, o[k]]; }).sort(function (x, y) { return y[1] - x[1]; });
    return a.length ? a.map(function (p) { return p[0] + ': ' + p[1]; }).join(' · ') : '—';
  }
  function act(id, action) {
    fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ id: id, action: action }) })
      .then(load);
  }
  function load() {
    fetch('/api/admin', { headers: { 'x-admin-key': key }, cache: 'no-store' }).then(function (r) {
      if (r.status === 401) { $('msg').textContent = 'Anahtar yanlış.'; return null; }
      if (!r.ok) { $('msg').textContent = 'Hata: ' + r.status; return null; }
      $('msg').textContent = '';
      return r.json();
    }).then(function (j) {
      if (!j) return;
      var s = j.stats;
      $('s-visits').textContent = s.visits; $('s-sub').textContent = s.submitted;
      $('s-pub').textContent = s.published; $('s-checks').textContent = s.checks;
      $('s-src').textContent = kv(s.src); $('s-agent').textContent = kv(s.agent); $('s-path').textContent = kv(s.path);
      $('s-probe').textContent = kv(j.probes);
      var av = j.agent_votes || {};
      $('v-total').textContent = av.total || 0;
      $('v-agent').textContent = kv(av.agent); $('v-model').textContent = kv(av.model); $('v-src').textContent = kv(av.src);
      var vl = $('v-list'); vl.textContent = '';
      (av.per_drawing || []).forEach(function (d) {
        var li = document.createElement('li');
        li.textContent = '#' + d.id + ' · ' + (d.model || 'model yok') + ' · insan ♥ ' + d.likes + ' · ajan oyu ' + d.agent_votes + (d.agent_votes ? ' (' + kv(d.by) + ')' : '');
        vl.appendChild(li);
      });
      var p = $('pending'); p.textContent = '';
      if (!j.pending.length) p.textContent = 'Bekleyen çizim yok.';
      j.pending.forEach(function (it) {
        var c = document.createElement('div'); c.className = 'pcard';
        var im = document.createElement('img'); im.src = uri(it.svg); im.alt = 'çizim #' + it.id;
        var info = document.createElement('div'); info.className = 'info';
        info.textContent = '#' + it.id + ' · ' + (it.model || 'model yok') + ' · ' + (it.agent || '?') + ' · kaynak: ' + (it.src || '?') +
          ' · ' + new Date(it.created).toLocaleString('tr-TR') + (it.note ? ' · not: ' + it.note : '');
        var acts = document.createElement('div'); acts.className = 'acts';
        var ok = document.createElement('button'); ok.type = 'button'; ok.textContent = 'Yayınla';
        ok.addEventListener('click', function () { act(it.id, 'approve'); });
        var no = document.createElement('button'); no.type = 'button'; no.textContent = 'Reddet';
        no.addEventListener('click', function () { act(it.id, 'reject'); });
        acts.appendChild(ok); acts.appendChild(no);
        c.appendChild(im); c.appendChild(info); c.appendChild(acts); p.appendChild(c);
      });
      var l = $('log'); l.textContent = '';
      j.log.forEach(function (e) {
        var li = document.createElement('li');
        li.textContent = new Date(e.t).toLocaleString('tr-TR') + ' · ' + e.path + ' · ' + e.src + ' · ' + e.agent + (e.id ? ' · #' + e.id : '') + (e.model ? ' · model: ' + e.model : '') + (e.ref ? ' · geldiği link: ' + e.ref : '') + ' · ' + String(e.ua || '').slice(0, 140);
        l.appendChild(li);
      });
    }).catch(function () { $('msg').textContent = 'Bağlantı hatası.'; });
  }
  $('go').addEventListener('click', function () {
    key = $('key').value.trim();
    try { sessionStorage.setItem('k', key); } catch (e) {}
    load();
  });
  if (key) load();
})();
