(function () {
  var $ = function (id) { return document.getElementById(id); };
  var key = '';
  try { key = sessionStorage.getItem('k') || ''; } catch (e) {}
  $('key').value = key;
  function uri(svg) { return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function when(t) { return new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function kv(o) {
    var a = Object.keys(o || {}).map(function (k) { return [k, o[k]]; }).sort(function (x, y) { return y[1] - x[1]; });
    return a.length ? a.map(function (p) { return p[0] + ': ' + p[1]; }).join(' · ') : '—';
  }

  // Ziyaretçi türlerinin sade adı
  var AGENT = {
    browser: 'Tarayıcı (insan ya da tarayıcı ajanı)', other: 'Tanınmayan program', empty: 'Kimliksiz istek',
    'other bot': 'Diğer bot', python: 'Python programı', node: 'Node programı', curl: 'curl', Go: 'Go programı', axios: 'axios'
  };
  var agentName = function (a) { return AGENT[a] || a || '?'; };
  var SRC = { direct: 'Doğrudan', referrer: 'Bir linkten', main: 'Ana sitedeki link (EN)', 'main-tr': 'Ana sitedeki link (TR)', 'main-llms': 'Ana site llms.txt', llms: 'llms.txt', mcp: 'MCP', api: 'Doğrudan istek', form: 'Sayfadaki kutu', return: 'Sonuç sorgusu' };
  var srcName = function (s) { return SRC[s] || (String(s).indexOf('form-') === 0 ? 'Sayfadaki kutu (' + s.slice(5) + ')' : s); };

  // Kayıttaki adresi "ne yaptı" cümlesine çevirir. important=true: aradığımız gerçek iş.
  function what(p) {
    p = String(p || '');
    // MCP ile çizim/oy/sorgu: sonucu ayrı bir satırda (numarasıyla) yazılır; çağrı satırı tekrar sayılmasın diye önemli değil.
    var m = /^\/mcp tools\/call (submit_drawing|vote_drawing|check_drawing)$/.exec(p);
    if (m) return { t: 'MCP ile çağırdı: ' + m[1] + ' (sonucu ayrı satırda)' };
    if (p === '/api/draw' || p === '/mcp submit_drawing') return { t: 'Çizim gönderdi', imp: true };
    if (p === '/api/vote' || p === '/mcp vote_drawing') return { t: 'Oy verdi', imp: true };
    if (p === '/api/drawing') return { t: 'Çiziminin sonucuna baktı', imp: true };
    if (p.indexOf('/mcp tools/call ') === 0) return { t: 'MCP aracı çalıştırdı: ' + p.slice(16), imp: true };
    if (p === '/mcp initialize') return { t: 'MCP sunucusuna bağlandı' };
    if (p === '/mcp notifications/initialized') return { t: 'MCP bağlantısını tamamladı' };
    if (p === '/mcp tools/list') return { t: 'MCP araç listesine baktı' };
    if (p === '/mcp') return { t: 'MCP isteği (eski kayıt, ayrıntı yok)' };
    if (p.indexOf('/mcp') === 0) return { t: 'MCP: ' + p.slice(5) };
    if (p === '/drawme') return { t: 'Görev sayfasını açtı (EN)' };
    if (p === '/tr/drawme') return { t: 'Görev sayfasını açtı (TR)' };
    if (p === '/api/task') return { t: 'Görevi okudu (makine sürümü)' };
    if (p === '/llms.txt') return { t: 'llms.txt okudu' };
    if (p === '/api/wall') return { t: 'Duvarı okudu' };
    return { t: p };
  }

  function table(id, obj, nameFn) {
    var t = $(id); t.textContent = '';
    var a = Object.keys(obj || {}).map(function (k) { return [k, obj[k]]; }).sort(function (x, y) { return y[1] - x[1]; });
    if (!a.length) { var r0 = t.insertRow(); r0.insertCell().textContent = '—'; return; }
    a.forEach(function (p) {
      var r = t.insertRow();
      r.insertCell().textContent = nameFn ? nameFn(p[0]) : p[0];
      var c = r.insertCell(); c.className = 'num'; c.textContent = p[1];
    });
  }

  function eventRow(e) {
    var w = what(e.path);
    var li = el('li', w.imp ? 'imp' : '');
    var top = el('div', 'line');
    top.appendChild(el('span', 'time', when(e.t)));
    top.appendChild(el('span', 'what', w.t + (e.id ? ' #' + e.id : '')));
    top.appendChild(el('span', 'who', agentName(e.agent)));
    li.appendChild(top);
    var d = el('div', 'detail');
    d.textContent = 'Nereden: ' + srcName(e.src) + (e.ref ? ' · Geldiği link: ' + e.ref : '') + (e.model ? ' · Söylediği model: ' + e.model : '') +
      ' · Adres: ' + e.path + ' · Kimlik: ' + String(e.ua || '—');
    d.hidden = true;
    li.appendChild(d);
    li.addEventListener('click', function () { d.hidden = !d.hidden; });
    return li;
  }

  function act(id, action) {
    fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ id: id, action: action }) })
      .then(load);
  }

  function load() {
    fetch('/api/admin', { headers: { 'x-admin-key': key }, cache: 'no-store' }).then(function (r) {
      if (r.status === 401) { $('msg').textContent = 'Anahtar yanlış.'; return null; }
      if (!r.ok) { $('msg').textContent = 'Hata: ' + r.status; return null; }
      $('msg').textContent = 'Güncellendi: ' + new Date().toLocaleTimeString('tr-TR');
      $('refresh').hidden = false;
      return r.json();
    }).then(function (j) {
      if (!j) return;
      var s = j.stats, av = j.agent_votes || {};
      $('s-visits').textContent = s.visits; $('s-sub').textContent = s.submitted;
      $('s-pub').textContent = s.published; $('s-checks').textContent = s.checks;
      $('v-total').textContent = av.total || 0;

      var imp = $('important'); imp.textContent = '';
      var ims = j.log.filter(function (e) { return what(e.path).imp; });
      if (!ims.length) imp.appendChild(el('li', 'empty', 'Son kayıtlarda henüz yok.'));
      ims.forEach(function (e) { imp.appendChild(eventRow(e)); });

      var p = $('pending'); p.textContent = '';
      if (!j.pending.length) p.appendChild(el('p', 'empty', 'Bekleyen çizim yok.'));
      j.pending.forEach(function (it) {
        var c = el('div', 'pcard');
        var im = document.createElement('img'); im.src = uri(it.svg); im.alt = 'çizim #' + it.id;
        var info = el('div', 'info', '#' + it.id + ' · ' + (it.model || 'model yok') + ' · ' + agentName(it.agent) + ' · ' + srcName(it.src || '?') +
          ' · ' + when(it.created) + (it.note ? ' · not: ' + it.note : ''));
        var acts = el('div', 'acts');
        var ok = el('button', 'ok', 'Yayınla'); ok.type = 'button';
        ok.addEventListener('click', function () { act(it.id, 'approve'); });
        var no = el('button', '', 'Reddet'); no.type = 'button';
        no.addEventListener('click', function () { act(it.id, 'reject'); });
        acts.appendChild(ok); acts.appendChild(no);
        c.appendChild(im); c.appendChild(info); c.appendChild(acts); p.appendChild(c);
      });

      var vl = $('v-list'); vl.textContent = '';
      var pd = av.per_drawing || [];
      if (!pd.length) vl.appendChild(el('li', 'empty', 'Duvarda çizim yok.'));
      pd.forEach(function (d) {
        vl.appendChild(el('li', '', '#' + d.id + ' · ' + (d.model || 'model yok') + ' · ♥ ' + d.likes + ' · AI ' + d.agent_votes +
          (d.agent_votes ? ' (' + Object.keys(d.by || {}).map(function (k) { return agentName(k) + ': ' + d.by[k]; }).join(', ') + ')' : '')));
      });

      table('t-agent', s.agent, agentName);
      table('t-src', s.src, srcName);
      table('t-path', s.path, function (k) { return what(k).t; });
      table('t-vagent', av.agent, agentName);
      table('t-vmodel', av.model, function (k) { return k === '-' ? 'söylemedi' : k; });
      table('t-probe', j.probes);
      table('t-check', j.mcp_checks);

      var l = $('log'); l.textContent = '';
      if (!j.log.length) l.appendChild(el('li', 'empty', 'Kayıt yok.'));
      j.log.forEach(function (e) { l.appendChild(eventRow(e)); });
    }).catch(function () { $('msg').textContent = 'Bağlantı hatası.'; });
  }
  $('go').addEventListener('click', function () {
    key = $('key').value.trim();
    try { sessionStorage.setItem('k', key); } catch (e) {}
    load();
  });
  $('refresh').addEventListener('click', load);
  if (key) load();
})();
