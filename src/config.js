export const SCOPE = Object.freeze({
  category: "Overseas",
  seafarerType: "Others",
  service: "Seafarer's Identity Document (SID)",
  serviceType: "New",
  checkThrough: "2026-12-31",
});

export const OFFICES = Object.freeze([
  {
    id: "central-office",
    name: "Central Office",
  },
  {
    id: "dmw-processing-center",
    name: "DMW Processing Center",
  },
  {
    id: "marina-ncr",
    name: "MARINA NCR",
  },
]);

export function readRuntimeConfig(env = process.env) {
  return {
    port: boundedNumber(env.PORT, 4173, 1, 65535),
    timeoutMs: boundedNumber(env.REQUEST_TIMEOUT_MS, 15_000, 2_000, 60_000),
    webhookUrl: env.WEBHOOK_URL?.trim() || null,
  };
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}
