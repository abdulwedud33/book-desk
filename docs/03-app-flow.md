# 03. App Flow

**Product:** Book Desk (working title). **Status:** Draft v0.1.
**Reads with:** `01-prd.md`, `04-ui-ux-design-brief.md`, `02-technical-requirements.md` (status machine, slot engine).

---

## 1. Screen map

```
Public (no login, tiny bundle)
  /b/<slug>                 Booking page: service -> time -> details -> confirmation
  /m/<token>                Manage my booking: view, reschedule, cancel, add to calendar

Business app
  /auth                     Sign in / create account
  /join                     Join with an invite code
  /onboarding               Business type -> business and link -> first service and hours (3 fixed steps)
  /                         Today (agenda and next up)                   [owner, reception, provider]
  /calendar                 Day / week calendar                           [owner, reception; provider own]
  /new                      New booking (phone, walk-in)                  [owner, reception, provider own]
  /booking?id=              Booking detail and timeline                   [owner, reception, provider own]
  /reminders                Reminders to send                             [owner, reception]
  /customers                Customers, history, no-shows                  [owner, reception]
  /services                 Services, providers, hours, time off, rules   [owner; reception read]
  /reports                  Today and period reports                      [owner]
  /more                     Share link and QR, team, settings, assistant memory, sync, language, sign out
```

Bottom navigation by role (max 5, Miller):

| Role | Items |
|------|-------|
| Owner | Today, Calendar, New (center), Reminders, More |
| Reception | Today, Calendar, New (center), Reminders, More |
| Provider | My day, My calendar, New (center), More |

## 2. Onboarding (fixed layout: nothing moves between steps)

Progress bar and Back/Next bar stay in the same place on every step; the content area scrolls; space is reserved for validation messages.

| Step | Content | Smart defaults |
|------|---------|----------------|
| 1. Your business | Business type, business name, language | Language from the phone; type preselected |
| 2. Your link and your first service | Booking link (suggested from the name, availability checked live), first service (name and duration prefilled for the type), weekly hours template | Typical hours for the type (for example Mon to Sat, 8:00 to 18:00), 30-minute duration, 15-minute slot grid |
| 3. Ready | Summary with the booking link, QR and "Share your link", plus "Add more services" | The share sheet opens with the link and a short message in the chosen language |

Goal gradient: the progress bar fills to 100% and the finish is the link ready to share (the real payoff). Reciprocity: the business gets a working booking page before it has been asked to configure anything else. If offline during step 2, the app explains that the link needs a connection, keeps entries on the phone and retries.

## 3. Customer booking flow (public page)

Four steps; the action bar and progress stay fixed; the chosen language and the Ethiopian-time toggle stay in the header.

1. **Service.** Cards with name, duration and price. If the business has one service, this step is skipped. A "Next available" line appears under each service (value first).
2. **Time.** Provider selector (default "Any available"), date strip with a small availability ribbon per day, time chips grouped Morning, Afternoon, Evening. Selecting a chip highlights it and moves to step 3 on Next. If a day is full, the strip suggests the next day with times.
3. **Details.** Name and phone (honeypot hidden), a one-line note that the number is used only for this booking. Summary of the choice stays visible above the form.
4. **Confirmation.** Date and time in clear words ("Saturday 24 Oct, 3:30 in the afternoon (9:30 Ethiopian time)"), service, provider, price, location or instructions, **Add to calendar**, **Share**, **Manage booking**. In approval mode the page says the business will confirm and shows status "Waiting for confirmation".

Edge states:
- **Slot taken** at confirm: "Someone just booked that time. Here are the closest free times." Entered details are kept.
- **Too soon / too far / outside hours** (stale page): friendly message and refreshed times.
- **Limit reached** (too many active bookings for this phone): "You already have 3 upcoming appointments with us. Please manage one first."
- **Blocked or rate limited**: calm message with a way to contact the business; no technical detail.
- **Offline**: "You're offline. Reconnect to finish booking." Selections are kept.
- **Business not accepting online bookings**: shows contact info.

## 4. Manage booking page

Opened from the manage link. Shows service, time, provider, status. Actions: **Reschedule** (re-uses the time picker with the same service), **Cancel** (asks for confirmation; reason optional), **Add to calendar**. After the cutoff the actions are replaced with how to contact the business. Unknown or expired links show a calm generic message.

## 5. Staff flows

### 5.1 Today
List of today's bookings by time with status chips; the next booking is highlighted. Gaps are shown as quiet "free" rows (tap to add a booking). Banner for pending requests (approval mode) and overdue reminders. Primary action on a booking row: the next status (Arrived, Start, Done).

### 5.2 New booking (phone or walk-in), target under 20 seconds
1. Tap center **New**. Choose service (recent first). Provider defaults to "Any" (or the logged-in provider).
2. **Walk-in** button: books the earliest free time from now. Otherwise pick a day and a time chip.
3. Enter or search the customer by phone or name (regulars suggested). Notes optional.
4. **Create**. The booking appears at once, marked "Not confirmed yet" until the server confirms (usually instant).

