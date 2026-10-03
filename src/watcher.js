import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectOpenDates } from "./calendar.js";
import { OFFICES, SCOPE } from "./config.js";

const BASE_WIDTH = 1220;
const BASE_HEIGHT = 2712;
const FIRST_MONTH = "2026-10";
const LAST_MONTH = "2026-12";
const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];
const OFFICE_CHOICES = {
  "central-office": /^CENTRAL$/i,
  "dmw-processing-center": /^DMW$/i,
  "marina-ncr": /MARINA.?NCR/i,
};
const intervalSeconds = boundedNumber(
  argumentValue("--interval") ?? process.env.WATCH_INTERVAL_SECONDS,
  300,
  60,
  3600,
);
const runOnce = process.argv.includes("--once");
const tessdata = path.resolve("vendor/tessdata");
const statusFile = path.resolve("data/watcher-status.json");
const alertDir = path.resolve("data/alerts");
const scratchDir = await mkdtemp(path.join(tmpdir(), "marina-oas-watcher-"));
let captureNumber = 0;
let deviceSerial;
let scaleX = 1;
let scaleY = 1;

await initializeDevice();
log(`USB device ${deviceSerial} ready (${Math.round(BASE_WIDTH * scaleX)}x${Math.round(BASE_HEIGHT * scaleY)}).`);
log(`Watching ${OFFICES.map((office) => office.name).join(", ")} through December 2026.`);
log(`Interval: ${intervalSeconds}s. The watcher never taps a calendar date.`);

do {
  try {
    const result = await runCycle();
    await publishResult(result);
    if (runOnce) break;
    const waitSeconds = Math.max(10, intervalSeconds - result.durationSeconds);
    log(`Next scan in ${waitSeconds}s (target start interval: ${intervalSeconds}s).`);
    await delay(waitSeconds * 1000);
  } catch (error) {
    await notify("MARINA watcher needs attention", error.message);
    console.error(`[${clock()}] ${error.stack || error.message}`);
    if (runOnce) process.exit(1);
    log("Retrying recovery in 30s.");
    await delay(30_000);
  }
} while (true);

async function runCycle() {
  const startedAt = new Date();
  const results = [];
  await ensureTransactionForm();
  await ensureBlankTransactionForm();

  for (const office of OFFICES) {
    log(`Checking ${office.name}…`);
    await configureOffice(office);
    const result = await scanCalendar(office);
    results.push(result);
    log(formatOfficeResult(result));
    await returnToTransactionForm();
  }

  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    source: "eGovPH MARINA OAS calendar via USB ADB",
    scope: SCOPE,
    results,
  };
}

async function ensureBlankTransactionForm() {
  await scrollToFormTop();
  let screen = await readScreen();
  const content = screenContent(screen);
  if (content.includes("SELECT MARINA OFFICE")) return;
  if (content.includes("CENTRAL OFFICE")) {
    log("Resuming a verified partial Central Office form from a prior fail-closed attempt.");
    return;
  }

  log("The transaction form is partially filled; renewing MARINA OAS to obtain a clean form.");
  await tap(1130, 215);
  await delay(1800);
  await ensureTransactionForm();
  await scrollToFormTop();
  screen = await readScreen();
  if (!screenContent(screen).includes("SELECT MARINA OFFICE")) {
    throw new Error("MARINA did not provide a clean transaction form after renewal.");
  }
}

