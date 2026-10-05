import { CALIBRATED_GRID, cellBox } from "../src/calendar.js";

export const WIDTH = 1220;
export const HEIGHT = 2712;
export const OPEN_COLOR = [190, 220, 145];
export const DIGIT_COLOR = [40, 40, 40];

function cellPixels(monthKey, day) {
  return cellBox(monthKey, day, WIDTH, HEIGHT, CALIBRATED_GRID);
}

function paint(pixels, box, color) {
  for (let y = box.top; y < box.top + box.height; y += 1) {
    let offset = (y * WIDTH + box.left) * 3;
    for (let x = 0; x < box.width; x += 1) {
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      offset += 3;
    }
  }
}

/** Fill one day cell the way a rendered "available" cell looks: solid green. */
export function fillCell(pixels, monthKey, day, color = OPEN_COLOR) {
  return fillCellWithOrigin(pixels, monthKey, day, CALIBRATED_GRID, color);
}

/** Fill a day cell using an explicit grid, for simulating a scrolled calendar. */
export function fillCellWithOrigin(pixels, monthKey, day, origin, color = OPEN_COLOR) {
  paint(pixels, cellBox(monthKey, day, WIDTH, HEIGHT, origin), color);
  return pixels;
}

/**
 * Draw the day number through the middle of a cell. Real cells have a glyph sitting exactly
 * where a single-pixel sampler would look, which is the case the old detector could not see.
 */
export function drawDigit(pixels, monthKey, day, color = DIGIT_COLOR) {
  const box = cellPixels(monthKey, day);
  const bar = {
    left: box.left + Math.floor(box.width * 0.4),
    top: box.top + Math.floor(box.height * 0.2),
    width: Math.max(4, Math.floor(box.width * 0.2)),
    height: Math.max(4, Math.floor(box.height * 0.6)),
  };
  paint(pixels, bar, color);
  return pixels;
}

/** Paint one stray pixel, as anti-aliasing or a neighbour's border might leave behind. */
export function speck(pixels, monthKey, day, color = OPEN_COLOR) {
  const box = cellPixels(monthKey, day);
  const offset = ((box.top + Math.floor(box.height / 2)) * WIDTH + (box.left + Math.floor(box.width / 2))) * 3;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  return pixels;
}

/** Fill an arbitrary rectangle, in base-layout coordinates. */
export function fillRegion(pixels, left, top, width, height, color = OPEN_COLOR) {
  paint(pixels, { left, top, width, height }, color);
  return pixels;
}

/**
 * Day-number word boxes as OCR would return them for a visible month grid.
 * `grid` lets a test describe a layout that differs from the calibrated one.
 */
export function monthWords(monthKey, grid = CALIBRATED_GRID, options = {}) {
  const confidence = options.confidence ?? 80;
  const jitter = options.jitter ?? 0;
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const words = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = firstWeekday + day - 1;
    const offset = jitter ? (day % 2 ? jitter : -jitter) : 0;
    const centerX = grid.left + grid.columnStep * (cell % 7) + offset;
    const centerY = grid.top + grid.rowStep * Math.floor(cell / 7) - offset;
    words.push({
      text: String(day),
      left: Math.round(centerX - 12),
      top: Math.round(centerY - 20),
      width: 24,
      height: 40,
      confidence,
    });
  }
  return words;
}
