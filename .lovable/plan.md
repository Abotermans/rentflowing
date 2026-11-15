# Finding: no secure copy path from the Edge secret to Vault

Read-only check. Nothing was changed.

## Result
None of my platform tools can copy SCHEDULED_JOB_SECRET from the Edge secrets store into Vault without exposing the value.

- Secrets tools (fetch / set / generate / delete): fetch only lists names. set and generate only write to the Edge secrets store and never to Vault. None of them read a value or move it anywhere.
- SQL tools (run_sql / read_query / migrations): calling `vault.create_secret` needs the value written into the SQL text. That puts it in my context and in query history. Not acceptable.
- `rebind_secrets` with `cron_auth`: sets up the platform's own managed scheduling credential, with its own generated value. It does not copy SCHEDULED_JOB_SECRET, so it would not match what the functions check.
- The only way left is a function that reads its env and writes to Vault. That is exactly the bootstrap endpoint you ruled out.

## Options (pick one; each needs approval)
1. The owner pastes the same value into Vault through a secure entry form. Only possible if the owner re-enters it, which you wanted to avoid.
2. Change the job design: have the two cron jobs use the managed `cron_auth` credential (via `rebind_secrets`), and have the functions accept it. This needs source changes.
3. Rotate: create a new value straight into Vault inside the database, and have the functions read it from Vault rather than from the Edge env. This needs source changes and a rotation.

Nothing will be done until you choose.
