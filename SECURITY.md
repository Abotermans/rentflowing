# Security Deployment Requirements

Rent Flow displays tenant, lease, receivable, guarantee, payment, and maintenance data on authenticated routes. Production deployments must not inject session replay into authenticated app pages unless all sensitive fields are masked before capture and the data processor is explicitly approved.

## Required Production Headers

Deploy the headers in `public/_headers` with the static app. Hosts that support `_headers` files, such as Cloudflare Pages and Netlify, should copy this file to the deployment root during `vite build`.

Required controls:

- `Content-Security-Policy` with `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- A restrictive `Permissions-Policy`.

The CSP intentionally avoids `script-src 'self'` for production because Lovable injects replay scripts from same-origin `/__l5e/` paths. Production scripts are restricted to `/assets/` and `/security/` on `https://rentflowing.lovable.app`.

Verify production after every host/config change:

```sh
curl -I https://rentflowing.lovable.app
```

Do not close security-header findings until the deployed response includes the required headers.

## Lovable Hosting Limitation

Lovable's default `*.lovable.app` host currently does not apply this repo's `public/_headers` file as HTTP response headers. It also strips CSP meta tags from the served HTML. For the default Lovable URL, CSP and anti-framing headers must be configured by Lovable itself.

For a production custom domain, use Lovable's advanced "Domain uses Cloudflare or a similar proxy" option, then configure the required security headers at the CDN/reverse proxy layer. Lovable documents this path at `https://docs.lovable.dev/features/custom-domain#advanced-use-a-cdn-or-reverse-proxy`.

## Session Replay

`src/main.tsx` installs `installReplayGuard()` before the React app mounts. The guard removes and blocks known Lovable/rrweb replay scripts whose `src` or replay data attributes contain `/__l5e/` or `rrweb`. `index.html` also loads `/security/replay-guard.js` as a defense-in-depth path for hosts that serve Vite `public/` assets directly.

This is a repo-level defense-in-depth control. Production closure still requires browser verification on the deployed authenticated app:

1. Sign in.
2. Open an authenticated route with tenant or payment data.
3. Confirm no `script[data-replay]`, `/__l5e/`, or `rrweb-record` script is present.
4. Confirm `window.__RENTFLOW_REPLAY_GUARD__ === true`.
