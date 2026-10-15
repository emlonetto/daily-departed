// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.
const crypto = require('crypto');

const SITE = 'https://www.daily-departed.com';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---- signing: only obituaries our own writer produced can be published ----
function secret() {
  const base = process.env.SHARE_SECRET || process.env.ANTHROPIC_API_KEY || '';
  return crypto.createHash('sha256').update('daily-departed:' + base).digest();
}
const CAUSES = ['offer', 'startup', 'competitor', 'sabbatical', 'restructure', 'boomerang', 'unknown'];
// The exact record that gets signed, stored and shown. Fixed key order = stable signature.
function canonical(r) {
  r = r || {};
  return {
    name: clip(r.name, 40) || 'A Beloved Coworker',
    title: clip(r.title, 50),
    since: clip(r.since, 4),
    departed: clip(r.departed, 40),
    cause: CAUSES.includes(r.cause) ? r.cause : 'unknown',
    epitaph: clip(r.epitaph, 160),
    paragraphs: (Array.isArray(r.paragraphs) ? r.paragraphs : []).slice(0, 3).map(p => clip(p, 700)),
    survived: clip(r.survived, 300),
    flowers: clip(r.flowers, 300),
    services: clip(r.services, 300),
  };
}
function sign(record) {
  return crypto.createHmac('sha256', secret()).update(JSON.stringify(canonical(record))).digest('base64url');
}
function verify(record, sig) {
  if (typeof sig !== 'string') return false;
  const a = Buffer.from(sign(record)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- storage: Supabase or Upstash Redis, whichever is connected in Vercel ----
// Supabase table (run once in Supabase → SQL Editor):
//   create table public.obituaries (id text primary key, record jsonb not null, token_hash text not null, created_at timestamptz not null default now());
//   alter table public.obituaries enable row level security;   -- no policies: only this server (secret key) can read or write
// Finds the Supabase settings whatever prefix the Vercel integration gave them
// (SUPABASE_URL, STORAGE_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, ...).
let supaCache;
function supaEnv() {
  if (supaCache !== undefined) return supaCache;
  const env = process.env, names = Object.keys(env);
  const isUrl = v => /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(String(v || '').trim());
  const urlName = ['SUPABASE_URL'].concat(names.filter(n => /SUPABASE_URL$/.test(n)), names.filter(n => /_URL$/.test(n)))
    .find(n => isUrl(env[n]));
  const keyName = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']
    .concat(names.filter(n => /(SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)$/.test(n)))
    .find(n => env[n] && !/^NEXT_PUBLIC_|^VITE_PUBLIC_/.test(n));
  supaCache = urlName && keyName ? { url: env[urlName].trim().replace(/\/$/, ''), key: env[keyName].trim() } : null;
  return supaCache;
}
function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
const storageReady = () => !!(supaEnv() || redisEnv());

async function redis(...cmd) {
  const env = redisEnv();
  const r = await fetch(env.url, { method: 'POST', headers: { Authorization: `Bearer ${env.token}` }, body: JSON.stringify(cmd) });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error('redis: ' + (data.error || r.status));
  return data.result;
}
async function supa(method, query, body, extraHeaders = {}) {
  const env = supaEnv();
  const headers = { apikey: env.key, 'content-type': 'application/json', ...extraHeaders };
  if (env.key.startsWith('eyJ')) headers.Authorization = `Bearer ${env.key}`;   // legacy service_role keys are JWTs
  return fetch(`${env.url}/rest/v1/obituaries${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// Returns { record, tokenHash } or null.
async function getObit(id) {
  if (!/^[A-Za-z0-9]{6,12}$/.test(String(id || ''))) return null;
  if (supaEnv()) {
    const r = await supa('GET', `?id=eq.${id}&select=record,token_hash`);
    if (!r.ok) throw new Error('supabase get: ' + r.status + ' ' + await r.text());
    const rows = await r.json();
    return rows[0] ? { record: rows[0].record, tokenHash: rows[0].token_hash } : null;
  }
  const raw = await redis('GET', 'obit:' + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
// Saves only if the id is unused. Returns true when saved.
async function createObit(id, record, tokenHash) {
  if (supaEnv()) {
    const r = await supa('POST', '', { id, record, token_hash: tokenHash }, { Prefer: 'return=minimal' });
    if (r.status === 409) return false;
    if (!r.ok) throw new Error('supabase insert: ' + r.status + ' ' + await r.text());
    return true;
  }
  return !!(await redis('SET', 'obit:' + id, JSON.stringify({ record, tokenHash, createdAt: Date.now() }), 'NX'));
}
async function deleteObit(id) {
  if (supaEnv()) {
    const r = await supa('DELETE', `?id=eq.${id}`);
    if (!r.ok) throw new Error('supabase delete: ' + r.status + ' ' + await r.text());
    return;
  }
  await redis('DEL', 'obit:' + id);
}

// ---- small utilities ----
const ALPHA = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newId(n = 8) { const b = crypto.randomBytes(n); let s = ''; for (const x of b) s += ALPHA[x % ALPHA.length]; return s; }
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');

const CAUSE_SHORT = { offer: 'a better offer', startup: 'founding a startup', competitor: 'joining a competitor', sabbatical: 'a sabbatical',
  restructure: 'a "restructuring"', boomerang: 'temporary (allegedly)', unknown: 'unknown' };

function limiter(max, windowMs) {
  const hits = new Map();
  return ip => {
    const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
    recent.push(now); hits.set(ip, recent); if (hits.size > 5000) hits.clear();
    return recent.length > max;
  };
}
const ipOf = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

module.exports = { SITE, clip, canonical, sign, verify, storageReady, getObit, createObit, deleteObit, newId, hash, CAUSE_SHORT, limiter, ipOf };
