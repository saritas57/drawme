// GET /api/drawing?id= -> ajan geri gelip sonucuna bakar. Her bakış "geri dönüş" olarak sayılır.
const { baseUrl } = require('./_redis');
const { checkDrawing } = require('./_core');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const r = await checkDrawing({ id: req.query && req.query.id, uaRaw: req.headers['user-agent'], base: baseUrl(req) });
  return res.status(r.status).json(r.body);
};
