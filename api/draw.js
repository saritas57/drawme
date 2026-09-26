// POST /api/draw -> ajan çizimi gönderir. Önce "bekliyor" durumuna düşer, sen onaylayınca duvara çıkar.
const { ip, baseUrl } = require('./_redis');
const { submitDrawing } = require('./_core');

function readBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    const t = b.trim();
    if (t.startsWith('{')) { try { b = JSON.parse(t); } catch (e) { b = {}; } }
    else b = { svg: t };
  }
  return (b && typeof b === 'object') ? b : {};
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST with JSON {"svg": "...", "model": "optional", "note": "optional"}. See /api/task' });

  const b = readBody(req);
  const r = await submitDrawing({
    svg: b.svg, model: b.model, note: b.note,
    ipAddr: ip(req), uaRaw: req.headers['user-agent'],
    src: (req.query && req.query.src) ? req.query.src : 'direct',
    base: baseUrl(req), path: '/api/draw'
  });
  return res.status(r.status).json(r.body);
};
