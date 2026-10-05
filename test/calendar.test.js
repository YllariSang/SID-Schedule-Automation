import assert from "node:assert/strict";
import test from "node:test";
import {
  AMBIGUOUS_FRACTION,
  BAND_GREEN_THRESHOLD,
  CALIBRATED_GRID,
  analyzeFrame,
  cellBox,
  detectOpenDates,
  fitGridOrigin,
  inspectMonth,
  pngSize,
} from "../src/calendar.js";
import {
  HEIGHT,
  WIDTH,
  drawDigit,
  fillCell,
  fillCellWithOrigin,
  fillRegion,
  monthWords,
  speck,
} from "./fixtures.js";

function frame() {
  return Buffer.alloc(WIDTH * HEIGHT * 3, 255);
}

test("reports an opening even when the day number sits on the green fill", () => {
  const pixels = drawDigit(fillCell(frame(), "2026-11", 11), "2026-11", 11);

  assert.deepEqual(detectOpenDates(pixels, WIDTH, HEIGHT, "2026-11"), ["2026-11-11"]);
});

test("does not report a single stray green pixel as an opening", () => {
  const pixels = speck(frame(), "2026-11", 11);

  assert.deepEqual(detectOpenDates(pixels, WIDTH, HEIGHT, "2026-11"), []);
});

test("flags a partial green cell as ambiguous instead of silently closed", () => {
  const pixels = frame();
  const box = cellBox("2026-11", 11, WIDTH, HEIGHT, CALIBRATED_GRID);
  fillRegion(pixels, box.left, box.top + box.height - 4, box.width, 4);

  const inspection = inspectMonth(pixels, WIDTH, HEIGHT, "2026-11");
  assert.deepEqual(inspection.dates, []);
  assert.equal(inspection.ambiguous.length, 1);
  assert.equal(inspection.ambiguous[0].date, "2026-11-11");
  assert.ok(inspection.ambiguous[0].fraction >= AMBIGUOUS_FRACTION);
  assert.ok(inspection.ambiguous[0].fraction < 0.06);
});

test("surfaces green inside the calendar band that no day cell explains", () => {
  const pixels = fillRegion(frame(), 200, 1512, 800, 48);

  const inspection = inspectMonth(pixels, WIDTH, HEIGHT, "2026-11");
  assert.deepEqual(inspection.dates, []);
  assert.ok(
    inspection.band.green >= BAND_GREEN_THRESHOLD,
    `band should flag the month, saw ${inspection.band.green} green pixels`,
  );
});

test("reports no opening for a fully closed month", () => {
  const pixels = fillCell(frame(), "2026-11", 11, [233, 149, 147]);

  const inspection = inspectMonth(pixels, WIDTH, HEIGHT, "2026-11");
  assert.deepEqual(inspection.dates, []);
  assert.equal(inspection.band.green, 0);
  assert.ok(inspection.band.red > 0);
});

test("recovers the calibrated grid from OCR day numbers", () => {
  const fitted = fitGridOrigin(monthWords("2026-11"), WIDTH, HEIGHT, "2026-11");

  assert.ok(fitted, "expected the grid to fit");
  assert.ok(Math.abs(fitted.left - CALIBRATED_GRID.left) <= 45);
  assert.ok(Math.abs(fitted.top - CALIBRATED_GRID.top) <= 45);
  assert.ok(Math.abs(fitted.columnStep - CALIBRATED_GRID.columnStep) <= 45);
  assert.ok(Math.abs(fitted.rowStep - CALIBRATED_GRID.rowStep) <= 45);
});

test("anchors a scrolled calendar to the OCR grid instead of the calibrated one", () => {
  const scrolled = { ...CALIBRATED_GRID, top: CALIBRATED_GRID.top + 90 };
  const pixels = fillCellWithOrigin(frame(), "2026-11", 11, scrolled);

  // With a shifted grid the calibrated geometry does not stay silent: it lands on the row
  // below and reports the wrong day, which is worse than reporting nothing.
  assert.notDeepEqual(detectOpenDates(pixels, WIDTH, HEIGHT, "2026-11"), ["2026-11-11"]);

  const fitted = fitGridOrigin(monthWords("2026-11", scrolled), WIDTH, HEIGHT, "2026-11");
  assert.ok(fitted, "expected the scrolled grid to fit");
  assert.ok(Math.abs(fitted.top - scrolled.top) <= 45);
  assert.deepEqual(
    detectOpenDates(pixels, WIDTH, HEIGHT, "2026-11", { origin: fitted }),
    ["2026-11-11"],
  );
});

test("rejects day numbers that do not describe a calendar grid", () => {
  const tooWide = { ...CALIBRATED_GRID, columnStep: 400 };
  assert.equal(fitGridOrigin(monthWords("2026-11", tooWide), WIDTH, HEIGHT, "2026-11"), null);
});

test("rejects low-confidence and incomplete word sets", () => {
  assert.equal(
    fitGridOrigin(monthWords("2026-11", CALIBRATED_GRID, { confidence: 10 }), WIDTH, HEIGHT, "2026-11"),
    null,
  );
  assert.equal(fitGridOrigin([], WIDTH, HEIGHT, "2026-11"), null);
  assert.equal(fitGridOrigin(monthWords("2026-11").slice(0, 8), WIDTH, HEIGHT, "2026-11"), null);
});

test("rejects day numbers that belong to a different month", () => {
  assert.equal(fitGridOrigin(monthWords("2026-11"), WIDTH, HEIGHT, "2026-12"), null);
});

test("counts green and red across the calendar band", () => {
  const greenFrame = fillRegion(frame(), 300, 1600, 400, 60);
  const redFrame = fillRegion(frame(), 300, 1600, 400, 60, [233, 149, 147]);

  assert.ok(analyzeFrame(greenFrame, WIDTH, HEIGHT).green >= BAND_GREEN_THRESHOLD);
  assert.equal(analyzeFrame(greenFrame, WIDTH, HEIGHT).red, 0);
  assert.ok(analyzeFrame(redFrame, WIDTH, HEIGHT).red >= BAND_GREEN_THRESHOLD);
  assert.equal(analyzeFrame(redFrame, WIDTH, HEIGHT).green, 0);
});

test("reads PNG dimensions from the IHDR header", () => {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x49484452, 12);
  png.writeUInt32BE(1220, 16);
  png.writeUInt32BE(2712, 20);

  assert.deepEqual(pngSize(png), { width: 1220, height: 2712 });
  assert.equal(pngSize(Buffer.from("not a png")), null);
  assert.equal(pngSize(null), null);
});
