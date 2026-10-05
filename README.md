# MARINA OAS USB Watcher

A read-only terminal watcher for this exact eGovPH MARINA OAS scope:

- Offices: Central Office, DMW Processing Center, and MARINA NCR
- Category: Overseas
- Seafarer type: Others
- Service: Seafarer's Identity Document (SID)
- Service type: New
- Cutoff: December 31, 2026

The old public earliest-date feed is intentionally not used. A phone check showed that its dates did not match the filtered eGov calendar.

## Current verified result

Checked in the authenticated eGovPH calendar on October 3, 2026:

- Central Office: no green/open dates from October through December
- DMW Processing Center: its calendar began in November; no green/open dates in November or December
- MARINA NCR: no green/open dates from October through December

No date was selected and no appointment was booked or held.

## Run the terminal watcher

Requirements:

- Node.js 20 or newer
- `adb`, `ffmpeg`, and `tesseract` commands
- One authorized USB-ADB phone at the calibrated 1220×2712 display layout
- eGovPH opened before enabling Developer Options/USB debugging
- Phone connected, unlocked, and eGovPH left in the foreground

Start continuous checks every five minutes:

```bash
npm run watch
```

Run one complete cycle for testing:

```bash
npm run watch:once
```

Use a different interval, with a minimum of 60 seconds:

```bash
npm run watch -- --interval=300
```

A full three-office pass measured 217 seconds and the wait between passes never drops below
10 seconds, so the fastest a pass can restart is about 227 seconds. `--interval` only
controls that idle wait: values below ~230 change nothing today, and anything outside
60–3600 falls back to 300 rather than being clamped.

Watch one office instead of three — a pass drops to about a minute:

```bash
npm run watch -- --office=marina-ncr
```

Valid ids are `central-office`, `dmw-processing-center`, and `marina-ncr`.

The watcher keeps the phone awake while USB is connected, verifies every screen with OCR, selects the three offices sequentially, checks only through December, and never taps a calendar date. At the first detected opening it immediately alerts, saves evidence and partial status, leaves that calendar visible, and exits without scanning another month or office. Results are written to `data/watcher-status.json`.

Alerts use the terminal bell and `notify-send` when available. Set `WEBHOOK_URL` to send a JSON alert to an optional webhook; the payload is `{ title, message, at }`.

Because the watcher never taps a date, you are the second half of the detection loop. Point `WEBHOOK_URL` at an endpoint that reaches your phone (ntfy, Bark, a Telegram bot relay, and similar) so the gap between *opening found* and *you booking* is seconds rather than minutes.

## How an opening is detected

Every day cell is sampled across its whole area instead of at one pixel, so a day number printed over the fill, anti-aliasing, and small layout shifts cannot hide an opening. A cell must be at least 6% open-green to count; anything between 1.5% and 6% is reported as `ambiguous-cells` rather than silently treated as closed. The predicate accepts the application's own OPEN swatch (`rgb(206, 223, 165)`), verified against a real screenshot.

Two independent checks back that up:

- **Band cross-check.** Green and red totals for the whole calendar band are recorded each month. If the band is green but no day cell resolves, the watcher raises `unexplained-green` instead of reporting a clean month.
- **Grid anchoring (fallback only).** The calibrated grid is the verified primary path: against a real screenshot every sampled box lands on its own cell, and the measured row step is 108 against the calibrated 106.5. As a secondary check the day numbers OCR reads off the screen are fitted to a grid, and cells are sampled from that fit whenever it is accepted. OCR currently reads too few day numbers on this calendar for a trustworthy fit, so `grid` normally reads `calibrated` — it only reads `ocr` when a fit actually succeeds.

Months the calendar refuses to show become `coverage-gap`, announced once and recorded under each office's `warnings` — a month that was never displayed can no longer pass as a clean result. Per-month detail (band totals and every non-zero cell fraction) is written to `diagnostics` in `data/watcher-status.json`, and the detector in use is reported under `detector`.

The capture helper and the watcher now share one predicate and one threshold, so they can no longer disagree about what counts as an opening.

## Validate the detector

A detector that has never fired on a known-positive screenshot cannot tell "no slots" from "broken". Until this is done, every result means *no opening detected*, not *no opening exists* — and `detector.validated` stays `false` in the status file.

1. When you can see a green/open date on the phone, save it: `npm run capture -- --office=marina-ncr --month=2026-11 --confirm-exact-filters`
2. Run `npm run validate` to see what the detector makes of every saved screenshot.
3. If it agrees with your eyes, record it: `npm run validate -- --confirm=data/captures/<file>.png`

That writes `data/detector-validation.json`, after which the watcher reports `detector.validated: true`.

### Session renewal

When MARINA needs a fresh session, the watcher returns through eGovPH Home, reopens MARINA OAS, and scrolls the Terms & Conditions to the agreement button. It pauses and alerts there so you can review and tap **I Agree** yourself; it resumes automatically afterward.

Manual intervention is also required if the phone locks, USB disconnects, eGovPH is killed, authentication expires, or the developer-mode warning returns.

## Optional dashboard

The earlier local dashboard remains available as a status viewer:

```bash
npm start
```

Open <http://127.0.0.1:4173>.

## Record one displayed calendar manually

This optional helper requires `adb`, `ffmpeg`, one authorized Android phone, and eGovPH in the foreground. On the phone, navigate to the desired office/month and visibly confirm **Overseas / Others / SID / New**. Then run:

```bash
npm run capture -- \
  --office=marina-ncr \
  --month=2026-12 \
  --confirm-exact-filters
```

Valid office IDs are `central-office`, `dmw-processing-center`, and `marina-ncr`. Valid months are `2026-10`, `2026-11`, and `2026-12` only. The helper:

1. Confirms one authorized device and eGovPH in the foreground.
2. Captures the displayed screen without tapping it.
3. Rejects screens that do not resemble the MARINA calendar.
4. Detects green/open calendar cells and updates the dashboard.
5. Saves the screenshot under `data/captures/` as evidence.

The explicit confirmation flag is required because the eGov WebView does not expose its selected filters to ADB.

## Why it is device-assisted

The exact calendar endpoint is protected by an authenticated eGov/MARINA WebView session and CSRF token. The production eGov app is not debuggable, and its MARINA session expires after 60 minutes. Extracting private session material or bypassing those protections would be unsafe. As a result, a fresh scan requires an active phone session; the dashboard never substitutes the inaccurate public feed.

This app does not sign in, bypass CAPTCHA, select a date, reserve a slot, submit personal information, or make a payment. It is not affiliated with MARINA, DICT, or eGovPH.

## Test

```bash
npm test
```
