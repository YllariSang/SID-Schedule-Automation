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

The watcher keeps the phone awake while USB is connected, verifies every screen with OCR, selects the three offices sequentially, checks only through December, and never taps a calendar date. Results are written to `data/watcher-status.json`.

Alerts use the terminal bell and `notify-send` when available. Set `WEBHOOK_URL` to send a JSON alert to an optional webhook.

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
