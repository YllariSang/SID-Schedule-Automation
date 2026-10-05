import { execFileSync, spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BAND_GREEN_THRESHOLD, CALIBRATED_GRID, fitGridOrigin, inspectMonth, pngSize } from "./calendar.js";
import { parseTsv } from "./ocr.js";

const tessdata = path.resolve("vendor/tessdata");
const alertDir = path.resolve("data/alerts");
const captureDir = path.resolve("data/captures");
const validationFile = path.resolve("data/detector-validation.json");
const confirmPath = argumentValue("--confirm");
const monthOption = argumentValue("--month");
const MONTH_PATTERN = /2026-(?:10|11|12)/;

const files = confirmPath
  ? [path.resolve(confirmPath)]
  : [
      ...(await pngsIn(alertDir)).map((name) => ({ file: path.join(alertDir, name), expected: "open" })),
      ...(await pngsIn(captureDir)).map((name) => ({ file: path.join(captureDir, name), expected: null })),
    ];

if (files.length === 0) {
  console.log("No saved screenshots found under data/alerts or data/captures.");
  console.log("Record one with: npm run capture -- --office=<id> --month=<2026-11> --confirm-exact-filters");
  process.exit(confirmPath ? 1 : 0);
}

let confirmed = null;
let failures = 0;

for (const entry of files) {
  const item = typeof entry === "string" ? { file: entry, expected: null } : entry;
  const name = path.basename(item.file);
  const month = name.match(MONTH_PATTERN)?.[0] ?? monthOption;

  if (!month) {
    console.log(`${name}: unknown month; pass --month=2026-11`);
    failures += 1;
    continue;
  }

  let report;
  try {
    report = await analyze(item.file, month);
  } catch (error) {
    console.log(`${name}: could not be analyzed (${error.message})`);
    failures += 1;
    continue;
  }

  const { dates, band, grid, anchored } = report;
  const shown = dates.length ? dates.join(", ") : "none";
  console.log(
    `${name}: month=${month} grid=${grid}${anchored === false ? " (fit rejected)" : ""} ` +
      `bandGreen=${band.green} ambiguous=${report.ambiguous.length} open=${shown}`,
  );
  if (item.expected === "open" && dates.length === 0) {
    console.log(
      `  !! saved as an opening but the detector now finds nothing ` +
        `(band green=${band.green}, threshold=${BAND_GREEN_THRESHOLD})`,
    );
    failures += 1;
  }
  if (confirmPath) confirmed = report;
}

if (confirmPath) {
  if (!confirmed) {
    fail(`Could not analyze ${confirmPath}.`);
  }
  if (confirmed.dates.length === 0) {
    fail(
      `Refusing to record validation: the detector found no opening in ${confirmPath}. ` +
        `Band green=${confirmed.band.green}. Use a screenshot where an open date is visible.`,
    );
  }
  await writeFile(
    validationFile,
    `${JSON.stringify(
      {
        matched: true,
        validatedAt: new Date().toISOString(),
        sample: path.basename(confirmPath),
        month: confirmed.month,
        dates: confirmed.dates,
        grid: confirmed.grid,
        note: "A human confirmed this screenshot shows an opening and the detector agreed.",
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Detector confirmed against ${path.basename(confirmPath)}: ${confirmed.dates.join(", ")}`);
  console.log(`Validation recorded in ${path.relative(process.cwd(), validationFile)}.`);
  console.log("The watcher will now report detector.validated=true in its status.");
  process.exit(0);
}

console.log("");
if (failures) console.log(`${failures} file(s) need attention.`);
console.log(
  "To record a positive control, run this again with " +
    "--confirm=<png-that-visibly-shows-an-open-date> while a slot is open on the phone.",
);

async function analyze(file, month) {
  const png = await readPng(file);
  const size = pngSize(png);
  if (!size) throw new Error("not a readable PNG");

  const decoded = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { maxBuffer: 30 * 1024 * 1024 },
  );
  if (decoded.status !== 0) throw new Error(`ffmpeg: ${String(decoded.stderr).trim()}`);

  const words = tesseractTsv(file);
  const fitted = fitGridOrigin(words, size.width, size.height, month);
  const inspection = inspectMonth(decoded.stdout, size.width, size.height, month, {
    origin: fitted ?? CALIBRATED_GRID,
  });
  return {
    ...inspection,
    anchored: fitted ? true : words.length ? false : null,
    grid: fitted ? "ocr" : "calibrated",
  };
}

async function readPng(file) {
  return readFile(file);
}

function tesseractTsv(file) {
  try {
    const tsv = execFileSync("tesseract", [file, "stdout", "--psm", "11", "tsv"], {
      encoding: "utf8",
      env: { ...process.env, TESSDATA_PREFIX: tessdata },
      maxBuffer: 5 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseTsv(tsv);
  } catch {
    return [];
  }
}

async function pngsIn(directory) {
  try {
    return (await readdir(directory)).filter((name) => /\.png$/i.test(name)).sort();
  } catch {
    return [];
  }
}

function argumentValue(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