async function ensureTransactionForm() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const screen = await readScreen();
    const state = classify(screen.text);

    if (state === "form") {
      await scrollToFormTop();
      return;
    }
    if (state === "calendar") {
      await returnToTransactionForm(screen);
      continue;
    }
    if (state === "terms") {
      await waitForManualTermsAcceptance();
      continue;
    }
    if (state === "home-confirm") {
      await tap(610, 2180);
      await delay(3500);
      continue;
    }
    if (state === "search") {
      await tap(600, 950);
      await delay(5000);
      continue;
    }
    if (state === "disclaimer") {
      await tapWord(screen, /^CLOSE$/i, [610, 2080]);
      await delay(2500);
      continue;
    }
    if (state === "developer-warning") {
      throw new Error("eGovPH is showing its developer-mode warning. Apply the open-first workaround, then leave eGov in the foreground.");
    }
    if (state === "public" || state === "unknown") {
      if (!normalize(screen.text).includes("MARINA OAS")) {
        throw new Error("The expected eGovPH/MARINA screen is not visible. Unlock the phone and bring eGovPH to the foreground.");
      }
      await tap(1130, 215);
      await delay(1800);
      continue;
    }
  }
  throw new Error("Could not recover the MARINA transaction form after multiple verified attempts.");
}

async function waitForManualTermsAcceptance() {
  let termsReady = false;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const screen = await readScreen();
    if (screenContent(screen).includes("I AGREE TO THE TERMS")) {
      termsReady = true;
      break;
    }
    await swipe(600, 2200, 600, 650, 300);
    await delay(250);
  }
  if (!termsReady) throw new Error("Could not expose the MARINA terms agreement button safely.");

  await notify(
    "MARINA action required",
    "Review and tap I Agree on the phone. The watcher is paused and will resume automatically.",
  );
  log("Paused at MARINA Terms & Conditions. Review and tap I Agree on the phone to continue.");
  let transitionFrames = 0;
  while (true) {
    await delay(5000);
    const screen = await readScreen();
    const state = classify(screen.text);
    if (state === "form") return;
    if (state === "terms") {
      transitionFrames = 0;
      continue;
    }
    if (state === "unknown" && transitionFrames < 6) {
      transitionFrames += 1;
      continue;
    }
    if (state !== "terms") {
      throw new Error(`The Terms screen changed unexpectedly (${state}).`);
    }
  }
}

async function scrollToFormTop() {
  for (let count = 0; count < 4; count += 1) {
    const screen = await readScreen();
    const content = screenContent(screen);
    if (content.includes("SELECT MARINA OFFICE") || content.includes("SELECT MARINA SITE")) return;
    await swipe(600, 750, 600, 2200, 450);
    await delay(650);
  }
  throw new Error("Could not normalize the transaction form to its top position without overscrolling.");
}

async function configureOffice(office) {
  await scrollToFormTop();
  let screen = await readScreen();
  const expectedOffice = office.id === "marina-ncr" ? "MARINA-NCR" : office.name.toUpperCase();
  if (!screenContent(screen).includes(expectedOffice)) {
    await chooseOffice(office);
    await delay(2200);
    screen = await readScreen();
  }
  if (!screenContent(screen).includes(expectedOffice)) {
    throw new Error(`Office verification failed: expected ${office.name}.`);
  }

  await chooseFromDialog({
    dropdown: [600, 2140],
    dialogText: "SELECT SEAFARER CATEGORY",
    dialogEvidence: ["PHILIPPINE WATERS", "APPRENTICESHIP"],
    choice: /^OVERSEAS$/i,
    fallback: [500, 1070],
  });
  await chooseFromDialog({
    dropdown: [600, 2280],
    dialogText: "SELECT SEAFARER TYPE",
    dialogEvidence: ["MASTER", "OFFICER", "RATING"],
    choice: /^OTHERS$/i,
    fallback: [500, 1890],
  });

  await swipe(600, 2100, 600, 900, 700);
  await delay(1000);
  screen = await readScreen();
  const categoryText = screenContent(screen);
  if (!categoryText.includes("OVERSEAS")) {
    throw new Error("Category verification failed; expected Overseas.");
  }

  await chooseFromDialog({
    dropdown: [600, 1740],
    dialogText: "SELECT MARINA SERVICES",
    dialogEvidence: ["RECORD BOOK", "IDENTITY DOCUMENT"],
    choice: /^IDENTITY$/i,
    fallback: [500, 1430],
    selectedEvidence: "IDENTITY DOCUMENT",
  });
  await delay(1800);
  await chooseFromDialog({
    dropdown: [600, 1880],
    dialogText: "SELECT SERVICE TYPE",
    dialogEvidence: ["RENEWAL", "REISSUANCE"],
    choice: /^NEW$/i,
    fallback: [500, 1160],
    selectedEvidence: "NEW",
  });
  await delay(1800);

  screen = await readScreen();
  const selected = screenContent(screen);
  if (
    !selected.includes("OVERSEAS") ||
    !(selected.includes("IDENTITY DOCUMENT") || selected.includes("SID")) ||
    !selected.includes("NEW")
  ) {
    throw new Error(`Final filter verification failed for ${office.name}; refusing to open the calendar.`);
  }

  await tap(600, 2040);
  await delay(5000);
  screen = await readScreen();
  if (classify(screen.text) !== "calendar") {
    throw new Error(`Calendar did not open for ${office.name}.`);
  }
}