### 5.3 Calendar
- Phone: day agenda with a provider switcher; week as a compact grid.
- Tablet: provider columns side by side with a time axis; tap a free slot to add; "Move" sheet to reschedule (drag and drop in v1.1).
- Time off and breaks are drawn as muted blocks; bookings use provider colors with status icons.
- Realtime: new bookings slide in with a brief highlight.

### 5.4 Booking detail
Status stepper, details, customer (name, phone, call button), notes, price, timeline. Actions: Move, Cancel (reason), mark status, send message draft, no-show.

### 5.5 Reminders to send
Today's and tomorrow's tasks: customer, time, prepared message in the customer's language; one-tap **Share** (opens the share sheet) or **Copy**; **Mark done**. Overdue tasks show a red band with how late. Filter by task type.

### 5.6 Setup (Services)
- Services: list with quick add (name, duration), edit price, buffer, description, active.
- Providers: add person, color, services offered.
- Hours: weekly editor per provider with split shifts and "Copy to weekdays".
- Time off: pick dates, provider or whole business; shows affected bookings to resolve.
- Rules: slot interval, lead time, horizon, cancel cutoff, confirmation mode, maximum active bookings per phone, time display.

### 5.7 Customers
Search by name or phone; history, no-show count, notes; owner can require approval for a customer, block a phone, export or delete data.

### 5.8 Assistant (optional)
- **Quick Entry:** paste a chat message ("Tomorrow afternoon haircut with Samson, I'm Abel, 09...") and get a draft with real available times to pick from; ambiguous times ("3 o'clock") trigger a question.
- **Message drafts:** on a booking, **Write message** for confirmation, reminder, reschedule or no-show follow-up.
- **Insights (owner):** utilisation, no-show patterns, suggested hours.

## 6. Permissions by role

| Action | Owner | Reception | Provider | Customer (link) |
|--------|:-----:|:---------:|:--------:|:----------------:|
| See all bookings | Yes | Yes | Own only | Own booking only |
| Create, move, cancel bookings | Yes | Yes | Own | Move or cancel own before cutoff |
| Set status (arrived, in service, done, no-show) | Yes | Yes | Own | No |
| See customer phone | Yes | Yes | For own bookings | Own |
| Edit services, providers, hours, rules | Yes | Read | No | No |
| Own time off | Yes | Yes | If owner allows | No |
| Reminders list | Yes | Yes | Own bookings' tasks | No |
| Customers (CRM), block, export, delete | Yes | View, notes | No | No |
| Reports | Yes | No | Own numbers | No |
| Team and settings | Yes | No | No | No |
| Assistant | Yes | Yes | No | No |

The UI hides what a role cannot do; the database enforces it regardless.

## 7. Loading, empty, offline and error states

**No spinners.** Where the layout is known, a skeleton with the same shapes and spacing appears.

| Screen | Loading skeleton | Empty state | Offline | Error |
|--------|------------------|-------------|---------|-------|
| Booking page, service step | Service card skeletons (same card height) | "This business isn't taking online bookings right now" + contact | "You're offline" with kept choices | Friendly retry |
| Booking page, time step | Date strip plus chip grid skeleton (same chip size) | "No free times in the next 30 days. Try another provider or call us." | Kept choices | Friendly retry |
| Today | Row skeletons with real row height | "No bookings today. Share your link to get some." + Share | Last cached agenda with a banner | "Couldn't refresh. Showing the last saved agenda." |
| Calendar | Grid skeleton with time axis | Empty grid with a hint | Cached calendar | Same as Today |
| Booking detail | Header and timeline skeleton | n/a | Works from cache | Friendly message |
| Reminders | Row skeletons | "Nothing to send. You're all caught up." | Cached list | Friendly retry |
| Reports | Stat card skeletons | "No bookings in this period" | Last cached numbers | Friendly retry |

Feedback rules: every button responds within 100 ms; staff actions update the screen first and reconcile; long actions show progress text inside the button's footprint without resizing; toasts name the action ("Booking moved to 4:00") with Undo where possible; conflict messages are plain and offer the next step.

## 8. State diagram (booking status, simplified)

```
 (approval mode) pending -> confirmed -> arrived -> in_service -> completed
                    \          |  \          \
                     \         |   +----------+--> cancelled
                      +--> cancelled (declined)   +--> no_show   (from confirmed)
```

## 9. Notifications and alerts (v1)

New public booking or request: sound and vibration while the app is open, badge on Today. Overdue reminders: red band and badge on Reminders. Web push when closed: v1.1.

## 10. Language and formats

All text through message catalogs (English, Amharic, Afaan Oromo). Times always include a morning, afternoon or evening word; Ethiopian-time display optional per business and per customer. Money in ETB. Weekday and month names localized.
