import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CALIBRATED_GRID,
  fitGridOrigin,
  inspectMonth,
  isCalendarBandRendered,
  pngSize,
} from "./calendar.js";
import { OFFICES } from "./config.js";
import { buildVerifiedSnapshot, isExactSnapshot } from "./marina.js";
import { parseTsv } from "./ocr.js";
import { loadSnapshot, saveSnapshot } from "./store.js";
import { INITIAL_VERIFIED_SNAPSHOT } from "./verified.js";

const args = new Set(process.argv.slice(2));
const officeId = argumentValue("--office");
const month = argumentValue("--month");
const office = OFFICES.find((item) => item.id === officeId);

if (!office || !/^2026-(10|11|12)$/.test(month || "")) {
  fail(
    "Usage: npm run capture -- --office=<central-office|dmw-processing-center|marina-ncr> --month=<2026-10|2026-11|2026-12> --confirm-exact-filters",
  );
}
if (!args.has("--confirm-exact-filters")) {
  fail(
    "Refusing to label the screenshot without --confirm-exact-filters. Confirm the phone shows the requested office, Overseas, Others, SID, New, and the supplied month.",
  );
}

const deviceLines = runText("adb", ["devices"]).split("\n").filter((line) => /\tdevice$/.test(line));
if (deviceLines.length !== 1) fail(`Expected one authorized ADB device; found ${deviceLines.length}.`);

const windows = runText("adb", ["shell", "dumpsys", "window", "windows"]);
if (!windows.includes("egov.app")) fail("eGovPH is not the foreground app on the connected phone.");

const screenshot = execFileSync("adb", ["exec-out", "screencap", "-p"], {
  maxBuffer: 20 * 1024 * 1024,
});
const captureDir = path.resolve("data/captures");
await mkdir(captureDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-");
const capturePath = path.join(captureDir, `${office.id}-${month}-${stamp}.png`);
await writeFile(capturePath, screenshot);

const inspection = analyzeCalendarFrame(capturePath, screenshot, month);
const isOpen = inspection.dates.length > 0;
if (!isCalendarBandRendered(inspection.band)) {
  fail(`The captured screen does not look like a MARINA availability calendar. Saved: ${capturePath}`);
}

const saved = await loadSnapshot();
const previous = isExactSnapshot(saved) ? saved : INITIAL_VERIFIED_SNAPSHOT;
const schedules = previous.schedules.map((item) => {
  if (item.id !== office.id) return item;
  const checkedMonths = [...new Set([...(item.checkedMonths || []), month])].sort();
  const openMonths = new Set(item.openMonths || []);
  if (isOpen) openMonths.add(month);
  else openMonths.delete(month);
  const open = [...openMonths].sort();
  return {
    ...item,
    checkedMonths,
    openMonths: open,
    status: open.length ? "available" : "unavailable",
    evidence: open.length
      ? `Green/open calendar cells detected in ${open.join(", ")}. Review the phone for the exact date.`
      : "No green/open calendar cells detected in the recorded months.",
  };
});

const next = buildVerifiedSnapshot({ checkedAt: new Date(), schedules });
await saveSnapshot(next);
console.log(
  `${office.name} ${month}: ${isOpen ? `OPEN — ${inspection.dates.join(", ")}` : "no open date"}`,
);
console.log(`Evidence saved: ${capturePath}`);
console.log("Dashboard status updated.");

/**
 * Use the same cell-level detector as the continuous watcher so a manual capture and a live
 * scan cannot disagree about which exact dates are open.
 */
function analyzeCalendarFrame(file, png, monthKey) {
  const size = pngSize(png);
  if (!size) fail("ADB did not return a readable PNG screenshot.");

  const result = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { maxBuffer: 30 * 1024 * 1024 },
  );
  if (result.status !== 0) fail(`Unable to analyze screenshot: ${String(result.stderr)}`);

  const tsv = execFileSync("tesseract", [file, "stdout", "--psm", "11", "tsv"], {
    encoding: "utf8",
    env: { ...process.env, TESSDATA_PREFIX: path.resolve("vendor/tessdata") },
    maxBuffer: 5 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const origin = fitGridOrigin(parseTsv(tsv), size.width, size.height, monthKey) ?? CALIBRATED_GRID;
  return inspectMonth(result.stdout, size.width, size.height, monthKey, { origin });
}

function argumentValue(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function runText(command, commandArgs) {
  try {
    return execFileSync(command, commandArgs, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  } catch (error) {
    fail(`${command} failed: ${error.message}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