async function chooseOffice(office) {
  await tap(600, 1080);
  await delay(1100);
  const screen = await readScreen();
  const content = screenContent(screen);
  if (!content.includes("CENTRAL OFFICE") || !content.includes("DMW PROCESSING CENTER") || !content.includes("MARINA-NCR")) {
    throw new Error("The office selector could not be normalized to its verified top options.");
  }
  const choice = findWord(screen.tsv, OFFICE_CHOICES[office.id]);
  if (!choice) throw new Error(`Could not locate ${office.name} by label in the office selector.`);
  await tapBox(choice);
  await delay(1500);
}

async function chooseFromDialog({
  dropdown,
  dialogText,
  dialogEvidence = [],
  choice,
  fallback,
  selectedEvidence,
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await tap(...dropdown);
    await delay(1100);
    const screen = await readScreen();
    const content = screenContent(screen);
    if (!content.includes(dialogText) && !dialogEvidence.every((value) => content.includes(value))) {
      throw new Error(`Expected selector “${dialogText}” did not open.`);
    }
    await tapWord(screen, choice, fallback);
    await delay(1800);
    if (!selectedEvidence) return;
    const selected = await readScreen();
    if (screenContent(selected).includes(selectedEvidence)) return;
  }
  throw new Error(`The selector “${dialogText}” did not retain ${selectedEvidence}.`);
}

async function scanCalendar(office) {
  const months = {};
  const notShown = [];
  let screen = await readScreen();
  let current = extractMonth(screen.text);
  if (!current) throw new Error(`Could not read the initial calendar month for ${office.name}.`);

  while (compareMonth(current, FIRST_MONTH) < 0) {
    screen = await moveCalendar(screen, 1);
    current = extractMonth(screen.text);
  }
  if (compareMonth(current, FIRST_MONTH) > 0) notShown.push(FIRST_MONTH);

  while (compareMonth(current, LAST_MONTH) <= 0) {
    const openDates = analyzeOpenDates(screen.path, current);
    months[current] = openDates;
    if (openDates.length) {
      await saveAlertEvidence(screen.path, office.id, current);
    }
    if (current === LAST_MONTH) break;
    screen = await moveCalendar(screen, 1);
    current = extractMonth(screen.text);
  }

  return { id: office.id, name: office.name, months, notShown };
}

async function moveCalendar(previousScreen, direction) {
  const before = extractMonth(previousScreen.text);
  await tap(direction > 0 ? 1100 : 120, 1435);
  await delay(3200);
  const next = await readScreen();
  if (classify(next.text) !== "calendar") throw new Error("Calendar navigation left the expected page.");
  const after = extractMonth(next.text);
  if (!after || monthOrdinal(after) !== monthOrdinal(before) + direction) {
    throw new Error(`Calendar month did not advance as expected (${before} → ${after || "unreadable"}).`);
  }
  return next;
}

