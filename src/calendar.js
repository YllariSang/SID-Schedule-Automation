const BASE_WIDTH = 1220;
const BASE_HEIGHT = 2712;

/** Calibrated day-grid geometry for the reference 1220x2712 layout, in base-layout units. */
export const CALIBRATED_GRID = Object.freeze({
  left: 148,
  columnStep: 153.5,
  top: 1605,
  rowStep: 106.5,
});

/** The calendar band used as a cross-check: the region the capture helper has always sampled. */
const BAND = Object.freeze({ xStart: 0.057, yStart: 0.557, xEnd: 0.942, yEnd: 0.797 });

/** Fraction of a day cell that must read as open green before a date is reported. */
export const OPEN_FRACTION = 0.06;
/** Cells at or above this fraction but below OPEN_FRACTION are reported as ambiguous, never as closed. */
export const AMBIGUOUS_FRACTION = 0.015;
/** Green pixels inside the calendar band that flag a month as worth reviewing. */
export const BAND_GREEN_THRESHOLD = 100;
/** Red pixels inside the calendar band; used to confirm the screen is a calendar at all. */
export const BAND_RED_THRESHOLD = 500;

export function calendarCellCenter(monthKey, day, width = BASE_WIDTH, height = BASE_HEIGHT, origin = CALIBRATED_GRID) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!/^\d{4}-\d{2}$/.test(monthKey) || day < 1 || day > daysInMonth) {
    throw new Error(`Invalid calendar date ${monthKey}-${day}`);
  }
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cell = firstWeekday + day - 1;
  return {
    x: Math.round((origin.left + origin.columnStep * (cell % 7)) * (width / BASE_WIDTH)),
    y: Math.round((origin.top + origin.rowStep * Math.floor(cell / 7)) * (height / BASE_HEIGHT)),
  };
}

/**
 * The sampleable interior of one day cell. It is deliberately smaller than the cell so that
 * neighbouring rows and columns cannot bleed in, and it covers the whole cell so that a day
 * number drawn on top of a filled cell never hides the fill underneath it.
 */
export function cellBox(monthKey, day, width = BASE_WIDTH, height = BASE_HEIGHT, origin = CALIBRATED_GRID) {
  const { x, y } = calendarCellCenter(monthKey, day, width, height, origin);
  const halfWidth = Math.round(origin.columnStep * 0.4 * (width / BASE_WIDTH));
  const halfHeight = Math.round(origin.rowStep * 0.38 * (height / BASE_HEIGHT));
  const left = Math.max(0, x - halfWidth);
  const top = Math.max(0, y - halfHeight);
  return {
    left,
    top,
    width: Math.min(width - left, halfWidth * 2),
    height: Math.min(height - top, halfHeight * 2),
  };
}

export function isOpenGreen(red, green, blue) {
  return green > red + 8 && green > blue + 15 && red > 115 && green > 150 && blue < 205;
}

export function isClosedRed(red, green, blue) {
  return red > 220 && red > green + 45 && green > 70 && green < 190 && blue < 200;
}

function sampleBox(pixels, width, height, box, predicate) {
  let matches = 0;
  let total = 0;
  const right = Math.min(width, box.left + box.width);
  const bottom = Math.min(height, box.top + box.height);
  for (let y = Math.max(0, box.top); y < bottom; y += 1) {
    let offset = (y * width + Math.max(0, box.left)) * 3;
    for (let x = Math.max(0, box.left); x < right; x += 1) {
      if (predicate(pixels[offset], pixels[offset + 1], pixels[offset + 2])) matches += 1;
      offset += 3;
      total += 1;
    }
  }
  return total ? matches / total : 0;
}

/** Green/red pixel totals across the calendar band, used as an independent cross-check. */
export function analyzeFrame(pixels, width, height) {
  const box = {
    left: Math.floor(width * BAND.xStart),
    top: Math.floor(height * BAND.yStart),
    width: Math.ceil(width * (BAND.xEnd - BAND.xStart)),
    height: Math.ceil(height * (BAND.yEnd - BAND.yStart)),
  };
  let green = 0;
  let red = 0;
  const right = Math.min(width, box.left + box.width);
  const bottom = Math.min(height, box.top + box.height);
  for (let y = Math.max(0, box.top); y < bottom; y += 1) {
    let offset = (y * width + Math.max(0, box.left)) * 3;
    for (let x = Math.max(0, box.left); x < right; x += 1) {
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      if (isOpenGreen(r, g, b)) green += 1;
      if (isClosedRed(r, g, b)) red += 1;
      offset += 3;
    }
  }
  return { green, red };
}

/**
 * Inspect every day cell of one month. Reports dates only when a whole cell reads as open,
 * and always reports the band total so that a green screen the cells cannot explain is never
 * silently downgraded to "no openings".
 */
