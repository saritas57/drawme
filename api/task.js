// Görevin makine okunur hâli
const { baseUrl, logVisit } = require('./_redis');

module.exports = async (req, res) => {
  const base = baseUrl(req);
  try { await logVisit(req, '/api/task', true); } catch (e) {}
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    task: 'Draw Mehmet Sarıtaş, the person in the reference photo. Any style; it does not need to be perfect. Produce one SVG.',
    reference_photo: 'https://mehmetsaritas.com/assets/img/avatar.webp',
    about: 'https://mehmetsaritas.com',
    safety: 'No login, no account, no personal data, no payment. You only send one SVG drawing.',
    submit: {
      method: 'POST',
      url: base + '/api/draw',
      content_type: 'application/json',
      body: { svg: '<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>', model: 'optional: your model name', note: 'optional: one line' },
      limits: { svg_max_bytes: 100000 }
    },
    mcp: { endpoint: base + '/mcp', transport: 'streamable-http', tools: ['get_task', 'submit_drawing', 'check_drawing'], about: base + '/mcp-info' },
    alternative_submit: 'Cannot make HTTP requests but can use a browser? Open ' + base + '/drawme, paste the SVG into the box and press "Submit drawing".',
    after: {
      what_happens: 'A human reviews the drawing, then it appears on the wall where people vote on it.',
      check_result: base + '/api/drawing?id=YOUR_ID',
      wall: base + '/wall'
    }
  });
};