async function returnToTransactionForm(initialScreen) {
  let screen = initialScreen || (await readScreen());
  if (classify(screen.text) === "form") return;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const back = findWord(screen.tsv, /^BACK$/i);
    if (back) {
      await tapBox(back);
      await delay(3200);
      screen = await readScreen();
      if (classify(screen.text) === "form") return;
    }
    await swipe(600, 2150, 600, 750, 600);
    await delay(800);
    screen = await readScreen();
  }
  throw new Error("Could not find the MARINA calendar Back button; refusing to use blind navigation.");
}

function analyzeOpenDates(file, monthKey) {
  const pixels = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  if (pixels.status !== 0) throw new Error(`ffmpeg could not read the calendar screenshot: ${String(pixels.stderr)}`);

  const width = Math.round(BASE_WIDTH * scaleX);
  const height = Math.round(BASE_HEIGHT * scaleY);
  return detectOpenDates(pixels.stdout, width, height, monthKey);
}

async function publishResult(result) {
  const previous = await loadJson(statusFile);
  await saveJson(statusFile, result);
  const previousDates = new Set(flattenOpenDates(previous));
  const currentDates = flattenOpenDates(result);
  const newDates = currentDates.filter((entry) => !previousDates.has(entry));

  if (currentDates.length === 0) {
    log(`Cycle complete in ${result.durationSeconds}s: no green/open dates through December.`);
    return;
  }
  if (newDates.length) {
    const message = `New opening(s): ${newDates.join(", ")}`;
    await notify("MARINA SID opening detected", message);
    log(message);
  } else {
    log(`Open date(s) still visible: ${currentDates.join(", ")}`);
  }
}

function flattenOpenDates(snapshot) {
  if (!snapshot?.results) return [];
  return snapshot.results.flatMap((office) =>
    Object.values(office.months || {}).flat().map((date) => `${office.name}: ${date}`),
  );
}

function formatOfficeResult(result) {
  const dates = Object.values(result.months).flat();
  const coverage = Object.keys(result.months).join(", ");
  return dates.length
    ? `${result.name}: OPEN — ${dates.join(", ")} (checked ${coverage})`
    : `${result.name}: no openings (checked ${coverage})`;
}

