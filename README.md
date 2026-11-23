# Lantern

Free and low-cost learning, found in one place. Lantern searches a hand-picked catalog and five open libraries, then shows for each result **what it costs**, **whether it gives a certificate**, and an **effectiveness score** you can inspect. Learners can save things into lists, track progress and download files, on a phone or a laptop.

- **Search:** courses, videos, ebooks, PDFs, audio and practice sites, with filters for price, certificate, topic, level and offline use.
- **Honest scoring:** 0–100, built from learner ratings, editorial review, reach and access. Every part is shown, plus a confidence label. See [How it works](#how-the-score-works).
- **Library:** save to lists, mark *To learn / Learning now / Completed*, export or import as JSON.
- **One-tap download:** direct file links for Gutenberg and Internet Archive items.
- **Accounts (optional):** email plus Google, LinkedIn, Facebook and GitHub sign-in through Supabase, with sync across devices and community ratings.
- **Light, dark and night themes.** Night is true black with warm amber, easier on eyes and OLED batteries.
- **Built for low budgets:** no ads, no trackers, no third-party scripts or fonts, a data-saver switch, installable and usable offline.

No build step and no dependencies. It is plain HTML, CSS and JavaScript, so GitHub Pages can host it for free.

## 1. Publish on GitHub Pages (5 minutes)

1. Create a new GitHub repository and push this folder to the `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push any change (or run the *Deploy to GitHub Pages* workflow). Your site appears at `https://YOUR-NAME.github.io/REPO/`.
4. Replace `YOUR-NAME` in `config.js` (`feedbackUrl`) and in `.github/ISSUE_TEMPLATE/config.yml`.

Without step 5 below the site works fully in **guest mode**: search, save and download, with saved items kept on that device.

## 2. Turn on accounts (about 10 minutes, free)

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query:** paste `supabase/schema.sql` and run it. This creates the tables with Row Level Security.
3. **Authentication → URL Configuration:** set **Site URL** to your Pages address and add the same address (with the trailing slash) under **Redirect URLs**. Use the exact address, not a wildcard.
4. **Authentication → Providers:** enable what you want. Each provider needs a client ID and secret from its developer console. The callback URL to register is shown on the Supabase provider page and looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Google, Facebook, GitHub: enable as usual.
   - **LinkedIn:** enable **LinkedIn (OIDC)**. Lantern uses the provider name `linkedin_oidc`.
5. **Authentication → Providers → Email:** keep **Confirm email** on and set the **minimum password length to 10** or more.
6. Copy **Project URL** and the **anon public** key from **Project Settings → API** into `config.js`. Do not use the `service_role` key anywhere, ever. `tools/validate.mjs` fails the build if it finds one.
7. If your Supabase project is not `*.supabase.co`, edit `connect-src` in `index.html` (and `_headers`).

Remove providers you do not use from `oauthProviders` in `config.js`.

> **CAPTCHA:** Do not enable Supabase's CAPTCHA protection for email sign-up yet. Lantern does not send a CAPTCHA token, so email sign-in would fail. Supabase's built-in rate limits stay active.

### Smoke test after setup

1. Sign up with email, confirm the link, sign in.
2. Save an item. Check **Table Editor → saved_items** shows your row.
3. Sign in with a second account and confirm it cannot see the first account's rows.
4. Rate an item. Check the rating appears on the item for other users.
5. Try each social provider you enabled.

## 3. Keep the catalog accurate

The hand-picked catalog lives in `js/catalog/`. Prices, certificates and links change, so:

```bash
node tools/validate.mjs      # schema, security rules, CSP, offline file list (also runs in CI)
node tools/check-links.mjs   # opens every link; also runs weekly in GitHub Actions
```

Each entry has `price` (`free`, `audit`, `freemium`, `paid`), `cert` (`free`, `badge`, `paid`, `none`), an optional `certNote`, and an editorial `design` score `[structure, hands-on practice, depth]` from 1 to 5. When you change catalog or app files, bump `VERSION` in `sw.js` so returning visitors get the update.

The catalog facts were written from the maintainer's knowledge and **have not been re-verified against each site**. Run the link checker and spot-check prices and certificate terms before you announce the site.

### How the score works

| Signal | Weight | What it is |
| --- | --- | --- |
| What learners say | 40% | Star ratings from the source (Open Library, Internet Archive) and from Lantern members, shrunk toward 3.8 so few ratings count for less |
| How well it teaches | 35% | Editorial review (curated items only) |
| How many use it | 10% | Downloads or readers, on a log scale |
| Cost, proof and access | 15% | Free beats paid, certificate or badge, works offline |

Only the signals that exist are used, and the weights are re-balanced, so a missing signal is never counted as a bad one. Curated items start with no external star ratings; members' ratings build up over time. Nothing is invented.

## Where live results come from

Open Library, Project Gutenberg (via Gutendex), the Internet Archive, Wikiversity and Wikibooks. Searches go straight from the learner's browser to these sites. Learners can switch any of them off in Settings.

## Security design

- **Strict Content-Security-Policy:** only the site's own scripts and styles run (`script-src 'self'`, no inline code, no `eval`). Every remote string is inserted as text, never as HTML.
- **No third-party scripts, fonts or analytics.** Sign-in talks to Supabase's REST API directly, so there is no SDK to compromise.
- **Social login with PKCE.** A stolen redirect link cannot be redeemed without the secret held by the original browser tab.
- **Row Level Security** on every table. Learners can only read and write their own rows. The public can only see rating totals and review text, never user IDs.
- **Only the public anon key ships.** Limits on rows per user, text lengths and rating values are enforced in the database.
- **Links:** only `https` URLs are rendered, and external links use `rel="noopener noreferrer"`.
- **Service worker** caches only this site's own files, never API responses or tokens.
- **CI gate:** `tools/validate.mjs` blocks deployment if an unsafe pattern or a privileged key appears.

See [SECURITY.md](SECURITY.md) for limits and an owner checklist.

## Testing status

The app was tested in a real Chromium browser (mobile and desktop, three themes) against **mocked** responses for the search libraries and for Supabase, covering search, filters, saving, lists, sign-in, social-login redirect and code exchange, reviews and sign-out. The development sandbox could not reach the live APIs, so **please run the smoke test above against your real Supabase project and try a few live searches** after deploying.

## Project layout

```
index.html, css/, js/     the app (js/ui/ = screens, js/catalog/ = hand-picked list)
config.js                 your Supabase URL and anon key, provider buttons
supabase/schema.sql       database tables and security rules
sw.js, manifest.webmanifest, icons/   offline use and install-to-home-screen
tools/                    validate.mjs, check-links.mjs
_headers                  full security headers for Cloudflare Pages / Netlify
.github/                  Pages deploy, weekly link check, issue template
```

## License

MIT. Course and book content belongs to its providers; Lantern only links to it.
