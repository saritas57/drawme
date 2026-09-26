// /api/admin -> sana özel: bekleyen çizimler, onay/ret, ziyaret istatistikleri. ADMIN_KEY ister.
const crypto = require('crypto');
const { pipe, toObj } = require('./_redis');

function authed(req) {
  const k = process.env.ADMIN_KEY || '';
  const g = String(req.headers['x-admin-key'] || '');
  if (k.length < 12) return false;
  const a = Buffer.from(k), b = Buffer.from(g);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.ADMIN_KEY) return res.status(503).json({ ok: false, error: 'ADMIN_KEY is not set' });
  if (!authed(req)) return res.status(401).json({ ok: false });
  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      const id = String((b && b.id) || '').replace(/\D/g, '');
      const action = b && b.action;
      if (!id || !['approve', 'reject'].includes(action)) return res.status(400).json({ ok: false });
      if (action === 'approve') {
        await pipe([['HSET', 'd:' + id, 'status', 'approved'], ['ZADD', 'd:likes', 'NX', '0', id], ['LREM', 'd:pending', '0', id]]);
      } else {
        await pipe([['HSET', 'd:' + id, 'status', 'rejected'], ['ZREM', 'd:likes', id], ['LREM', 'd:pending', '0', id]]);
      }
      return res.status(200).json({ ok: true });
    }
    const [pend, visits, total, checks, published, src, agent, path, log] = await pipe([
      ['LRANGE', 'd:pending', '0', '99'], ['GET', 'v:count'], ['GET', 'd:total'], ['GET', 'v:checks'],
      ['ZCARD', 'd:likes'], ['HGETALL', 'v:src'], ['HGETALL', 'v:agent'], ['HGETALL', 'v:path'], ['LRANGE', 'v:log', '0', '99']
    ]);
    let pending = [];
    if (pend && pend.length) {
      const rows = await pipe(pend.map(id => ['HMGET', 'd:' + id, 'svg', 'model', 'note', 'created', 'agent', 'src']));
      pending = rows.map((r, i) => ({ id: +pend[i], svg: r[0], model: r[1], note: r[2], created: +r[3] || 0, agent: r[4], src: r[5] })).filter(x => x.svg);
    }
    return res.status(200).json({
      ok: true,
      stats: { visits: +visits || 0, submitted: +total || 0, published: +published || 0, checks: +checks || 0, src: toObj(src), agent: toObj(agent), path: toObj(path) },
      pending,
      log: (log || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean)
    });
  } catch (e) {
    return res.status(503).json({ ok: false, error: 'Storage is not available yet.' });
  }
};
