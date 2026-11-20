# Decisions Log

Record any intentional deviations or resolutions of ambiguous specifications here.

Format:
- **Date**: YYYY-MM-DD
- **Decision**: What was decided
- **Context / Rationale**: Why this choice was made (safer option, tradeoff considerations)

---

### 2026-11-20: M0 Pilot Defaults & Core Assumptions Confirmation
- **Date**: 2026-11-20
- **Decision**: Confirmed defaults for PRD Section 11 open questions:
  1. First pilot business type: **Barber or salon** (`salon`). Preload sample services and standard hours accordingly.
  2. Primary booking channels: **Phone call and Telegram** (manual link/QR distribution).
  3. Ethiopian-time display: **Optional per business and per customer**, off by default. Always an addition to unambiguous morning/afternoon/evening wording, never a replacement.
  4. Provider authentication: **Providers do not log in unless invited** by the business owner.
  5. Cancellation cutoff: **2 hours** prior to appointment start by default.
  6. Reminders in v1: **Prepared messages** in a "Reminders to send" list for staff to share/copy in one tap; automatic Telegram scheduled for v1.1.
- **Context / Rationale**: Aligns with Section 6 & 11 in `docs/01-prd.md` and keeps v1 operations lean, reliable, and friction-free without external messaging provider dependencies.

### 2026-11-20: M10 Migration Numbering (0010)
- **Date**: 2026-11-20
- **Decision**: Numbered the assistant, memory, and AI usage migration as `0010_assistant_and_ai.sql`.
- **Context / Rationale**: Milestone M9 created `0009_reporting_and_analytics.sql`. To maintain strict sequential integrity in Supabase migrations, Milestone M10 uses prefix `0010`.
