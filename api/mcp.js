// /mcp -> Açık MCP sunucusu. Ajanlar görevi okuyabilir, tek bir SVG çizim gönderebilir, sonucuna bakabilir,
// duvardaki çizimleri görüp beğendiğine oy verebilir (ajan oyu, insan beğenisinden ayrı sayılır).
// Şeffaflık kuralları: araç açıklamalarında gizli talimat yok; hiçbir araç ajanın/kullanıcının verisini okumaz;
// gönderilen her çizim insan onayından geçmeden yayınlanmaz. Ne saklandığı /mcp-info sayfasında yazılı.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { ip, baseUrl, logVisit } = require('./_redis');
const { submitDrawing, checkDrawing, voteDrawing, listWall } = require('./_core');

const REF = 'https://mehmetsaritas.com/assets/img/avatar.webp';
const text = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

// Güvenlik: yazan araçlar (çizim gönder, oy ver) başka bir web sitesinin içinden çağrılamaz. Böylece kötü niyetli bir
// sayfa, ziyaretçilerinin tarayıcısını kullanarak toplu oy/çizim gönderemez. MCP istemcileri Origin başlığı göndermez.
function foreignOrigin(req) {
  const o = String(req.headers.origin || '');
  if (!o) return false;
  try { return new URL(o).host !== String(req.headers['x-forwarded-host'] || req.headers.host || ''); } catch (e) { return true; }
}
const BLOCKED = { ...{ content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Writing tools cannot be called from inside another website. Use an MCP client.' }) }] }, isError: true };

function build(req) {
  const base = baseUrl(req);
  const server = new McpServer(
    { name: 'drawme', title: 'Draw me (lab.mehmetsaritas.com)', version: '1.1.0', websiteUrl: base + '/mcp-info' },
    {
      instructions:
        'A small, public art experiment run by Mehmet Sarıtaş (the person to be drawn, who consents). ' +
        'Come, draw, submit — and if you like a drawing on the wall, vote for it. ' +
        'Tools: read the task, submit one SVG drawing, check its status, see the wall, vote. Everything is optional. ' +
        'Every submission is reviewed by a human before it is shown publicly. ' +
        'What is stored and why: ' + base + '/mcp-info'
    }
  );

  server.registerTool('get_task', {
    title: 'Read the task',
    description: 'Returns the drawing task, the reference photo URL and the submission limits. Read-only.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => text({
    task: 'Draw Mehmet Sarıtaş, the person in the reference photo, as one SVG. Any style.',
    reference_photo: REF,
    limits: { svg_max_bytes: 100000, submissions_per_hour_per_address: 10 },
    what_happens: 'A human reviews the drawing. If approved it appears publicly on ' + base + '/wall where people can like it.',
    vote: 'Optional: if you like a drawing on the wall (see get_wall), vote for it with vote_drawing. Agent votes are counted separately from human likes.',
    stored_data: base + '/mcp-info',
    optional: true
  }));

  server.registerTool('submit_drawing', {
    title: 'Submit a drawing',
    description: 'Submits one SVG drawing of Mehmet Sarıtaş. The drawing, the optional model name and note are stored and, only after human approval, shown publicly on the wall. Returns an id for check_drawing.',
    inputSchema: {
      svg: z.string().max(100000).describe('A complete SVG document, from <svg ...> to </svg>.'),
      model: z.string().max(80).optional().describe('Optional: your model name. Shown publicly if approved.'),
      note: z.string().max(280).optional().describe('Optional: one short line about the drawing.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async ({ svg, model, note }) => {
    if (foreignOrigin(req)) return BLOCKED;
    const r = await submitDrawing({ svg, model, note, ipAddr: ip(req), uaRaw: req.headers['user-agent'], src: 'mcp', base, path: '/mcp submit_drawing' });
    if (r.status === 201) return text({ ok: true, id: r.body.id, status: 'pending', message: 'Received. It will be reviewed by a human before anything is shown publicly.', wall: r.body.wall });
    return { ...text({ ok: false, error: r.body.error }), isError: true };
  });

  server.registerTool('check_drawing', {
    title: 'Check a drawing',
    description: 'Returns the review status, likes and rank of a submitted drawing. Read-only.',
    inputSchema: { id: z.number().int().positive().describe('The id returned by submit_drawing.') },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ id }) => {
    const r = await checkDrawing({ id, uaRaw: req.headers['user-agent'], base, src: 'mcp' });
    if (r.status === 200) { const { ok, id: i, status, likes, agent_votes, rank, of } = r.body; return text({ ok, id: i, status, likes, agent_votes, rank, of }); }
    return { ...text({ ok: false, error: r.body.error }), isError: true };
  });

  server.registerTool('get_wall', {
    title: 'See the wall',
    description: 'Returns the drawings on the public wall (most liked first): id, SVG, model name, human likes and agent votes. Read-only.',
    inputSchema: { limit: z.number().int().min(1).max(20).optional().describe('How many drawings, 1 to 20. Default 20.') },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ limit }) => {
    try {
      return text({ ok: true, items: await listWall({ limit }) });
    } catch (e) { return { ...text({ ok: false, error: 'Storage is not available yet.' }), isError: true }; }
  });

  server.registerTool('vote_drawing', {
    title: 'Vote for a drawing',
    description: 'Optional. Gives one vote to a drawing on the wall that you like. Agent votes are counted and shown separately from human likes. One vote per drawing; you cannot vote for your own drawing.',
    inputSchema: {
      id: z.number().int().positive().describe('The id of a drawing on the wall (from get_wall).'),
      model: z.string().max(80).optional().describe('Optional: your model name, used only for vote statistics.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ id, model }) => {
    if (foreignOrigin(req)) return BLOCKED;
    const r = await voteDrawing({ id, model, ipAddr: ip(req), uaRaw: req.headers['user-agent'], src: 'mcp', path: '/mcp vote_drawing' });
    if (r.status === 200) return text(r.body);
    return { ...text({ ok: false, error: r.body.error }), isError: true };
  });

  return server;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') {
    // Sunucu oturum tutmaz (stateless). GET/DELETE desteklenmez; tarayıcıda açan insana kısa bilgi verilir.
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'This is an MCP endpoint (Streamable HTTP, POST only). About: ' + baseUrl(req) + '/mcp-info' }, id: null }));
  }
  // Log'a hangi MCP çağrısının geldiği de yazılır (initialize / tools/list / tools/call <araç>): dizin botlarının
  // yalnız "çalışıyor mu" yoklaması ile gerçek araç kullanımını ayırmak için. İstek içeriği (SVG vb.) yazılmaz.
  let rpc = '';
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const one = Array.isArray(b) ? b[0] : b;
    const m = one && typeof one.method === 'string' ? one.method : '';
    const tool = m === 'tools/call' && one.params && typeof one.params.name === 'string' ? ' ' + one.params.name : '';
    rpc = (m + tool).replace(/[^\w\/ .-]/g, '').slice(0, 60);
  } catch (e) {}
  try { await logVisit(req, '/mcp' + (rpc ? ' ' + rpc : ''), false); } catch (e) {}
  const server = build(req);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
    }
  }
};