export function inspectMonth(pixels, width, height, monthKey, options = {}) {
  const origin = options.origin ?? CALIBRATED_GRID;
  const [year, month] = monthKey.split("-").map(Number);
  if (!/^\d{4}-\d{2}$/.test(monthKey) || !Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Invalid calendar month ${monthKey}`);
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const expectedBytes = width * height * 3;
  if (pixels.length < expectedBytes) throw new Error("RGB screenshot buffer is incomplete.");

  const cells = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const fraction = sampleBox(
      pixels,
      width,
      height,
      cellBox(monthKey, day, width, height, origin),
      isOpenGreen,
    );
    cells.push({ date: `${monthKey}-${String(day).padStart(2, "0")}`, fraction: Number(fraction.toFixed(4)) });
  }

  const band = analyzeFrame(pixels, width, height);
  return {
    month: monthKey,
    cells,
    dates: cells.filter((cell) => cell.fraction >= OPEN_FRACTION).map((cell) => cell.date),
    ambiguous: cells.filter(
      (cell) => cell.fraction >= AMBIGUOUS_FRACTION && cell.fraction < OPEN_FRACTION,
    ),
    band,
    grid: origin === CALIBRATED_GRID ? "calibrated" : "ocr",
  };
}

export function detectOpenDates(pixels, width, height, monthKey, options) {
  return inspectMonth(pixels, width, height, monthKey, options).dates;
}

/** Width/height straight from a PNG's IHDR header, so callers never have to probe the device. */
export function pngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (buffer.readUInt32BE(12) !== 0x49484452) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Recover the live day grid from the day numbers OCR already read off the screen.
 *
 * Returns base-layout geometry in the same shape as CALIBRATED_GRID, or null whenever the
 * words do not describe the expected calendar for `monthKey`. A null result means the caller
 * keeps using the calibrated grid, so this can only ever improve accuracy, never break it.
 */
export function fitGridOrigin(words, width, height, monthKey) {
  if (!Array.isArray(words) || !words.length || !width || !height) return null;
  const scaleX = width / BASE_WIDTH;
  const scaleY = height / BASE_HEIGHT;
  if (!(scaleX > 0) || !(scaleY > 0)) return null;

  const [year, month] = monthKey.split("-").map(Number);
  if (!/^\d{4}-\d{2}$/.test(monthKey) || !Number.isInteger(year) || !Number.isInteger(month)) return null;
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const byDay = new Map();
  for (const word of words) {
    if (!(word.confidence > 30)) continue;
    const value = Number(word.text);
    if (!Number.isInteger(value) || value < 1 || value > daysInMonth) continue;
    if (byDay.has(value)) continue;
    byDay.set(value, {
      value,
      x: (word.left + word.width / 2) / scaleX,
      y: (word.top + word.height / 2) / scaleY,
    });
  }
  if (byDay.size < 15) return null;

  const points = [...byDay.values()];
  const rows = cluster(points.map((point) => point.y), 60);
  if (rows.length < 4 || rows.length > 6) return null;

  const columns = cluster(points.map((point) => point.x), 76);
  if (columns.length !== 7) return null;

  const columnStep = (columns[6] - columns[0]) / 6;
  const rowStep = (rows[rows.length - 1] - rows[0]) / (rows.length - 1);
  if (!within(columnStep, CALIBRATED_GRID.columnStep, 0.35)) return null;
  if (!within(rowStep, CALIBRATED_GRID.rowStep, 0.35)) return null;
  if (!within(rowStep / columnStep, CALIBRATED_GRID.rowStep / CALIBRATED_GRID.columnStep, 0.25)) return null;

  const origin = { left: columns[0], columnStep, top: rows[0], rowStep };

  // The lattice only counts if it is *this month's* calendar: every day number must sit where
  // its own weekday position says it should.
  let fitting = 0;
  for (const point of points) {
    const cell = firstWeekday + point.value - 1;
    const expectedX = origin.left + origin.columnStep * (cell % 7);
    const expectedY = origin.top + origin.rowStep * Math.floor(cell / 7);
    if (Math.abs(point.x - expectedX) <= 45 && Math.abs(point.y - expectedY) <= 45) fitting += 1;
  }
  if (fitting / points.length < 0.7) return null;

  return origin;
}

function within(value, reference, tolerance) {
  return Math.abs(value - reference) <= reference * tolerance;
}

function cluster(values, minGap) {
  if (!values.length) return [];
  const sorted = [...values].sort((left, right) => left - right);
  const centers = [];
  let start = 0;
  for (let index = 1; index <= sorted.length; index += 1) {
    if (index === sorted.length || sorted[index] - sorted[index - 1] > minGap) {
      const slice = sorted.slice(start, index);
      centers.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
      start = index;
    }
  }
  return centers;
}
