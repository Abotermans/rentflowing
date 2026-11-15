# Security Deployment Requirements

Rent Flow displays tenant, lease, receivable, guarantee, payment, and maintenance data on authenticated routes. Production deployments must not inject session replay into authenticated app pages unless all sensitive fields are masked before capture and the data processor is explicitly approved.

## Required Production Headers

Deploy the headers in `public/_headers` with the static app. Hosts that support `_headers` files, such as Cloudflare Pages and Netlify, should copy this file to the deployment root during `vite build`.
For a custom domain, set `PUBLIC_APP_ORIGIN=https://your-domain.example` during
the build; the build rewrites the path-scoped script policy in `dist/_headers`
to that HTTPS origin. Do not serve the default Lovable-origin CSP on a custom
domain, since it would block the app's own scripts.
The build also scopes Supabase image and network sources to the configured
`VITE_SUPABASE_URL`; an origin for a different project must not remain in the
deployed CSP.

Required controls:

- `Content-Security-Policy` with `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- A restrictive `Permissions-Policy`.

The CSP intentionally avoids `script-src 'self'` for production because Lovable injects replay scripts from same-origin `/__l5e/` paths. Production scripts are restricted to `/assets/` and `/security/` on the configured deployment origin.

Verify production after every host/config change:

```sh
curl -I https://rentflowing.lovable.app
```

Do not close security-header findings until the deployed response includes the required headers.

## Lovable Hosting Limitation

Lovable's default `*.lovable.app` host currently does not apply this repo's `public/_headers` file as HTTP response headers. It also strips CSP meta tags from the served HTML. For the default Lovable URL, CSP and anti-framing headers must be configured by Lovable itself.

For a production custom domain, use Lovable's advanced "Domain uses Cloudflare or a similar proxy" option, then configure the required security headers at the CDN/reverse proxy layer. Lovable documents this path at `https://docs.lovable.dev/features/custom-domain#advanced-use-a-cdn-or-reverse-proxy`. Lovable custom domains require a paid plan; do not assume this route meets a no-extra-fee constraint.

## Frontend Deployment Paths

Choose and verify one path before inviting real users:

1. **Static frontend on Cloudflare Pages:** Build this repository with
   `PUBLIC_APP_ORIGIN` set to the final HTTPS origin (a `*.pages.dev` URL is
   sufficient; no custom domain is required) and the backend's public
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Publish `dist/`.
   Pages applies `dist/_headers` to static responses. The backend remains on
   its current provider; this does not migrate its database. Configure the
   backend authentication redirect allowlist for the new domain and verify
   sign-in, invitations, uploads, and authenticated data access there.
2. **Lovable custom domain behind Cloudflare:** Use Lovable's advanced
   CDN/reverse-proxy setup. A proxied DNS record is required for Cloudflare
   response-header transform rules. Set each required header at Cloudflare,
   using the final domain in the CSP `script-src` paths. Do not assume
   `public/_headers` is applied by Lovable. Verify the deployed app is the
   intended repository revision and that replay scripts are absent.

Cloudflare documents static `_headers` for Pages at
`https://developers.cloudflare.com/pages/configuration/headers/` and
response-header transform rules at
`https://developers.cloudflare.com/rules/transform/response-header-modification/`.
The repository cannot select a domain, configure the owner's DNS/provider
accounts, or prove production compliance before that environment exists.

### No-extra-fee frontend staging option

Cloudflare Pages has a Free plan, and Lovable documents hosting a React/Vite
frontend separately while retaining the existing Lovable backend. Static
asset requests do not invoke paid Pages Functions. This is a
possible staging route without exporting the database or paying for another
Supabase project; it is not a substitute for the pending backend migration and
authenticated release checks. The owner must choose and authorize a Pages
account/project before any deployment.

For a Pages Git build, use `npm run build` with output directory `dist`. Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the existing backend
and `PUBLIC_APP_ORIGIN` to the exact HTTPS origin serving that build (the
stable `*.pages.dev` project URL or a custom domain). Pages builds now fail if
this origin is omitted, to prevent a CSP tied to the old Lovable host. For
preview branches with a different origin, set it to the branch deployment URL
for that build; authentication redirects must also allow any preview origin
used for login. Do not publish a preview to real users before its full release
gate passes.

Pages applies `dist/_headers` to static responses, and its default SPA behavior
serves `index.html` for client-side routes when there is no top-level
`404.html`. Verify both `/` and a direct `/leases/...` request on the actual
Pages deployment, plus `npm run check:production-headers -- <pages-origin> <backend-origin>`.
Then run the deployment revision check and authenticated sign-in, invitation,
document, and payment smoke tests. The Pages site is not production-ready
until those checks and the backend gates in `RELEASE.md` pass.

References: https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership,
https://developers.cloudflare.com/pages/configuration/build-configuration/,
https://developers.cloudflare.com/pages/configuration/headers/,
https://developers.cloudflare.com/pages/configuration/serving-pages/,
https://developers.cloudflare.com/pages/platform/limits/.

Run `npm run check:production-headers -- https://your-domain.example https://your-project.supabase.co` against
the final HTTPS origin and its expected backend. This check rejects cross-origin redirects and requires
origin-scoped script, connection, image, form and default CSP directives, plus
one-year HSTS, anti-framing, nosniff, referrer, and permissions headers. The
revision check also requires `release.json` to be served with `Cache-Control:
no-store` and its HTML/assets to match an independently built copy of the
same clean commit. Run it as described in `RELEASE.md` and complete
the authenticated replay check below.

## Session Replay

`src/main.tsx` installs `installReplayGuard()` before the React app mounts. The guard removes and blocks known Lovable/rrweb replay scripts whose `src` or replay data attributes contain `/__l5e/` or `rrweb`. `index.html` also loads `/security/replay-guard.js` as a defense-in-depth path for hosts that serve Vite `public/` assets directly.

This is a repo-level defense-in-depth control. Production closure still requires browser verification on the deployed authenticated app:

1. Sign in.
2. Open an authenticated route with tenant or payment data.
3. Confirm no `script[data-replay]`, `/__l5e/`, or `rrweb-record` script is present.
4. Confirm `window.__RENTFLOW_REPLAY_GUARD__ === true`.
