const BASE_WIDTH = 1220;
const BASE_HEIGHT = 2712;

export function calendarCellCenter(monthKey, day, width = BASE_WIDTH, height = BASE_HEIGHT) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!/^\d{4}-\d{2}$/.test(monthKey) || day < 1 || day > daysInMonth) {
    throw new Error(`Invalid calendar date ${monthKey}-${day}`);
  }
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cell = firstWeekday + day - 1;
  return {
    x: Math.round((148 + 153.5 * (cell % 7)) * (width / BASE_WIDTH)),
    y: Math.round((1605 + 106.5 * Math.floor(cell / 7)) * (height / BASE_HEIGHT)),
  };
}

export function detectOpenDates(pixels, width, height, monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const expectedBytes = width * height * 3;
  if (pixels.length < expectedBytes) throw new Error("RGB screenshot buffer is incomplete.");

  const openDates = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const { x, y } = calendarCellCenter(monthKey, day, width, height);
    const offset = (y * width + x) * 3;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    if (green > red + 8 && green > blue + 15 && red > 115 && green > 150 && blue < 205) {
      openDates.push(`${monthKey}-${String(day).padStart(2, "0")}`);
    }
  }
  return openDates;
}
