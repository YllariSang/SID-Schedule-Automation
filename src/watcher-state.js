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

/** Reuse a selected site only when it is the single office this watcher is checking. */
export function canReuseSelectedOfficeForm(content, officeId, watchedOfficeCount) {
  if (watchedOfficeCount !== 1 || isOfficeSelectorVisible(content)) return false;
  const expected = {
    "central-office": "CENTRAL OFFICE",
    "dmw-processing-center": "DMW PROCESSING CENTER",
    "marina-ncr": "MARINA-NCR",
  }[officeId];
  return Boolean(expected && content.includes(expected));
}

export function isTermsAgreementButtonVisible(content) {
  return (
    content.includes("AGREE TO THE TERMS & CONDITIONS OF THIS WEBSITE") ||
    content.includes("AGREE TO THE TERMS AND CONDITIONS OF THIS WEBSITE")
  );
}

/** Locate the exact agreement label, not an incidental "agree" in the page text. */
export function findTermsAgreementTapBox(words, screenHeight) {
  const tokens = words.flatMap((box) =>
    String(box.text).toUpperCase().match(/[A-Z]+|&/g)?.map((text) => ({ text, box })) ?? [],
  );
  const phrases = [
    ["AGREE", "TO", "THE", "TERMS", "&", "CONDITIONS", "OF", "THIS", "WEBSITE"],
    ["AGREE", "TO", "THE", "TERMS", "AND", "CONDITIONS", "OF", "THIS", "WEBSITE"],
  ];
  for (let start = 0; start < tokens.length; start += 1) {
    for (const phrase of phrases) {
      const candidate = tokens.slice(start, start + phrase.length);
      if (candidate.length !== phrase.length ||
          !candidate.every((token, index) => token.text === phrase[index])) continue;
      const boxes = candidate.map(({ box }) => box);
      const tops = boxes.map((box) => box.top);
      if (boxes.some((box) => box.confidence <= 20 || box.width <= 0 || box.height <= 0) ||
          Math.min(...tops) < screenHeight * 0.4 ||
          Math.max(...tops) - Math.min(...tops) > 160) continue;
      return boxes[0];
    }
  }
  return null;
}

export function shouldStopScanning(officeResult) {
  return (
    Boolean(officeResult?.requiresReview) ||
    Object.values(officeResult?.months || {}).some(
      (dates) => Array.isArray(dates) && dates.length > 0,
    )
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
