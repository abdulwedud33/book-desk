---
version: alpha
name: Book Desk
description: A warm, effortless booking page for customers and a calm, dense calendar for staff. One filled element per screen; time is always unambiguous.
colors:
  ink: "#1A1B25"
  paper: "#F5F6F9"
  surface: "#FFFFFF"
  line: "#DEE1E8"
  slate: "#5C6370"
  plum: "#6A3FA0"
  on-plum: "#FFFFFF"
  st-confirmed: "#0F7B5F"
  st-pending: "#E0A030"
  st-pending-text: "#8A5600"
  st-active: "#1D5FD1"
  st-noshow: "#B3402F"
  dark:
    ink: "#ECEDF3"
    paper: "#0F1117"
    surface: "#181B24"
    line: "#2A2F3B"
    slate: "#9CA3B2"
    plum: "#B79CF0"
    on-plum: "#14091F"
    st-confirmed: "#3DBE97"
    st-pending: "#E0A030"
    st-pending-text: "#E0A030"
    st-active: "#6FA2FF"
    st-noshow: "#F08070"
typography:
  heading:
    fontFamily: "Fraunces"
    fontWeight: 600
    letterSpacing: "-0.01em"
    lineHeight: 1.15
  body:
    fontFamily: "Public Sans"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  time: { fontFamily: "Public Sans", fontWeight: 600, fontFeature: "tabular-nums" }
  scale: [12, 14, 16, 20, 24, 32]
rounded:
  control: 8px
  card: 12px
  sheet: 20px
spacing:
  unit: 4px
  steps: [4, 8, 12, 16, 24, 32]
components:
  button-primary:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.on-plum}"
    rounded: "{rounded.control}"
    height: 52px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.control}"
    height: 48px
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.st-noshow}"
    borderColor: "{colors.st-noshow}"
    rounded: "{rounded.control}"
    height: 48px
  time-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.control}"
    height: 48px
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.control}"
    height: 48px
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
---

# Book Desk design system

Read this before building or changing any screen. It is written for people and for coding agents. Behaviour rules (loading, feedback, errors, laws, psychology) live in `04-ui-ux-design-brief.md`; this file holds the visual system. Update both together.

## Overview

**Two surfaces, one system.** The **booking page** is for customers on any phone, possibly slow and small: warm, unhurried, effortless. The **staff app** is for a busy desk: calm, dense, glanceable.

**Job:** customers pick a time and book in under a minute; staff see the day at a glance and never double-book.

**Feeling:** friendly clarity. Quiet surfaces, one confident accent, time always stated in plain words.

**Memorable element (one place only): the day ribbon.** A thin bar under each date in the date strip showing how full that day is (more filled means fewer free times). It informs customers which days are easy and shows true scarcity; staff see it on the week view. It is the only decorative-looking element and it carries real data.

**Taste dials:**

