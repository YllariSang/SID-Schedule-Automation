import { OFFICES, SCOPE } from "./config.js";

export const DEVICE_SOURCE = "eGovPH MARINA OAS calendar";

export function buildVerifiedSnapshot({ checkedAt = new Date(), schedules }) {
  const normalized = OFFICES.map((office) => {
    const result = schedules.find((item) => item.id === office.id);
    if (!result) throw new Error(`Missing verified result for ${office.name}`);
    return { ...office, ...result };
  });

  return {
    schemaVersion: 2,
    checkedAt: new Date(checkedAt).toISOString(),
    source: DEVICE_SOURCE,
    sourceMethod: "device-assisted",
    scope: SCOPE,
    schedules: normalized,
    availableCount: normalized.filter((item) => item.status === "available").length,
  };
}

export function isExactSnapshot(snapshot) {
  return (
    snapshot?.schemaVersion === 2 &&
    snapshot.source === DEVICE_SOURCE &&
    snapshot.scope?.category === SCOPE.category &&
    snapshot.scope?.seafarerType === SCOPE.seafarerType &&
    snapshot.scope?.serviceType === SCOPE.serviceType &&
    Array.isArray(snapshot.schedules) &&
    OFFICES.every((office) => snapshot.schedules.some((item) => item.id === office.id))
  );
}

export function changedSchedules(previous, current) {
  if (!previous?.schedules) return [];
  const prior = new Map(previous.schedules.map((item) => [item.id, item]));
  return current.schedules.filter((item) => {
    const old = prior.get(item.id);
    return (
      old &&
      (old.status !== item.status ||
        JSON.stringify(old.openMonths || []) !== JSON.stringify(item.openMonths || []))
    );
  });
}
