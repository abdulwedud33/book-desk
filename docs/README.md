# Book Desk (working title): planning package

Project 3 of 3 (General Projects): appointment booking for salons, barbers, clinics, tutors, garages and similar businesses. Planning only. **No code is written until the owner says "start building".**

## What it is

A customer books in under a minute from a link, with no account and no app. The business gets a live calendar that cannot be double-booked, prepared reminders, and simple reports.

## Files

| File | Purpose |
|------|---------|
| `01-prd.md` | Product requirements: problem, users, goals, scope, requirements with acceptance criteria, metrics, risks |
| `02-technical-requirements.md` | Architecture, stack, flows, slot engine, status machine, time handling, speed rules, testing |
| `03-app-flow.md` | Screens, customer and staff flows, onboarding, states, permissions |
| `04-ui-ux-design-brief.md` | Look and behaviour: laws, psychology, standing UX rules, components |
| `DESIGN.md` | Machine-readable design system (tokens plus prose) |
| `05-backend-schema.md` | Tables, exclusion constraint, RLS matrix, RPC and public functions, invariants |
| `06-implementation-plan.md` | Milestones M0 to M11, definition of done, risks |
| `agents.md` | Staff assistant (part A) and coding-agent instructions (part B) |
| `tools.md` | Allow-listed assistant tools |
| `memory.md` | What the assistant may and may not remember |
| `evals.md` | Property tests, concurrency tests, assistant evals, budgets |
| `guardrails.md` | Input, injection, output, public-booking, privacy and ethical limits |
| `prompts.md` | Versioned prompts and schemas |
| `security.md` | Security baseline and launch checklist |

Suggested reading order: `01`, `02`, `05`, `security.md`, `03`, `04`, `DESIGN.md`, `06`.

## Assumptions to confirm

1. Business app is an installable PWA; the booking page is a separate tiny static page; both on static hosting with Supabase behind.
2. Customers have no accounts; each booking has a private manage link.
3. Instant confirmation by default; approval mode available.
4. v1 reminders are prepared messages that staff share in one tap; automatic Telegram reminders and deposits are v1.1.
5. ETB, English, Amharic and Afaan Oromo; times always include a part-of-day word; optional Ethiopian-time display.
6. Roles: owner, reception, provider (providers need no login unless invited).
7. No public AI chatbot in v1; the assistant is staff-side only.

Open questions are in `01-prd.md` section 11.

## Where each standing requirement lives

| Requirement | Files |
|-------------|-------|
| No secrets in frontend or app | `security.md` s3, `02` s7, `guardrails.md` s10 |
| Users access only authorized data | `security.md` s4-5 and s9, `05` (matrix), `tools.md` |
| Backend and DB rules enforced | `security.md` s5-6, `05` (exclusion constraint), `06` DoD |
| User and AI input validated | `security.md` s6, `guardrails.md` s2, s4 and s7 |
| Five UX laws (Jakob, Hick, Proximity, Miller, Von Restorff) | `04` s5, `DESIGN.md` |
| Skeleton loaders, no spinners | `04` s7, `DESIGN.md` Components, `03` s7 |
| Instant feedback, optimistic rendering | `04` s7, `02` s6 |
| No moving buttons in onboarding (and booking steps) | `03` s2-3, `04` s7, `DESIGN.md` |
| No backend errors shown | `security.md` s8, `guardrails.md` s9, `04` s7 |
| UX psychology (defaults, goal gradient, reciprocity, endowment, loss aversion) | `04` s6, `guardrails.md` s11 |
| Simplicity, consistency, visual hierarchy | `04` s7, `DESIGN.md` |
| Speed rules (compressed JSON, sane DB writes, no single bottleneck, optimistic, static hosting) | `02` s6 |
| RLS on every table with policies | `security.md` s5, `05` |
| Rate limiting on all APIs | `security.md` s7, `guardrails.md` s6 |

## Design sources

Awesome DESIGN.md (format), impeccable (structure and anti-generic rules), Taste Skill (dials), Web Interface Guidelines (review step), UI UX Pro Max (palette and pattern checks). Principles are applied in `DESIGN.md` and `04`; no files were copied. Install notes for coding agents are in `agents.md` part B.
