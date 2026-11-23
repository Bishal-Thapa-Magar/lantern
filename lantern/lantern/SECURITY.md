# Security

## Reporting a problem

Please report vulnerabilities privately through **Security → Report a vulnerability** on the GitHub repository, not in a public issue. Include the steps to reproduce. We aim to reply within a few days.

## What is protected

| Risk | Protection |
| --- | --- |
| Script injection (XSS) | CSP with `script-src 'self'`, no inline scripts or `eval`, all remote text inserted with `textContent`, only `https` links and images, input length limits |
| Stolen sign-in redirect | OAuth PKCE, one-time code, verifier kept in `sessionStorage` and expiring after 30 minutes |
| Reading or changing someone else's data | Row Level Security on every table, `user_id` defaults to `auth.uid()` and is checked on write |
| Fake ratings or moderation bypass | Learners can write only `rating` and `comment`; the `hidden` flag is not writable by them |
| Abuse of free-tier storage | Row-count triggers and size checks in `supabase/schema.sql` |
| Secret leaks | Only the public anon key is used; CI fails if a `service_role` key or secret key pattern appears |
| Third-party tracking | None loaded; referrer is not sent; requests omit cookies |
| Supply chain | No npm or pip dependencies; only GitHub Actions, kept current by Dependabot |

## Known limits (be aware of these)

- **GitHub Pages cannot send HTTP headers.** The CSP is delivered in a `<meta>` tag, which cannot include `frame-ancestors`, and cannot set HSTS or `X-Content-Type-Options`. Lantern includes a script that refuses to run inside a frame. For the full header set, host on Cloudflare Pages or Netlify using `_headers`, or put GitHub Pages behind a proxy that adds headers.
- **The sign-in session is stored in `localStorage`.** That is standard for browser-only apps. The strict CSP is the main defense against script reading it, so do not weaken the CSP. Signing out clears it and revokes the session.
- **Reviews are public text.** Comments are shown as plain text (never HTML) and capped at 500 characters, but there is no automatic moderation. You can hide a review by setting `hidden = true` in the Supabase Table Editor.
- **Catalog facts can go stale.** Prices and certificate terms change; run `tools/check-links.mjs` and re-check regularly.
- **Live search results are third-party data.** They are validated and shown as text, but their content and ratings are not endorsed by Lantern.

## Owner checklist

- [ ] Turn on two-factor authentication for your GitHub and Supabase accounts.
- [ ] Protect `main`: require pull requests and the *Deploy to GitHub Pages* check.
- [ ] In Supabase set **Site URL** and **Redirect URLs** to your exact Pages address.
- [ ] Keep **Confirm email** on; set the minimum password length to 10 or more; on a paid plan enable leaked-password protection.
- [ ] Enable only the sign-in providers you actually offer.
- [ ] Never commit a `service_role` key, a database password or an OAuth client secret. Client secrets belong in the Supabase dashboard.
- [ ] Optional: pin the GitHub Actions in `.github/workflows` to full commit SHAs.
- [ ] Review Supabase **Logs** and **Advisors** occasionally.