async function initializeDevice() {
  const lines = adbText(["devices"]).split("\n").filter((line) => /\tdevice$/.test(line));
  if (lines.length !== 1) throw new Error(`Expected one authorized USB-ADB device; found ${lines.length}.`);
  deviceSerial = lines[0].split("\t")[0];
  const size = adbText(["shell", "wm", "size"]).match(/Physical size:\s*(\d+)x(\d+)/i);
  if (!size) throw new Error("Could not read the phone display size.");
  scaleX = Number(size[1]) / BASE_WIDTH;
  scaleY = Number(size[2]) / BASE_HEIGHT;
  if (Math.abs(scaleX - scaleY) > 0.05 || scaleX < 0.7 || scaleX > 1.5) {
    throw new Error(`Unsupported display geometry ${size[1]}x${size[2]}; expected the calibrated 1220x2712 layout.`);
  }
  execFileSync("tesseract", ["--version"], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  adbText(["shell", "svc", "power", "stayon", "usb"]);
}

async function readScreen() {
  const file = path.join(scratchDir, `screen-${String(captureNumber++).padStart(5, "0")}.png`);
  const image = execFileSync("adb", ["-s", deviceSerial, "exec-out", "screencap", "-p"], {
    maxBuffer: 20 * 1024 * 1024,
  });
  await writeFile(file, image);
  const env = { ...process.env, TESSDATA_PREFIX: tessdata };
  const text = execFileSync("tesseract", [file, "stdout", "--psm", "6"], {
    encoding: "utf8",
    env,
    maxBuffer: 5 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const tsv = execFileSync("tesseract", [file, "stdout", "--psm", "11", "tsv"], {
    encoding: "utf8",
    env,
    maxBuffer: 5 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return { path: file, text, tsv: parseTsv(tsv) };
}

function classify(text) {
  const value = normalize(text);
  if (value.includes("GO BACK TO EGOVPH HOME")) return "home-confirm";
  if (value.includes("GENDER EQUALITY DISCLAIMER")) return "disclaimer";
  if (value.includes("BEFORE YOU BEGIN") || value.includes("I AGREE TO THE TERMS")) return "terms";
  if (value.includes("SET YOUR APPOINTMENT SCHEDULE") && value.includes("PREFERRED DATE")) return "calendar";
  if (
    value.includes("SELECT YOUR TRANSACTION TYPE") ||
    value.includes("SELECT MARINA SITE") ||
    value.includes("SELECT MARINA SERVICE") ||
    value.includes("SELECT YOUR CATEGORY")
  ) {
    return "form";
  }
  if (value.includes("SEARCHED SERVICES") && value.includes("MARINA OAS")) return "search";
  if (value.includes("DEVELOPER") && (value.includes("OPTION") || value.includes("MODE"))) return "developer-warning";
  if (value.includes("LATEST AVAILABLE SCHEDULE") || value.includes("MARINA SID/SRB OAS")) return "public";
  return "unknown";
}

function extractMonth(text) {
  const match = normalize(text).match(new RegExp(`(${MONTHS.join("|")})\\s+(2026)`));
  if (!match) return null;
  return `${match[2]}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0")}`;
}

function monthOrdinal(value) {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month;
}

function compareMonth(left, right) {
  return monthOrdinal(left) - monthOrdinal(right);
}

function parseTsv(value) {
  return value
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.length >= 12 && columns[11].trim())
    .map((columns) => ({
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      confidence: Number(columns[10]),
      text: columns[11].trim(),
    }));
}

function findWord(words, pattern) {
  return words.find((word) => word.confidence > 20 && pattern.test(word.text));
}

async function tapWord(screen, pattern, fallback) {
  const word = findWord(screen.tsv, pattern);
  if (word) return tapBox(word);
  if (!fallback) throw new Error(`Could not locate required control ${pattern}.`);
  return tap(...fallback);
}

async function tapBox(box) {
  return tap((box.left + box.width / 2) / scaleX, (box.top + box.height / 2) / scaleY);
}

async function tap(x, y) {
  adbText(["shell", "input", "tap", String(Math.round(x * scaleX)), String(Math.round(y * scaleY))]);
  await delay(250);
}

async function swipe(x1, y1, x2, y2, duration) {
  adbText([
    "shell",
    "input",
    "swipe",
    String(Math.round(x1 * scaleX)),
    String(Math.round(y1 * scaleY)),
    String(Math.round(x2 * scaleX)),
    String(Math.round(y2 * scaleY)),
    String(duration),
  ]);
}

function adbText(args) {
  return execFileSync("adb", args, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
}

async function saveAlertEvidence(source, officeId, month) {
  await mkdir(alertDir, { recursive: true });
  const destination = path.join(alertDir, `${officeId}-${month}-${new Date().toISOString().replaceAll(":", "-")}.png`);
  await copyFile(source, destination);
}

async function loadJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function saveJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

async function notify(title, message) {
  process.stdout.write("\u0007");
  const notification = spawnSync("notify-send", [title, message]);
  if (notification.error?.code !== "ENOENT" && notification.status && notification.status !== 0) {
    console.error(`[${clock()}] Desktop notification failed: ${String(notification.stderr || "unknown error")}`);
  }
  if (process.env.WEBHOOK_URL) {
    try {
      await fetch(process.env.WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, message, at: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.error(`[${clock()}] Webhook notification failed: ${error.message}`);
    }
  }
}

function normalize(value) {
  return String(value).replace(/[^A-Za-z0-9/&()-]+/g, " ").trim().toUpperCase();
}

function screenContent(screen) {
  return normalize(`${screen.text} ${screen.tsv.map((word) => word.text).join(" ")}`);
}

function argumentValue(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function log(message) {
  console.log(`[${clock()}] ${message}`);
}

function clock() {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
