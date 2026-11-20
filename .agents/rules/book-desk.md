---
activation: always_on
---

Activation: Always On

1. Treat /docs as the specification; conflicts resolve toward the safer option and are
   logged in DECISIONS.md.
2. Every new table: enable RLS, write policies, revoke default privileges (anon gets nothing),
   index policy columns, add pgTAP tests for anonymous, outsider, owner, reception, provider
   own, provider other.
3. Every new RPC: security definer, set search_path = '', role check, rate_limit_hit,
   argument validation, idempotency key, event row, coded errors.
4. Every public function or Edge Function: strict validation, 4 KB body cap, rate limits per
   IP and subject, minimal output, no personal data, generic answers for unknown ids.
5. Any slot or time logic: property tests, SQL/TypeScript parity, DST fixture, Ethiopian-time
   table tests.
6. Every new screen: layout-matched skeleton, instant pressed feedback, optimistic update with
   rollback (staff app), offline behaviour (staff app), strings in en/am/om, friendly errors
   only, accessibility pass.
7. Never read or write secrets in code. Never log personal data.
8. Finish every task with: Done, Verified (real command results), Not verified, Decisions,
   What I must do, Next.
