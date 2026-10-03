import { isExactSnapshot } from "./marina.js";
import { loadSnapshot } from "./store.js";
import { INITIAL_VERIFIED_SNAPSHOT } from "./verified.js";

const saved = await loadSnapshot();
const snapshot = isExactSnapshot(saved) ? saved : INITIAL_VERIFIED_SNAPSHOT;

console.log(`Exact source: ${snapshot.source}`);
console.log(`Verified: ${snapshot.checkedAt}`);
console.log(`Cutoff: ${snapshot.scope.checkThrough}`);
for (const item of snapshot.schedules) {
  const result = item.openMonths.length
    ? `open dates visible in ${item.openMonths.join(", ")}`
    : "no open dates through cutoff";
  console.log(`${item.name}: ${result}`);
}
