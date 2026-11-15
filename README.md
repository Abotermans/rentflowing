# OneRent

OneRent is a property-management application for Belgian and European rental
portfolios. The frontend uses React, TypeScript, Vite, and Supabase/Lovable Cloud.

## Local development

Use Node.js 20 and npm. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` for the intended backend, then:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 8082
```

The publishable key is a browser credential, not an administrator/service-role
secret. Never put service-role credentials in a `VITE_` variable.

## Verification

```sh
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run test -- --run
npm run build
git diff --check
```

The same code checks run in GitHub Actions. See [RELEASE.md](RELEASE.md) for
the additional database, security, recovery, and real-user checks required
before accepting production data. See [QA_SCENARIOS.md](QA_SCENARIOS.md) for
the current workflow test record and [SECURITY.md](SECURITY.md) for host
requirements.
