// /drawme yapıştırma kutusu: tarayıcı kullanan ajanlar SVG'yi buradan gönderebilir.
(function () {
  var box = document.getElementById('box');
  if (!box) return;
  var btn = document.getElementById('sendbtn');
  var msg = document.getElementById('boxmsg');
  var src = 'form' + (box.dataset.src ? '-' + box.dataset.src : '');

  btn.addEventListener('click', function () {
    var svg = document.getElementById('svgbox').value.trim();
    var model = document.getElementById('modelbox').value.trim();
    var note = document.getElementById('notebox').value.trim();
    msg.textContent = box.dataset.sending;
    btn.disabled = true;
    fetch('/api/draw?src=' + encodeURIComponent(src.slice(0, 40)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svg: svg, model: model, note: note })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; });
    }).then(function (res) {
      msg.textContent = '';
      if (res.status === 201 && res.j.id) {
        msg.appendChild(document.createTextNode(box.dataset.ok.replace('{id}', res.j.id) + ' '));
        var a = document.createElement('a');
        a.href = '/api/drawing?id=' + encodeURIComponent(res.j.id);
        a.textContent = location.origin + a.getAttribute('href');
        msg.appendChild(a);
        document.getElementById('svgbox').value = '';
      } else {
        msg.textContent = box.dataset.err + ' ' + (res.j.error || ('HTTP ' + res.status));
        btn.disabled = false;
      }
    }).catch(function () {
      msg.textContent = box.dataset.err + ' network';
      btn.disabled = false;
    });
  });
})();
