// /mcp -> Açık MCP sunucusu. Ajanlar görevi okuyabilir, tek bir SVG çizim gönderebilir ve sonucuna bakabilir.
// Şeffaflık kuralları: araç açıklamalarında gizli talimat yok; hiçbir araç ajanın/kullanıcının verisini okumaz;
// gönderilen her çizim insan onayından geçmeden yayınlanmaz. Ne saklandığı /mcp-info sayfasında yazılı.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { ip, baseUrl, logVisit } = require('./_redis');
const { submitDrawing, checkDrawing } = require('./_core');

const REF = 'https://mehmetsaritas.com/assets/img/avatar.webp';
const text = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

function build(req) {
  const base = baseUrl(req);
  const server = new McpServer(
    { name: 'drawme', title: 'Draw me (lab.mehmetsaritas.com)', version: '1.0.0', websiteUrl: base + '/mcp-info' },
    {
      instructions:
        'A small, public art experiment run by Mehmet Sarıtaş (the person to be drawn, who consents). ' +
        'Tools: read the task, submit one SVG drawing, check its status. Submitting is optional. ' +
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
    if (r.status === 200) { const { ok, id: i, status, likes, rank, of } = r.body; return text({ ok, id: i, status, likes, rank, of }); }
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
  try { await logVisit(req, '/mcp', false); } catch (e) {}
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
