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

Checked in the authenticated eGovPH calendar on October 8, 2026:

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

Start continuous checks every three minutes:

```bash
npm run watch
```

Run one complete cycle for testing:

```bash
npm run watch:once
```

Use a different interval, with a minimum of 35 seconds:

```bash
npm run watch -- --interval=180
```

The watcher waits for verified screen transitions instead of sleeping a fixed number of seconds
after each tap. The wait between passes never drops below 5 seconds; `--interval` is a target
start-to-start interval, so a value shorter than the pass itself runs the next pass 5 seconds
after the previous one finishes. Values outside 35–3600 fall back to 180.

To start the next pass immediately after each completed pass, use `--no-wait`:

```bash
npm run watch -- --office=dmw-processing-center --no-wait
```

The time to finish a pass still determines the effective check frequency. A scan that takes
about 28–30 seconds begins its next scan as soon as it finishes; errors still use the
30-second recovery delay.

For a single-office run, Back leaves the selected office on the form. The watcher now reuses that
office on the next pass, then selects and verifies Overseas / Others / SID / New again. It opens a
fresh MARINA OAS form only when the expected office is missing or cannot be verified.

Watch one office instead of three for the shortest possible detection loop:

```bash
npm run watch -- --office=marina-ncr
```

Valid ids are `central-office`, `dmw-processing-center`, and `marina-ncr`.

The watcher keeps the phone awake while USB is connected, verifies every screen with OCR, selects the three offices sequentially, checks only through December, and never taps a calendar date. At the first detected opening or suspicious green cell it immediately alerts, saves evidence and partial status, leaves that calendar visible, and exits without scanning another month or office. Results are written to `data/watcher-status.json`.

On the calibrated phone, the adaptive transition build completed full three-office passes in
107–111 seconds; the previous fixed-delay build took 196–239 seconds on the same device.

Only one watcher may control a USB device at a time. A per-device lock rejects a second process
before it can tap the phone. Temporary screenshots are kept in one rotating scratch file and
removed on exit instead of accumulating throughout a long-running session.

Alerts use the terminal bell and `notify-send` when available. Set `WEBHOOK_URL` to send a JSON alert to an optional webhook; the payload is `{ title, message, at }`.

Because the watcher never taps a date, you are the second half of the detection loop. Point `WEBHOOK_URL` at an endpoint that reaches your phone (ntfy, Bark, a Telegram bot relay, and similar) so the gap between *opening found* and *you booking* is seconds rather than minutes.

## How an opening is detected

Every day cell is sampled across its whole area instead of at one pixel, so a day number printed over the fill, anti-aliasing, and small layout shifts cannot hide an opening. A cell must be at least 6% open-green to count; anything between 1.5% and 6% stops the watcher for immediate review rather than being silently treated as closed. The predicate accepts the application's own OPEN swatch (`rgb(206, 223, 165)`), verified against a real screenshot.

Two independent checks back that up:

- **Rendered-calendar gate.** A month is not inspected until the calendar band contains enough red or green availability fill. A title that appears before its cells finish rendering can no longer be recorded as a clean closed month.
- **Band cross-check.** Green and red totals for the whole calendar band are recorded each month. If the band is green but no day cell resolves, the watcher saves evidence, alerts, and stops on that calendar instead of reporting a clean month.
- **Grid anchoring (fallback only).** The calibrated grid is the verified primary path: against a real screenshot every sampled box lands on its own cell, and the measured row step is 108 against the calibrated 106.5. As a secondary check the day numbers OCR reads off the screen are fitted to a grid, and cells are sampled from that fit whenever it is accepted. OCR currently reads too few day numbers on this calendar for a trustworthy fit, so `grid` normally reads `calibrated` — it only reads `ocr` when a fit actually succeeds.

Months the calendar refuses to show become `coverage-gap`, announced once and recorded under each office's `warnings` — a month that was never displayed can no longer pass as a clean result. Per-month detail (band totals and every non-zero cell fraction) is written to `diagnostics` in `data/watcher-status.json`, and the detector in use is reported under `detector`.

The capture helper, validator, and watcher now share the same cell-level detector, so the manual helper reports the same exact open dates as the continuous watcher.

## Validate the detector

A detector that has never fired on a known-positive screenshot cannot tell "no slots" from "broken". Until this is done, every result means *no opening detected*, not *no opening exists* — and `detector.validated` stays `false` in the status file.

1. When you can see a green/open date on the phone, save it: `npm run capture -- --office=marina-ncr --month=2026-11 --confirm-exact-filters`
2. Run `npm run validate` to see what the detector makes of every saved screenshot.
3. If it agrees with your eyes, record it: `npm run validate -- --confirm=data/captures/<file>.png`

That writes `data/detector-validation.json`, after which the watcher reports `detector.validated: true`.

### Session renewal

When MARINA needs a fresh session, the watcher returns through eGovPH Home, reopens MARINA OAS, and scrolls the Terms & Conditions to the agreement button. It pauses and alerts there so you can review and tap **I Agree** yourself; it resumes automatically afterward.

To have the watcher accept those terms for the logged-in account, opt in with `--auto-agree`:

```bash
npm run watch -- --office=dmw-processing-center --no-wait --auto-agree
```

It taps only when it locates the exact agreement label and verifies that the transaction form opens. If it cannot verify either step, it pauses for manual review as usual. This flag applies only to the current watcher run.

Manual intervention is also required if the phone locks, USB disconnects, eGovPH is killed, authentication expires, or the developer-mode warning returns.

## Optional dashboard

The earlier local dashboard remains available as a status viewer:

```bash
npm start
```

Open <http://127.0.0.1:4173>.

## Read-only phone view on your local network

Install `scrcpy` as well as the watcher dependencies. Leave the watcher running in one terminal,
then start the viewer in another:

```bash
npm run view:lan
```

The viewer prints a private URL such as `http://192.168.100.16:4180/?token=...`. Open that exact
URL on a phone or computer on the same local network. It shows the live phone screen with no
audio or remote controls. The video is captured by scrcpy and converted to a browser-compatible
stream in memory; capture stops a few seconds after the last viewer disconnects. Press Ctrl+C in
the viewer terminal to shut down its web server. The access link changes each time it starts.

The viewer binds to a private LAN address only. If it selects the wrong network adapter, use
`npm run view:lan -- --host=<computer-LAN-IP> --port=4180`. The link uses HTTP, so share it only
on a trusted local network; anyone with the link can see everything shown on the phone, including
personal information in eGovPH. Do not forward its port to the internet.

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
