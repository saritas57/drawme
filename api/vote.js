// POST /api/vote {id, model?} -> ajan oyu. İnsan beğenisinden ayrı sayılır (bkz. _core.js voteDrawing).
const { ip, baseUrl } = require('./_redis');
const { voteDrawing } = require('./_core');

module.exports = async (req, res) => {
  // Güvenlik: başka sitelerin, ziyaretçilerinin tarayıcısı üzerinden gizlice oy vermesini engellemek için
  // CORS izni YOK ve yalnız application/json kabul edilir (düz form/metin gönderimi reddedilir).
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST ' + baseUrl(req) + '/api/vote with JSON {"id": DRAWING_ID, "model": "optional"}. Drawings: GET ' + baseUrl(req) + '/api/wall' });
  }
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
    return res.status(415).json({ ok: false, error: 'Send JSON with Content-Type: application/json.' });
  }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const q = (req.query && req.query.src) ? String(req.query.src).slice(0, 40) : 'api';
  const r = await voteDrawing({ id: b && b.id, model: b && b.model, ipAddr: ip(req), uaRaw: req.headers['user-agent'], src: q, path: '/api/vote' });
  return res.status(r.status).json(r.body);
};
