const WATCHED_OFFICE_LABELS = [
  "CENTRAL OFFICE",
  "DMW PROCESSING CENTER",
  "MARINA-NCR",
];

/**
 * The open office list is proven by its option labels. The closed form also reads
 * "Select MARINA Office", so that placeholder cannot be used as proof: trusting it made the
 * watcher swipe a list that had not rendered yet, which cancelled it, and then give up.
 */
export function isOfficeSelectorVisible(content) {
  return WATCHED_OFFICE_LABELS.filter((label) => content.includes(label)).length >= 2;
}

export function isTermsAgreementButtonVisible(content) {
  return (
    content.includes("AGREE TO THE TERMS & CONDITIONS OF THIS WEBSITE") ||
    content.includes("AGREE TO THE TERMS AND CONDITIONS OF THIS WEBSITE")
  );
}

export function shouldStopScanning(officeResult) {
  return Object.values(officeResult?.months || {}).some(
    (dates) => Array.isArray(dates) && dates.length > 0,
  );
}

/**
 * What the calendar return path does next. eGovPH sometimes opens the Gender Equality
 * Disclaimer sheet over the form straight after Back, and that sheet has no Back button,
 * so scrolling for one would burn every attempt — closing it comes before navigation.
 * `backWord` is the Back word found on this screen, or a falsy value when none was read.
 */
export function returnToFormStep(state, backWord) {
  if (state === "form") return "done";
  if (state === "disclaimer") return "close-disclaimer";
  return backWord ? "tap-back" : "scroll";
}
