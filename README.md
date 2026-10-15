# The Daily Departed

Mock newspaper obituaries for coworkers who passed on to the great beyond (another job).
Made by [@emilylonetto](https://x.com/emilylonetto). Live at https://www.daily-departed.com

- `index.html`: the site.
- `api/obituary.js`: writes obituaries with Claude and signs them.
- `api/share.js`: publishes a signed obituary as an unlisted page, or deletes it.
- `api/page.js`: serves `/o/<id>` with that obituary's link-preview tags (hidden from search).
- `api/og.mjs`: draws `/o/<id>/card.png`, the link-preview image for one obituary.
- `fonts/`: fonts for the preview images. `vercel.json`: routes for `/o/...`.

## Settings on Vercel
| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key (required for AI writing) |
| `ALLOWED_ORIGIN` | `https://www.daily-departed.com` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | from Supabase; or connect Upstash Redis instead (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) |

Only AI-written obituaries can be shared as links. Shared pages are unlisted, hidden from search, never include
photos, and the author can delete them from the browser they shared from.

## Supabase table (run once in SQL Editor)
```sql
create table public.obituaries (
  id text primary key,
  record jsonb not null,
  token_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.obituaries enable row level security;
```
Row level security with no policies means only this site's server (using the secret key) can read or write the table.
