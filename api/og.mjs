// The link-preview image for one obituary: /o/<id>/card.png (rewritten here by vercel.json).
// Drawn on the server so X, LinkedIn, Slack and iMessage show *this* obituary when the link is shared.
import { ImageResponse } from '@vercel/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import shared from './_shared.js';
const { getObit, CAUSE_SHORT } = shared;

const fontFile = async name => {
  try { return await readFile(new URL('../fonts/' + name, import.meta.url)); }
  catch { return readFile(path.join(process.cwd(), 'fonts', name)); }
};
let fontsP = null;
const loadFonts = () => fontsP || (fontsP = Promise.all([
  fontFile('UnifrakturMaguntia.ttf').then(data => ({ name: 'Mast', data, weight: 400, style: 'normal' })),
  fontFile('Newsreader-ExtraBold.ttf').then(data => ({ name: 'News', data, weight: 800, style: 'normal' })),
  fontFile('Newsreader-Regular.ttf').then(data => ({ name: 'News', data, weight: 400, style: 'normal' })),
  fontFile('Newsreader-Italic.ttf').then(data => ({ name: 'News', data, weight: 400, style: 'italic' })),
  fontFile('IBMPlexMono-Medium.ttf').then(data => ({ name: 'Mono', data, weight: 500, style: 'normal' })),
]));

// Emoji would render as empty boxes in the image, so leave them out here.
const plain = s => String(s || '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();
const h = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } });

const INK = '#141317', SOFT = '#4a4950', PAPER = '#f3f2ee';

function card(r) {
  const name = plain(r.name), yrs = `${r.since || '????'} — ${plain(r.departed)}`;
  const nameSize = name.length > 26 ? 54 : name.length > 18 ? 66 : 78;
  const rule = h('div', { height: 2, background: INK, width: '100%' }, []);
  const mono = (t, s = {}) => h('div', { fontFamily: 'Mono', fontSize: 17, letterSpacing: 2, color: INK, ...s }, plain(t).toUpperCase());
  return h('div', { width: 1200, height: 630, background: PAPER, padding: 22 }, [
    h('div', { flex: 1, border: `6px solid ${INK}`, padding: 8 }, [
      h('div', { flex: 1, border: `2px solid ${INK}`, flexDirection: 'column', padding: '20px 48px 22px', gap: 12 }, [
        h('div', { justifyContent: 'center', fontFamily: 'Mast', fontSize: 64, color: INK, lineHeight: 1 }, 'The Daily Departed'),
        rule,
        h('div', { justifyContent: 'space-between' }, [mono('In memoriam'), mono('Deactivated accounts edition'), mono('daily-departed.com')]),
        rule,
        h('div', { flex: 1 }, []),
        h('div', { flexDirection: 'column', alignItems: 'center', gap: 6 }, [
          h('div', { fontFamily: 'News', fontWeight: 800, fontSize: nameSize, color: INK, lineHeight: 1.02, textAlign: 'center' }, name),
          r.title ? h('div', { fontFamily: 'News', fontStyle: 'italic', fontSize: 30, color: SOFT }, plain(r.title)) : null,
          mono(yrs, { fontSize: 20, letterSpacing: 1 }),
        ].filter(Boolean)),
        h('div', { flex: 1 }, []),
        h('div', { borderTop: `2px solid ${INK}`, borderBottom: `2px solid ${INK}`, padding: '14px 10px', justifyContent: 'center' }, [
          h('div', { fontFamily: 'News', fontStyle: 'italic', fontSize: 34, color: INK, textAlign: 'center', lineHeight: 1.2 }, `“${plain(r.epitaph)}”`),
        ]),
        h('div', { justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }, [
          mono(`Cause of death: ${CAUSE_SHORT[r.cause] || 'unknown'}`, { fontSize: 18 }),
          mono('Write one for your departed →', { fontSize: 18, color: SOFT }),
        ]),
      ]),
    ]),
  ]);
}

export default async function handler(req, res) {
  try {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const obit = await getObit(id);
    if (!obit) { res.statusCode = 404; res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.end('Not found'); }
    const img = new ImageResponse(card(obit.record), { width: 1200, height: 630, fonts: await loadFonts() });
    const buf = Buffer.from(await img.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.end(buf);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    return res.end('Could not draw this obituary.');
  }
}
