// GET /api/wall -> yalnız ONAYLANMIŞ çizimler + sayaçlar
const { pipe } = require('./_redis');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [ids, visits, total, checks] = await pipe([
      ['ZREVRANGE', 'd:likes', '0', '199'], ['GET', 'v:count'], ['GET', 'd:total'], ['GET', 'v:checks']
    ]);
    let items = [];
    if (ids && ids.length) {
      const rows = await pipe(ids.map(id => ['HMGET', 'd:' + id, 'svg', 'model', 'likes', 'created', 'status']));
      items = rows.map((r, i) => ({ id: +ids[i], svg: r[0], model: r[1] || null, likes: +r[2] || 0, created: +r[3] || 0, status: r[4] }))
        .filter(x => x.svg && x.status === 'approved')
        .map(({ status, ...x }) => x);
    }
    return res.status(200).json({
      ok: true,
      stats: { visits: +visits || 0, submitted: +total || 0, published: items.length, checks: +checks || 0 },
      items
    });
  } catch (e) {
    return res.status(503).json({ ok: false, stats: null, items: [] });
  }
};
