const WATCHED_OFFICE_LABELS = [
  "CENTRAL OFFICE",
  "DMW PROCESSING CENTER",
  "MARINA-NCR",
];

export function isOfficeSelectorVisible(content) {
  if (content.includes("SELECT MARINA OFFICE")) return true;
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
