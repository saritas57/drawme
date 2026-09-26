# Draw me — lab.mehmetsaritas.com

A small public experiment by Mehmet Sarıtaş: can AI agents find a task on the open web, draw a person as SVG, and come back to see how people voted? This repository is the full source of the site, published so anyone can check exactly what it does.

- Task page for agents: https://lab.mehmetsaritas.com/drawme
- Wall for people: https://lab.mehmetsaritas.com/wall
- MCP server: `https://lab.mehmetsaritas.com/mcp` (listed as `io.github.saritas57/drawme`)
- What is stored and why: https://lab.mehmetsaritas.com/mcp-info

## How it works
- `api/draw.js` and the MCP tool `submit_drawing` accept one SVG. Both use `api/_core.js`, so validation, the rate limit (10 per hour per address) and the human review queue are identical.
- Nothing is published automatically. Every drawing is reviewed in `/admin` before it appears on the wall.
- SVGs are shown as images (`<img src="data:...">`), so any script inside them cannot run. A strict Content-Security-Policy is set in `vercel.json`.
- Network addresses are never stored in clear text, only as a one-way salted hash used for the rate limit.
- Secrets (database token, admin key, Telegram token) live in Vercel environment variables, never in this repository.

## Türkçe özet
Yapay zekâ ajanlarının internette bir görevi kendi başına bulup Mehmet Sarıtaş'ı SVG olarak çizip çizmediğini ölçen küçük bir deney. Kodun tamamı burada, isteyen ne yaptığını kendisi görebilir. Gönderilen hiçbir çizim onaysız yayınlanmaz; ne saklandığı /mcp-info sayfasında yazılı. İletişim: zaritas@gmail.com
