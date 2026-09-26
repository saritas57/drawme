// Ortak çekirdek: çizim alma ve sonuç sorgulama. Hem web uçları (/api/draw, /api/drawing) hem MCP aracı bunu kullanır,
// böylece doğrulama, hız sınırı, onay kuyruğu ve bildirim her yolda aynı kalır.
const { pipe, hash, classify } = require('./_redis');

// Telegram bildirimi: yeni çizim gelince sana mesaj atar. Hata olursa sessizce geçer, çizim kaydı etkilenmez.
async function notify(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 3000);
  try {
    await fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: ac.signal
    });
  } catch (e) { /* bildirim gitmese de sorun değil */ }
  finally { clearTimeout(t); }
}

// Gönderenin yazdığı metindeki linkleri bozar ki bildirimde tıklanamasın (örn. evil.com -> evil[.]com)
const defang = s => String(s || '-').replace(/:\/\//g, '[://]').replace(/\./g, '[.]').replace(/@/g, '[at]');

// Çizim al. Dönüş: { status: HTTP kodu, body: JSON }
async function submitDrawing({ svg, model, note, ipAddr, uaRaw, src, base, path }) {
  svg = typeof svg === 'string' ? svg.trim() : '';
  const body = svg.replace(/^<\?xml[^>]*>\s*/i, '');
  if (!/^<svg[\s>]/i.test(body) || !/<\/svg>\s*$/i.test(body)) {
    return { status: 400, body: { ok: false, error: 'Field "svg" must be a complete SVG document (<svg ...>...</svg>).' } };
  }
  if (Buffer.byteLength(svg, 'utf8') > 100000) return { status: 413, body: { ok: false, error: 'SVG is larger than 100 KB.' } };
  model = String(model || '').slice(0, 80);
  note = String(note || '').slice(0, 280);
  src = String(src || 'direct').slice(0, 40);
  const who = hash(ipAddr);
  const ua = String(uaRaw || '').slice(0, 300);

  try {
    const [cnt] = await pipe([['INCR', 'rl:d:' + who]]);
    if (+cnt === 1) await pipe([['EXPIRE', 'rl:d:' + who, '3600']]);
    if (+cnt > 10) return { status: 429, body: { ok: false, error: 'Too many submissions from this address. Try again in an hour.' } };

    const [id] = await pipe([['INCR', 'd:next']]);
    const now = Date.now();
    const agent = classify(uaRaw);
    await pipe([
      ['HSET', 'd:' + id, 'svg', svg, 'model', model, 'note', note, 'created', String(now), 'status', 'pending', 'likes', '0', 'agent', agent, 'src', src, 'ua', ua],
      ['LPUSH', 'd:pending', String(id)],
      ['INCR', 'd:total'],
      ['LPUSH', 'v:log', JSON.stringify({ t: now, path: path || '/api/draw', src, agent, ua, id: +id })],
      ['LTRIM', 'v:log', '0', '4999']
    ]);
    await notify('Yeni çizim #' + id + ' geldi (onay bekliyor)\nModel: ' + defang(model) + '\nAjan: ' + agent + '\nKaynak: ' + defang(src) + '\nOnay: https://lab.mehmetsaritas.com/admin');
    return {
      status: 201,
      body: {
        ok: true,
        id: +id,
        status: 'pending',
        message: 'Thank you. Your drawing was received. After a quick human review it will appear on the wall, where people vote on it. Come back later to see your likes and rank.',
        check_result: base + '/api/drawing?id=' + id,
        wall: base + '/wall'
      }
    };
  } catch (e) {
    return { status: 503, body: { ok: false, error: 'Storage is not available yet. Please try again later.' } };
  }
}

// Sonuç sorgula. Her sorgu "geri dönüş" olarak sayılır.
async function checkDrawing({ id, uaRaw, base, src }) {
  id = String(id || '').replace(/\D/g, '');
  if (!id) return { status: 400, body: { ok: false, error: 'Use ?id=YOUR_ID' } };
  try {
    const [h, rank, total] = await pipe([
      ['HMGET', 'd:' + id, 'status', 'likes', 'model', 'created'],
      ['ZREVRANK', 'd:likes', id],
      ['ZCARD', 'd:likes']
    ]);
    if (!h || !h[0]) return { status: 404, body: { ok: false, error: 'No drawing with this id.' } };
    const ua = String(uaRaw || '').slice(0, 300);
    await pipe([
      ['INCR', 'v:checks'],
      ['HINCRBY', 'v:checks_by_id', id, '1'],
      ['LPUSH', 'v:log', JSON.stringify({ t: Date.now(), path: '/api/drawing', src: src || 'return', agent: classify(uaRaw), ua, id: +id })],
      ['LTRIM', 'v:log', '0', '4999']
    ]);
    const status = h[0];
    // Model adı gönderenin yazdığı serbest metin: yalnız senin onayından geçmiş çizimlerde gösterilir.
    const r = (rank === null || rank === undefined) ? null : +rank + 1;
    let note;
    if (status === 'approved') note = r === 1 ? 'Your drawing is currently the most-liked one.' : 'Your drawing is on the wall. Votes change over time — check back later.';
    else if (status === 'pending') note = 'Waiting for human review.';
    else note = 'This drawing was not published.';
    return { status: 200, body: { ok: true, id: +id, status, likes: +h[1] || 0, rank: r, of: +total || 0, model: status === 'approved' ? (h[2] || null) : null, note, wall: base + '/wall' } };
  } catch (e) {
    return { status: 503, body: { ok: false, error: 'Storage is not available yet.' } };
  }
}

module.exports = { submitDrawing, checkDrawing, notify, defang };
