# HandyMiner — landing page

Static landing page for **handyminer.com**, hosted on GitHub Pages.

This repo exists primarily so the apex domain has a real, public,
HTTPS-served page that Stripe (and other vendors) can use to verify
domain ownership. The real product lives on a subdomain
(e.g. `app.handyminer.com`).

## Files

- `index.html` — main landing page.
- `terms.html` — Terms of Service (linked from the footer; required by Stripe).
- `privacy.html` — Privacy Policy (linked from the footer; required by Stripe).
- `styles.css` — single shared stylesheet, dark theme matching the in-app UI.
- `script.js` — tiny progressive-enhancement script (footer year, smooth-scroll).
- `CNAME` — tells GitHub Pages which custom domain serves this site.
- `.nojekyll` — disables Jekyll processing so files are served verbatim.

## Editing the CTAs

The "Sign in" / "Get started" buttons point at
`https://app.handyminer.com/...`. If your app lives somewhere else, find
and replace that hostname inside `index.html`.

## Deploying on GitHub Pages

1. Push this repo to GitHub.
2. In the repo on github.com, go to **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**, branch **`main`**, folder **`/ (root)`**, then **Save**.
4. Under **Custom domain**, enter `handyminer.com` and click **Save**.
   - GitHub will write/verify the `CNAME` file (already present here).
   - Wait for the DNS check to go green, then check **Enforce HTTPS**.

## Pointing Namecheap at GitHub Pages

In Namecheap → **Domain List → Manage → Advanced DNS**, replace the
existing records with:

| Type    | Host  | Value                  | TTL       |
|---------|-------|------------------------|-----------|
| A       | @     | `185.199.108.153`      | Automatic |
| A       | @     | `185.199.109.153`      | Automatic |
| A       | @     | `185.199.110.153`      | Automatic |
| A       | @     | `185.199.111.153`      | Automatic |
| CNAME   | www   | `<your-gh-username>.github.io.` | Automatic |

(These are GitHub's published apex IPs; the trailing dot on the CNAME
target is required by Namecheap's editor.)

After DNS propagates (usually a few minutes, occasionally up to an
hour), `https://handyminer.com` will serve this page and you can give
that domain to Stripe for verification.

## Local preview

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
