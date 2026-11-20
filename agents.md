# Book Desk: standing instructions

Spec: /docs (read README.md first). The docs win over assumptions. Record any deviation in
DECISIONS.md with a reason. Work one milestone at a time (docs/06-implementation-plan.md).

Always:
- Security first: no secrets in either bundle; RLS on every table with policies in the same
  migration; anon has no table privileges; public data only via Edge Functions calling
  public_* functions; validate all input on client and server; rate limit every endpoint
  (public included); never show backend errors to users.
- The database decides: overlaps are impossible via the exclusion constraint; bookings are
  created or moved only in book_slot through RPCs (security definer, search_path = '', role
  check, idempotent, coded errors). Append-only events.
- Time: UTC instants, business time zone from the database, tested helpers only; times
  always with a morning/afternoon/evening word; Ethiopian time only as an addition.
- Slot engine: SQL is authoritative; TypeScript copy must pass the parity and property tests.
- Staff app local first and optimistic. Skeleton loaders, never spinners. Fixed-layout
  onboarding and booking steps.
- UI follows docs/DESIGN.md and docs/04-ui-ux-design-brief.md; all text via catalogs (en, am,
  om). Booking page asks only name and phone. Providers see only their own bookings.
- Assistant: staff-side drafts only; redact phones before model calls; times only from
  find_slots; ask when a clock time is ambiguous; never send or save by itself.
- Run typecheck, tests, pgTAP, build and bundle scans before saying anything is done. Report
  what was verified and what was not.
- Ask before: needing secrets/accounts, deleting data, rewriting history, touching files
  outside the workspace.