| Dial | Booking page | Staff app | Meaning |
|------|--------------|-----------|---------|
| DESIGN_VARIANCE | 3 / 10 | 3 / 10 | Familiar booking and calendar patterns (Jakob's Law) |
| MOTION_INTENSITY | 2 / 10 | 2 / 10 | Motion answers input only: press, chip select, sheet open, a new booking sliding in |
| VISUAL_DENSITY | 3 / 10 | 7 / 10 | Airy for customers; compact for the calendar |

**Layout:** booking page is a single column, maximum 480 px, centered on wide screens, with a slim header, progress dots, content, and a fixed bottom action bar. The staff app is mobile-first with bottom navigation; tablets show provider columns. Primary actions sit in the bottom 40% of the screen.

**Spacing:** 4 px base; steps 4, 8, 12, 16, 24, 32. Gutter 16. Related items 8, groups 16, sections 24 or 32.

**Voice:** short and warm for customers; plain counter words for staff. Sentence case. Specific buttons ("Confirm booking"). Every time has a part-of-day word.

**Design sources applied:** Awesome DESIGN.md / Google Stitch format (this file), impeccable (six fixed sections, anti-generic rules), Taste Skill (dials and restraint), Web Interface Guidelines (review step), UI UX Pro Max (palette, pairing and booking-pattern checks). See `04-ui-ux-design-brief.md` section 2.

## Colors

Cool, lightly violet-tinted neutrals (not cream), one confident accent (`plum`), and status colors that each mean one thing.

| Token | Light | Role |
|-------|-------|------|
| `ink` | `#1A1B25` | Text |
| `paper` | `#F5F6F9` | Page background |
| `surface` | `#FFFFFF` | Cards, sheets, inputs |
| `line` | `#DEE1E8` | Dividers, borders |
| `slate` | `#5C6370` | Secondary text |
| `plum` | `#6A3FA0` | Primary action, selected time (about 7:1 with white) |
| `st-confirmed` | `#0F7B5F` | Confirmed |
| `st-pending` / `st-pending-text` | `#E0A030` / `#8A5600` | Pending: fills and icons / small text |
| `st-active` | `#1D5FD1` | Arrived, in service |
| `st-noshow` | `#B3402F` | No-show, errors, destructive |

**Rules**

1. One filled `plum` element per screen: the primary action or the selected time. Everything else is outline or neutral.
2. `st-noshow` red is reserved for no-shows and errors so it stands out (Von Restorff).
3. Color is never the only signal: every status has an icon and a word; the day ribbon has a text alternative.
4. Contrast: text 4.5:1, UI components and large text 3:1. `st-pending` (`#E0A030`) is for fills and icons only; use `st-pending-text` for text.
5. Dark mode uses the same hues with lighter values (front matter); contrast is checked in CI for both schemes.
6. Provider colors for calendar columns come from a fixed accessible set of 8 hues and are always paired with the provider's initials.
7. No gradient washes as decoration.

## Typography

- **Headings and hero times:** Fraunces, weight 600, slight negative tracking. Used for page and section headings and the confirmation title only.
- **Body, UI and all numbers:** Public Sans, weights 400, 500, 600, with `font-variant-numeric: tabular-nums` for every time, date and price. (Fraunces is never used for numbers, because its default numerals are old-style.)
- **Scale (px):** 12 metadata, 14 secondary, 16 body and inputs (minimum), 20, 24, 32. Line height 1.4 body, 1.15 headings.
- **Fonts are self-hosted**, subset, `font-display: swap`, with metric-matched fallbacks to avoid layout shift. The booking page loads one heading weight and two body weights only. Noto Sans Ethiopic is bundled for Amharic; Latin fonts cover Afaan Oromo. Ge'ez text is set about 1 px larger with more line height.
- **Avoid:** all-caps labels, an accent on one word of a headline, monospace for small labels.

## Elevation

Flat first. Hierarchy comes from spacing, size and weight, then borders, then shadow.

| Level | Use | Treatment |
|-------|-----|-----------|
| 0 | Page | `paper`, no border |
| 1 | Cards, chips, rows, inputs | `surface`, 1 px `line` border, no shadow |
| 2 | Fixed action bar, bottom navigation | `surface`, top border, very soft upward shadow |
| 3 | Sheets and dialogs | `surface`, 20 px top radius, scrim, soft shadow |

**Shape:** radius differs by hierarchy: 8 px controls and chips, 12 px cards, 20 px sheets. Pills only for status chips. Touch targets at least 48 px with 8 px gaps (the booking page primary button is 52 px).

**Motion:** 120 to 180 ms ease-out, only in response to input. The selected chip fills; the action bar button changes label without moving; a new booking slides into the calendar with a brief highlight. Respect `prefers-reduced-motion` (replace movement with an instant change). No scroll-triggered or hover-only effects.

## Components

All components define default, pressed, focused, disabled, loading (skeleton) and error states. Reuse; do not fork.

**Date strip.** Horizontally scrollable days: weekday, date number, and the **day ribbon** (a 4 px bar, filled proportion = how full the day is, `slate` at low emphasis; today has a small dot; closed days show a dash). Selected day is outlined in `plum`. Days with no free times are shown muted and not selectable.

**Time chip.** 48 px high, minimum 76 px wide, tabular time ("3:30"), with the part-of-day label on the group heading ("Afternoon"), not on every chip. Selected: filled `plum` with white text. Unavailable times are not rendered. Optional second line with Ethiopian time when the toggle is on.

**Service card.** Name (16/600), duration and price (14 slate), "Next available" line (14, `st-confirmed` text with icon). One tap selects and continues.

**Provider selector.** "Any available" first (default), then providers with initials in their color. Single choice.

**Fixed action bar.** Bottom, `surface`, one primary button full width (52 px). Same position on every step; label changes (Continue, Confirm booking). Progress dots above the content, not in the bar.

**Buttons.** Primary (`plum` fill, one per screen), secondary (bordered), danger (bordered `st-noshow`, separated from other actions). Specific verb labels. Pressed state within 100 ms. While confirming, the label becomes "Booking..." at the same size.

**Inputs.** Visible label above (never placeholder only), 16 px text, correct mobile keyboard (phone number pad), reserved message line so layout never jumps. Honeypot field is hidden from view and assistive tech.

**Booking card (staff).** Provider-colored left edge (4 px), time (tabular, 16/600) and customer name, service and provider (14 slate), status chip (icon plus word), and one primary next-status button (Arrived, Start, Done). More menu for Move, Cancel, No-show, Message.

**Calendar grid.** Time axis, provider columns, muted blocks for breaks and time off, a "now" line, gaps shown with a faint "Add" affordance on tap. Phone: single provider day with switcher.

**Status chip.** Icon plus word; color by status; pill shape.

**Slot-taken sheet.** A calm message and up to 5 alternative chips; entered details preserved.

**Reminder row.** Customer, time, message preview (2 lines), Share, Copy, Mark done; overdue band in `st-noshow` with minutes late.

**Skeleton loaders (whole app and booking page).** No spinners. Where the shape is known, show a skeleton with the same chip grid, card height or row height as the real screen so nothing shifts. Low-contrast shimmer; static under reduced motion.

**Toasts.** Verb plus object ("Booking moved to 4:00 in the afternoon"), Undo where possible, announced to screen readers; never contain codes.

**Banners.** Offline, pending requests, sync problems that need action; quiet unless action is needed.

**Onboarding and booking steps.** Fixed layout: progress area and action bar never move, resize, appear or disappear between steps; keyboard-safe; reserved message space.

**Empty states.** One sentence and one clear action ("Share your link").

## Do's and Don'ts

**Do**

- Show real free times before asking for details; default to "Any available".
- Keep exactly one primary action per screen, in the thumb zone.
- State every time with a part-of-day word; offer Ethiopian time as an addition.
- Update staff screens first and reconcile after (optimistic), then confirm or roll back clearly.
- Use real numbers for scarcity ("2 times left today") and never invent them.
- Group related things (summary with its edit link, customer with phone); chunk times into morning, afternoon, evening.
- Use the same word for the same action everywhere.
- Test with 200% text, light and dark, offline, three languages, keyboard and screen reader.
- Run the Web Interface Guidelines review and an accessibility audit at the end of each UI milestone.

**Don't**

- Don't use spinning loaders where a layout-matched skeleton is possible.
- Don't show backend errors: no codes, SQL, stack traces, "500" or raw JSON.
- Don't move buttons or progress during onboarding or booking steps.
- Don't render unavailable times as greyed chips; omit them.
- Don't rely on color alone, hover-only information or tiny touch targets.
- Don't use identical soft-shadow cards everywhere, gradient washes, numbered labels without a real sequence, cream-and-terracotta or black-and-neon defaults, decorative illustrations or stock photos.
- Don't use fake urgency, countdown timers or guilt copy.
- Don't ask for more than name and phone on the booking page.
- Don't invent one-off components, colors or spacing; extend the tokens here first.
