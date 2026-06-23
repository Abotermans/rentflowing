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

Verify production after every host/config change:

```sh
curl -I https://rentflowing.lovable.app
```

Do not close security-header findings until the deployed response includes the required headers.

## Session Replay

`index.html` loads `/security/replay-guard.js` before the React app. The guard removes and blocks known Lovable/rrweb replay scripts whose `src` or replay data attributes contain `/__l5e/` or `rrweb`.

This is a repo-level defense-in-depth control. Production closure still requires browser verification on the deployed authenticated app:

1. Sign in.
2. Open an authenticated route with tenant or payment data.
3. Confirm no `script[data-replay]`, `/__l5e/`, or `rrweb-record` script is present.
4. Confirm `window.__RENTFLOW_REPLAY_GUARD__ === true`.
