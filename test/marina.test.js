import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_SOURCE,
  buildVerifiedSnapshot,
  changedSchedules,
  isExactSnapshot,
} from "../src/marina.js";
import { INITIAL_VERIFIED_SNAPSHOT } from "../src/verified.js";
import { calendarCellCenter, detectOpenDates } from "../src/calendar.js";
import {
  isOfficeSelectorVisible,
  isTermsAgreementButtonVisible,
  shouldStopScanning,
} from "../src/watcher-state.js";

test("the bundled result uses only exact device-verified scope", () => {
  assert.equal(isExactSnapshot(INITIAL_VERIFIED_SNAPSHOT), true);
  assert.equal(INITIAL_VERIFIED_SNAPSHOT.source, DEVICE_SOURCE);
  assert.deepEqual(INITIAL_VERIFIED_SNAPSHOT.scope, {
    category: "Overseas",
    seafarerType: "Others",
    service: "Seafarer's Identity Document (SID)",
    serviceType: "New",
    checkThrough: "2026-12-31",
  });
  assert.equal(INITIAL_VERIFIED_SNAPSHOT.availableCount, 0);
});

test("rejects the obsolete public-feed snapshot", () => {
  assert.equal(
    isExactSnapshot({
      checkedAt: "2026-10-03T00:00:00Z",
      sourceUrl: "https://sidsrb.marina.gov.ph/",
      schedules: [],
    }),
    false,
  );
});

test("detects an opening recorded by a later device capture", () => {
  const schedules = INITIAL_VERIFIED_SNAPSHOT.schedules.map((item) =>
    item.id === "marina-ncr"
      ? { ...item, status: "available", openMonths: ["2026-11"] }
      : item,
  );
  const current = buildVerifiedSnapshot({
    checkedAt: "2026-10-03T08:00:00Z",
    schedules,
  });

  assert.deepEqual(changedSchedules(INITIAL_VERIFIED_SNAPSHOT, current).map(({ id }) => id), [
    "marina-ncr",
  ]);
});

test("detects a green calendar cell as its exact date", () => {
  const width = 1220;
  const height = 2712;
  const pixels = Buffer.alloc(width * height * 3, 255);
  const { x, y } = calendarCellCenter("2026-11", 11, width, height);
  const offset = (y * width + x) * 3;
  pixels[offset] = 190;
  pixels[offset + 1] = 220;
  pixels[offset + 2] = 145;

  assert.deepEqual(detectOpenDates(pixels, width, height, "2026-11"), ["2026-11-11"]);
});

test("does not mistake a red closed calendar cell for an opening", () => {
  const width = 1220;
  const height = 2712;
  const pixels = Buffer.alloc(width * height * 3, 255);
  const { x, y } = calendarCellCenter("2026-12", 7, width, height);
  const offset = (y * width + x) * 3;
  pixels[offset] = 233;
  pixels[offset + 1] = 149;
  pixels[offset + 2] = 147;

  assert.deepEqual(detectOpenDates(pixels, width, height, "2026-12"), []);
});

test("accepts a valid office selector when Central Office is scrolled off-screen", () => {
  assert.equal(
    isOfficeSelectorVisible("DMW PROCESSING CENTER MARINA-NCR PITX LA UNION BATANGAS"),
    true,
  );
  assert.equal(
    isOfficeSelectorVisible("SELECT MARINA SITE YOU WISH TO VISIT DMW PROCESSING CENTER"),
    false,
  );
});

test("recognizes the terms button despite OCR reading uppercase I as a bar", () => {
  assert.equal(
    isTermsAgreementButtonVisible("| AGREE TO THE TERMS & CONDITIONS OF THIS WEBSITE"),
    true,
  );
  assert.equal(
    isTermsAgreementButtonVisible("PLEASE READ AND AGREE TO THE TERMS AND CONDITIONS FOR THIS SERVICE"),
    false,
  );
});

test("stops scanning as soon as an office result contains an opening", () => {
  assert.equal(
    shouldStopScanning({ months: { "2026-10": [], "2026-11": ["2026-11-11"] } }),
    true,
  );
  assert.equal(
    shouldStopScanning({ months: { "2026-10": [], "2026-11": [], "2026-12": [] } }),
    false,
  );
});
