// Publishes an obituary as an unlisted page, or deletes one.
//   POST   /api/share  { record, sig }   -> { id, url, deleteToken }
//   DELETE /api/share  { id, token }     -> { deleted: true }
// Only records signed by /api/obituary are accepted, so nobody can publish arbitrary text on this domain.
const { SITE, canonical, verify, storageReady, getObit, createObit, deleteObit, newId, hash, limiter, ipOf } = require('./_shared');

const limited = limiter(20, 60 * 60 * 1000);   // 20 new links per visitor per hour

function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  return b && typeof b === 'object' ? b : null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed && req.headers.origin && req.headers.origin !== allowed) return res.status(403).json({ error: 'Not allowed.' });
  if (!storageReady()) return res.status(503).json({ error: 'Sharing links are not set up yet.' });
  const b = body(req);
  if (!b) return res.status(400).json({ error: 'Send JSON.' });

  try {
    if (req.method === 'POST') {
      if (!b.record || !verify(b.record, b.sig)) return res.status(400).json({ error: 'Only obituaries written on this site can be shared.' });
      if (limited(ipOf(req))) return res.status(429).json({ error: 'That is a lot of grief. Try again in a bit.' });
      const record = canonical(b.record), token = newId(24);
      let id;
      for (let i = 0; i < 5; i++) {            // NX = only if the id is free
        id = newId(8);
        if (await createObit(id, record, hash(token))) break;
        id = null;
      }
      if (!id) return res.status(500).json({ error: 'Could not save. Try again.' });
      return res.status(200).json({ id, url: `${SITE}/o/${id}`, deleteToken: token });
    }

    if (req.method === 'DELETE') {
      const obit = await getObit(b.id);
      if (!obit) return res.status(200).json({ deleted: true });       // already gone
      if (!b.token || hash(b.token) !== obit.tokenHash) return res.status(403).json({ error: 'Only the person who shared it can delete it.' });
      await deleteObit(b.id);
      return res.status(200).json({ deleted: true });
    }

    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Use POST or DELETE.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
};
