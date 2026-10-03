# MARINA OAS Device Watcher

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
- One authorized USB or network ADB phone at the calibrated 1220×2712 display layout
- eGovPH opened before enabling Developer Options/USB debugging
- Phone connected, unlocked, and eGovPH left in the foreground

Start continuous checks every five minutes:

```bash
npm run watch
```

`npm run watch:adb` is the explicit equivalent for a USB or network ADB device.

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

## Deprecated Waydroid experiment

> **Deprecated:** Do not use this path with an eGovPH or primary Google account. Waydroid shares the host kernel, stores Android data on the host, and requires persistent ADB access. This implementation remains on its archival branch only so the experiment and reusable engineering work are not lost. Use a physical ADB phone for the actual watcher.

The retained experiment lets Waydroid replace the USB phone. The host needs `adb`, Waydroid must use a Google Apps image, and eGovPH still needs a real signed-in account.

1. Start the Android UI:

   ```bash
   waydroid show-full-ui
   ```

2. Historical validation required installing eGovPH from Play Store and signing in. Do not perform this step with a real account; it is retained only to document the experiment.

3. Connect ADB and calibrate Waydroid to the exact phone layout used by the watcher:

   ```bash
   npm run waydroid:setup
   ```

   Accept Waydroid's ADB debugging prompt if it appears, then rerun the command. Setup sets the Android display override to 1220×2712 at 480 dpi, disables screen sleep, verifies that `egov.app` is installed, and launches it.

4. With a non-sensitive test environment only, open MARINA OAS once and complete its initial screens. Then start the watcher:

   ```bash
   npm run watch:waydroid
   ```

   For a single validation cycle, use `npm run watch:waydroid:once`.

Waydroid mode reconnects ADB, selects the Waydroid instance even when a USB phone is also attached, wakes and unlocks the virtual display, and launches eGovPH if it is not already visible. It does not install the app, enter credentials, accept terms, pick a date, or book an appointment. Keep the Waydroid session running while the watcher runs.

If more than one ordinary ADB device is connected, select one with `--serial=<adb-serial>` or `ADB_SERIAL`. The device backend can also be chosen with `--device=adb|waydroid`; `WATCH_DEVICE=waydroid` is equivalent to the `--waydroid` flag.

If `waydroid status` reports `IP address: UNKNOWN` on a host using UFW, permit only the Waydroid bridge traffic and restart the session:

```bash
sudo ufw allow in on waydroid0 to any port 67 proto udp comment 'Waydroid DHCP'
sudo ufw allow in on waydroid0 to any port 53 proto udp comment 'Waydroid DNS'
sudo ufw allow in on waydroid0 to any port 53 proto tcp comment 'Waydroid DNS'
sudo ufw route allow in on waydroid0 comment 'Waydroid forwarding'
waydroid session stop
waydroid show-full-ui
```

These rules are scoped to the local `waydroid0` interface; the forwarding rule allows traffic originating from the Android container to be routed outward.

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
