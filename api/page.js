// The page for one shared obituary: /o/<id> (rewritten here by vercel.json).
// Serves the normal site with this obituary's link-preview tags and data baked in, so
// link previews show this person's card and the page opens straight to their obituary.
const fs = require('fs');
const path = require('path');
const { SITE, getObit, CAUSE_SHORT } = require('./_shared');

let template = null;
const page = () => template || (template = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const setMeta = (html, attr, key, value) =>
  html.replace(new RegExp(`<meta ${attr}="${key}" content="[^"]*">`), `<meta ${attr}="${key}" content="${esc(value)}">`);

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laid to rest · The Daily Departed</title>
<meta name="robots" content="noindex"><body style="margin:0;font:18px Georgia,serif;background:#f3f2ee;color:#141317;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">
<div><h1 style="font-weight:800">This obituary has been laid to rest.</h1><p>Its author took it down, or the link is mistyped.</p>
<p><a href="${SITE}/" style="color:#141317">Write one for your own departed coworker →</a></p></div></body>`);
}

module.exports = async (req, res) => {
  try {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const obit = await getObit(id);
    if (!obit) return notFound(res);
    const r = obit.record, cause = CAUSE_SHORT[r.cause] || 'unknown';
    const title = `RIP ${r.name}${r.title ? ', ' + r.title : ''} · The Daily Departed`;
    const desc = `Cause of death: ${cause}. “${r.epitaph}” Write one for your own departed coworker.`;
    let html = page();
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>\n<meta name="robots" content="noindex, nofollow">`);
    html = setMeta(html, 'name', 'description', desc);
    html = setMeta(html, 'property', 'og:url', `${SITE}/o/${id}`);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'property', 'og:description', desc);
    html = setMeta(html, 'property', 'og:image', `${SITE}/o/${id}/card.png`);
    html = setMeta(html, 'property', 'og:image:alt', `Obituary for ${r.name} in The Daily Departed`);
    // Hand the obituary to the page's script. Escape "<" so nothing in the text can close the script tag.
    const data = JSON.stringify({ id, record: r }).replace(/</g, '\\u003c');
    html = html.replace('</head>', `<script>window.__OBIT__=${data};</script>\n</head>`);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.end(html);
  } catch (e) {
    console.error(e);
    return notFound(res);
  }
};
