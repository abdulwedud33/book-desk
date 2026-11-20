# 04. UI/UX Design Brief

**Product:** Book Desk (working title). **Status:** Draft v0.1.
**Companion:** `DESIGN.md` (machine-readable tokens and component rules). Keep both in sync.

---

## 1. Design intent

Two surfaces with two moods, one system.

- **Booking page (customers):** warm, unhurried, effortless. A first-time visitor on a cheap phone should feel "this is easy" within seconds. Large targets, few choices per screen, no jargon, no account.
- **Business app (staff):** calm and dense. A reception desk glances at it between customers; it must show the day at a glance and never lose a booking.

**Memorable element (one only): the day ribbon.** Under every date in the date strip sits a thin ribbon showing how full that day is (a soft bar, more filled means fewer free times). For customers it answers "which day is easy?" at a glance and, with real numbers, gently shows scarcity ("2 times left today"). For staff the same ribbon appears on the week view. It is the only decorative-looking element, and it is pure information.

**What it is not:** a generic grid of rounded cards, a gradient hero, stock photography of smiling people, or a dark neon "booking widget".

## 2. Design sources and how they are applied

| Source | What it is | How it is applied here |
|--------|------------|------------------------|
| Awesome DESIGN.md (VoltAgent collection, based on Google Stitch's format) | Plain-text design systems that coding agents read | `DESIGN.md` at the repo root with YAML tokens plus prose |
| impeccable | Design skill with a six-section DESIGN.md (Overview, Colors, Typography, Elevation, Components, Do's and Don'ts) and anti-generic rules | Same six sections; consistent spacing; no decoration without a job |
| Taste Skill | Anti-"AI slop" frontend skill with three dials (variance, motion, density) | Dials: variance 3, motion 2, density 3 on the booking page and 7 in the staff calendar; restraint and one memorable move |
| Web Interface Guidelines (Vercel) | Review rules for accessibility, forms, focus, animation, performance | Run at the end of every UI milestone, especially for the booking page |
| UI UX Pro Max | Searchable design intelligence (styles, palettes, font pairings, UX guidelines by product type) | Used to check palette contrast, font pairing, and calendar and booking-flow patterns |
| Also used | WCAG 2.2 AA, platform date and time picker guidance, calendar conventions | Sections 5, 9, 10 |

How coding agents use these is in `agents.md` part B. The skills are checks, not a template.

## 3. Design tokens (summary; full list in `DESIGN.md`)

| Token | Light | Role |
|-------|-------|------|
| `ink` | `#1A1B25` | Text |
| `paper` | `#F5F6F9` | Page background |
| `surface` | `#FFFFFF` | Cards, sheets, inputs |
| `line` | `#DEE1E8` | Dividers, borders |
| `slate` | `#5C6370` | Secondary text |
| `plum` | `#6A3FA0` | Primary action and selected time (one filled element per screen) |
| `st-confirmed` | `#0F7B5F` | Confirmed |
| `st-pending` | `#8A5600` text, `#E0A030` fill | Pending |
| `st-active` | `#1D5FD1` | Arrived, in service |
| `st-noshow` | `#B3402F` | No-show, errors, destructive |

Status colors always come with an icon and a word. Dark mode keeps the hues with lighter values.

Type: headings Fraunces (600) for warmth; body Public Sans; tabular numerals for all times and prices; Noto Sans Ethiopic fallback for Amharic. Scale 12, 14, 16, 20, 24, 32. Spacing base 4. Radius 8 (controls), 12 (cards), 20 (sheets).

## 4. Layout and hierarchy

- **Booking page:** single column, maximum width 480 px centered on large screens; a slim header (business name, language, time display); a fixed bottom action bar with one primary button; progress dots "Step 2 of 4" above the content.
- **Time step hierarchy:** summary chip (service and provider) first, then date strip with ribbons, then time chips by part of day, then the primary button.
- **Staff Today:** next booking at the top, then the timeline of the day; gaps shown quietly.
- **Staff calendar:** tablet shows provider columns; phone shows one provider's day with a switcher.
- **Booking card hierarchy:** time and customer name first, service and provider second, status chip third.

## 5. The five UX laws (applied where useful)

| Law | Rule in this product |
|-----|----------------------|
| Jakob's Law (written "Kabob's law" in the request) | Use familiar patterns: date strip and time chips like other booking tools, standard calendar day and week views, the phone's share sheet, `tel:` links, native-feeling inputs, add-to-calendar files |
| Hick's Law | One decision per step on the booking page (service, then time, then details); provider choice defaults to "Any available"; staff booking rows show one primary action |
| Proximity | Group the date strip with its time chips, summary with its edit link, customer name with phone; larger gaps between groups than within |
| Miller's Law | At most 5 bottom tabs; time chips grouped into Morning, Afternoon, Evening so no group has more than about 9 chips visible before "more"; booking steps limited to 4 |
| Von Restorff | The only filled plum element is the primary action or the selected time; the only red on screens is a no-show or an error; the "Next available" chip is the one highlighted shortcut |

(Fitts's Law is also used: primary actions are large and at the bottom within thumb reach.)

## 6. UX psychology (used honestly)

| Pattern | Where | Guardrail |
|---------|-------|-----------|
| Smart defaults | "Any available" provider; earliest next available time preselected as a suggestion (not auto-confirmed); typical hours and service lengths by business type; last-used service for staff; Ethiopian-time toggle remembered | Defaults never hide costs or share data |
| Goal gradient | Booking progress dots and a filled bar; business onboarding bar that ends in a ready-to-share link; a "setup complete" ring (services, hours, link shared) | Progress reflects real state only |
| Reciprocity | Show real free times before asking for any details; give the business a working booking page before asking for configuration; free add-to-calendar and reminders | No gating of basic features behind actions |
| Endowment effect | After booking, "Your appointment" is a keepsake: calendar file, manage link, a clear summary the customer can hold on to; for businesses, "Your customers" and "Your link" are shown as their assets with easy export | Never lock data in; deletion and export are easy |
| Loss aversion | Real numbers: "2 times left today", "Tomorrow is almost full", for staff "3 reminders overdue", "4 empty slots tomorrow afternoon" | Never invent scarcity; show only true counts; no countdown timers |

## 7. Standing UX rules (apply across the whole app and the booking page)

1. **No spinners.** When the shape of content is known, show a skeleton matching the real layout (same chip size and grid for times, same card height for services, same row height for bookings). A small inline progress hint is allowed only for waits of unknown shape inside a button.
2. **Instant feedback.** Every button shows a pressed state within 100 ms. Staff actions update the screen first and reconcile after. On the booking page, selections respond instantly; only the final Confirm waits for the server, and its button shows progress text without changing size.
3. **No moving buttons in onboarding or booking steps.** The progress area and the action bar are fixed; content scrolls; space for messages is reserved. A visual regression test covers it.
4. **No backend errors.** Never show codes, SQL, stack traces, status numbers or raw JSON. Plain sentence plus next step ("Someone just booked that time. Here are the closest free times.").
5. **Simplicity.** Fewer steps and fields; remove before adding. The booking page asks for a name and a phone number, nothing else.
6. **Consistency.** Same word for the same action across the page, the toast and the timeline; one component per job.
7. **Visual hierarchy.** What the person must decide now is largest; everything else recedes.
8. **Speed is a feature.** Tiny booking bundle, compact slot payloads, optimistic staff actions, no layout shift.

## 8. Key components (behaviour; visuals in `DESIGN.md`)

| Component | Behaviour |
|-----------|-----------|
| Service card | Name, duration, price, "Next available" line; tap selects and continues |
| Provider selector | Segmented list with "Any available" first; avatar initials in the provider's color |
| Date strip | Horizontally scrollable days with weekday, date and the day ribbon; today and full days are visually distinct; arrows for keyboard users |
| Time chip | 48 px high, tabular time with a morning/afternoon/evening group label; selected chip is filled plum; disabled chips are not rendered (not shown greyed) |
| Time display toggle | Gregorian or "also Ethiopian time"; remembered; always keeps the unambiguous word |
| Fixed action bar | One primary button (Continue, Confirm); never moves between steps |
| Booking card (staff) | Time, name, service, provider color edge, status chip, one primary next-status button, more menu |
| Calendar grid | Time axis, provider columns, muted breaks and time off, now-line |
| Slot-taken sheet | Calm message plus up to 5 nearby alternatives |
| Reminder row | Customer, time, prepared message preview, Share, Copy, Mark done; overdue band |
| Skeletons | One per screen, same dimensions as real content |
| Banners | Offline, pending requests, sync problems needing action |
| Toasts | Verb plus object, Undo where possible, announced to screen readers |

## 9. Accessibility

- WCAG 2.2 AA: 4.5:1 text contrast, 3:1 for components; focus always visible; targets at least 48 px with 8 px gaps.
- The date strip and time chips work with a keyboard and screen reader as a radio group with clear labels ("Saturday 24 October, 3 free times").
- Status never by color alone; the ribbon has a text alternative.
- 200% text scaling, reduced motion, light and dark schemes.
- Times are announced with the part of the day.

## 10. Content and tone

- Warm, short, direct. Customer text: "Pick a time", "Your details", "You're booked". Staff text: "Arrived", "Start", "Done", "No-show".
- Sentence case; specific button verbs ("Confirm booking", "Move booking").
- Errors say what happened and what to do in one or two sentences.
- Every time has a part-of-day word; Ethiopian time shown only as an addition.
- Amharic and Afaan Oromo written natively and reviewed by speakers; time and status words checked first.

## 11. Anti-template checklist

Before shipping any screen confirm it does not use: identical rounded cards with the same soft shadow everywhere, gradient wash backgrounds, numbered 01/02/03 labels without a real sequence, an accent on one word of a headline, cream-and-terracotta or black-and-neon default palettes, decorative illustrations or stock photos, a dropdown where chips would be faster, hover-only information.

## 12. Review gates

At the end of each UI milestone: Web Interface Guidelines review, axe pass, keyboard and screen reader pass on booking and staff critical flows, throttled-network performance check, three-language and Ethiopian-time check.
