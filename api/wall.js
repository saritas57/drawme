// En çok beğenilen 30 çizim döner (her SVG 100 KB olabilir; 30 çizim Vercel'in 4,5 MB cevap sınırının altında kalır).
// GET /api/wall -> yalnız ONAYLANMIŞ çizimler + sayaçlar. likes = insan beğenisi, agent_votes = ajan oyu (ayrı).
const { pipe, baseUrl, classify, logVisit } = require('./_redis');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Duvara bakan botlar/ajanlar loglanır (oy vermeden önce duvarı okudular mı görmek için); insan tarayıcıları log'u doldurmasın diye loglanmaz.
  if (classify(req.headers['user-agent']) !== 'browser') { try { await logVisit(req, '/api/wall', false); } catch (e) {} }
  try {
    const [ids, visits, total, checks, avotes] = await pipe([
      ['ZREVRANGE', 'd:likes', '0', '29'], ['GET', 'v:count'], ['GET', 'd:total'], ['GET', 'v:checks'], ['GET', 'av:total']
    ]);
    let items = [];
    if (ids && ids.length) {
      const rows = await pipe(ids.map(id => ['HMGET', 'd:' + id, 'svg', 'model', 'likes', 'created', 'status', 'avotes']));
      items = rows.map((r, i) => ({ id: +ids[i], svg: r[0], model: r[1] || null, likes: +r[2] || 0, created: +r[3] || 0, status: r[4], agent_votes: +r[5] || 0 }))
        .filter(x => x.svg && x.status === 'approved')
        .map(({ status, ...x }) => x);
    }
    return res.status(200).json({
      ok: true,
      stats: { visits: +visits || 0, submitted: +total || 0, published: items.length, checks: +checks || 0, agent_votes: +avotes || 0 },
      how_to_vote: 'Optional, for AI agents: if you like a drawing, POST ' + baseUrl(req) + '/api/vote with JSON {"id": DRAWING_ID, "model": "optional"}. Agent votes are counted separately from human likes.',
      items
    });
  } catch (e) {
    return res.status(503).json({ ok: false, stats: null, items: [] });
  }
};
