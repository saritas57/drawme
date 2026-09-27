// Upstash Redis REST yardımcıları (bağımlılık yok, sadece fetch)
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function pipe(cmds) {
  if (!URL_ || !TOKEN) throw new Error('store-not-configured');
  const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('store-http-' + r.status);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const ip = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
const hash = s => crypto.createHash('sha256').update(String(s) + (process.env.ADMIN_KEY || 'lab-salt')).digest('hex').slice(0, 16);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
const baseUrl = req => 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'lab.mehmetsaritas.com');

const BOTS = [
  ['Google-InspectionTool', 'Google Inspection'], ['GoogleOther', 'GoogleOther'], ['Storebot-Google', 'Google Storebot'],
  ['AdsBot-Google', 'Google AdsBot'], ['Google-CloudVertexBot', 'Google Vertex'],
  ['bingbot', 'Bingbot'], ['YandexBot', 'YandexBot'], ['DuckDuckBot', 'DuckDuckBot'], ['Amazonbot', 'Amazonbot'],
  ['facebookexternalhit', 'Meta link preview'], ['meta-externalfetcher', 'Meta fetcher'],
  ['MistralAI-User', 'Mistral (user)'], ['cohere-ai', 'Cohere'], ['DuckAssistBot', 'DuckAssist'],
  ['Diffbot', 'Diffbot'], ['YouBot', 'You.com'], ['Timpibot', 'Timpi'],
  ['Twitterbot', 'X link preview'], ['LinkedInBot', 'LinkedIn preview'], ['WhatsApp', 'WhatsApp preview'],
  ['TelegramBot', 'Telegram preview'], ['Slackbot', 'Slack preview'], ['Discordbot', 'Discord preview'],
  ['GPTBot', 'OpenAI GPTBot'], ['ChatGPT-User', 'ChatGPT (user)'], ['OAI-SearchBot', 'OpenAI Search'],
  ['ClaudeBot', 'Anthropic ClaudeBot'], ['Claude-User', 'Claude (user)'], ['Claude-SearchBot', 'Claude Search'],
  ['anthropic-ai', 'Anthropic'], ['PerplexityBot', 'PerplexityBot'], ['Perplexity-User', 'Perplexity (user)'],
  ['Google-Extended', 'Google-Extended'], ['Googlebot', 'Googlebot'], ['bingbot', 'Bingbot'],
  ['Applebot', 'Applebot'], ['Bytespider', 'Bytespider'], ['CCBot', 'CommonCrawl'],
  ['meta-externalagent', 'Meta'], ['curl', 'curl'], ['python', 'python'], ['node', 'node'],
  ['axios', 'axios'], ['undici', 'node'], ['Go-http-client', 'Go']
];
function classify(ua) {
  const u = String(ua || '').toLowerCase();
  for (const [k, n] of BOTS) if (u.includes(k.toLowerCase())) return n;
  // MCP dizinlerinin ve tarayıcıların "sunucu çalışıyor mu" yoklamaları (mcphub-probe, ProofBench, verifymcp, BrickBlueBot vb.)
  if (/probe|registry|health|mcpindex|mcp-index|sondes|liveness|mcpbeat|sentineloracle|collector|observatory|uptime|monitor/.test(u)) return 'MCP directory probe';
  if (/bot\b|bot\/|crawler|spider/.test(u) && !u.includes('mozilla')) return 'other bot';
  if (u.includes('mozilla')) return 'browser';
  return u ? 'other' : 'empty';
}

const HANDSHAKE = /^\/mcp (initialize|notifications\/initialized|tools\/list|server\/discover|ping|resources\/list|resources\/templates\/list|prompts\/list)$/;

// Ziyaret kaydı. count=true ise "görev sayfası ziyareti" sayacını da artırır.
async function logVisit(req, path, count) {
  const rawUa = String(req.headers['user-agent'] || '');
  const ua = rawUa.slice(0, 300);
  const ref = String(req.headers.referer || '').slice(0, 200);
  const q = (req.query && req.query.src) ? String(req.query.src).slice(0, 40) : '';
  const src = q || (ref ? 'referrer' : 'direct');
  const agent = classify(rawUa); // tanıma tam metin üzerinden: bot adı 300 karakterden sonra kalsa da yakalanır
  // MCP dizinlerinin kayıt botları (sunucu açık mı yoklaması) son kayıtlar listesine yazılmaz, yalnız adlarıyla sayılır.
  // Böylece listede gerçek ziyaretler kaybolmaz.
  if (agent === 'MCP directory probe') {
    const name = (ua.split(/[\/\s(]/)[0] || 'unknown').slice(0, 40);
    await pipe([['HINCRBY', 'v:probe', name, '1']]);
    return { src, agent, ua };
  }
  // MCP'ye yalnız bağlanıp araç listesine bakan istekler (araç çalıştırmayan) listeye yazılmaz; istemci adıyla sayılır.
  // Yeni bir istemci adı (ör. gerçek bir ajan uygulaması) bu sayımda görünür; araç çalıştırırsa o satır listede çıkar.
  if (HANDSHAKE.test(path)) {
    const name = (ua.split(/[\/\s(]/)[0] || 'kimliksiz').slice(0, 40);
    await pipe([['HINCRBY', 'v:mcpcheck', name, '1']]);
    return { src, agent, ua };
  }
  const entry = JSON.stringify({ t: Date.now(), path, src, agent, ua, ref });
  const cmds = [
    ['HINCRBY', 'v:path', path, '1'],
    ['LPUSH', 'v:log', entry],
    ['LTRIM', 'v:log', '0', '4999']
  ];
  if (count) cmds.push(['INCR', 'v:count'], ['HINCRBY', 'v:src', src, '1'], ['HINCRBY', 'v:agent', agent, '1']);
  await pipe(cmds);
  return { src, agent, ua };
}

function toObj(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i < flat.length; i += 2) o[flat[i]] = +flat[i + 1] || 0;
  return o;
}

module.exports = { pipe, ip, hash, esc, b64, baseUrl, classify, logVisit, toObj, HANDSHAKE };
