import { buildVerifiedSnapshot } from "./marina.js";

export const INITIAL_VERIFIED_SNAPSHOT = buildVerifiedSnapshot({
  checkedAt: "2026-10-03T07:13:21.000Z",
  schedules: [
    {
      id: "central-office",
      status: "unavailable",
      openMonths: [],
      checkedMonths: ["2026-10", "2026-11", "2026-12"],
      checkedRange: "October 3–December 31, 2026",
      evidence: "October, November, and December calendars showed no green/open dates.",
    },
    {
      id: "dmw-processing-center",
      status: "unavailable",
      openMonths: [],
      checkedMonths: ["2026-11", "2026-12"],
      checkedRange: "October 3–December 31, 2026",
      evidence:
        "The eGov calendar began in November; November and December showed no green/open dates.",
    },
    {
      id: "marina-ncr",
      status: "unavailable",
      openMonths: [],
      checkedMonths: ["2026-10", "2026-11", "2026-12"],
      checkedRange: "October 3–December 31, 2026",
      evidence: "October, November, and December calendars showed no green/open dates.",
    },
  ],
});
