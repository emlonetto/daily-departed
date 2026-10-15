# The Daily Departed

Mock newspaper obituaries for coworkers who passed on to the great beyond (another job).
Made by [@emilylonetto](https://x.com/emilylonetto).

- `index.html` — the whole site (static).
- `api/obituary.js` — Vercel function that writes obituaries with Claude.
- Images: `og-image.png` (social preview) and favicons.

## Settings on Vercel
| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com (required for AI writing) |
| `ALLOWED_ORIGIN` | `https://yourdomain.com` (optional, blocks other sites from using your key) |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-haiku-5-5` |

Without a key, the site still works and writes from its built-in joke templates.
