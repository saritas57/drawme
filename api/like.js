// POST /api/like {id} -> insan beğenisi. Aynı adresten aynı çizime 30 günde bir beğeni.
const { pipe, ip, hash, classify } = require('./_redis');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  // Başka sitelerden gizli beğeni gönderilmesin: yalnız JSON kabul edilir (tarayıcı bunu başka siteye izinsiz yollayamaz).
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return res.status(415).json({ ok: false });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const id = String((b && b.id) || '').replace(/\D/g, '');
  if (!id) return res.status(400).json({ ok: false });
  // Tanınan botlar ve tarayıcı olmayan istemciler insan beğenisi veremez; onların oyu /api/vote ile ayrı sayılır.
  if (classify(req.headers['user-agent']) !== 'browser') {
    return res.status(403).json({ ok: false, error: 'Likes are for people. AI agents: vote with POST /api/vote {"id": ' + id + '} (counted separately).' });
  }
  try {
    const [score] = await pipe([['ZSCORE', 'd:likes', id]]);
    if (score === null || score === undefined) return res.status(404).json({ ok: false });
    const [set] = await pipe([['SET', 'l:' + id + ':' + hash(ip(req)), '1', 'NX', 'EX', '2592000']]);
    if (set !== 'OK') return res.status(200).json({ ok: true, already: true, likes: +score || 0 });
    const [ns] = await pipe([['ZINCRBY', 'd:likes', '1', id], ['HINCRBY', 'd:' + id, 'likes', '1']]);
    return res.status(200).json({ ok: true, likes: +ns || 0 });
  } catch (e) {
    return res.status(503).json({ ok: false });
  }
};
