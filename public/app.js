const grid = document.querySelector("#schedule-grid");
const updatedAt = document.querySelector("#updated-at");
const errorBanner = document.querySelector("#error-banner");
const checkButton = document.querySelector("#check-button");
const alertsButton = document.querySelector("#alerts-button");
let priorState = null;

checkButton.addEventListener("click", () => refresh(true));
alertsButton.addEventListener("click", enableNotifications);
updateNotificationButton();
await refresh(false);
setInterval(() => refresh(false), 60_000);

async function refresh(force) {
  setChecking(true);
  try {
    const response = await fetch(force ? "/api/check" : "/api/status", {
      method: force ? "POST" : "GET",
    });
    const status = await response.json();
    render(status);
  } catch (error) {
    showError(`The local checker could not be reached: ${error.message}`);
  } finally {
    setChecking(false);
  }
}

function render(status) {
  if (status.error) showError(`Last check failed: ${status.error.message}`);
  else hideError();

  if (!status.snapshot) return;
  notifyOnChanges(status.snapshot);
  priorState = status.snapshot;

  updatedAt.textContent = `Device-verified ${relativeTime(status.snapshot.checkedAt)} · cutoff December 31`;
  grid.innerHTML = status.snapshot.schedules.map(cardTemplate).join("");
}

function cardTemplate(item, index) {
  const open = item.openMonths?.length > 0;
  const labels = {
    available: "Opening seen",
    unavailable: "No open dates",
    unknown: "Needs scan",
  };

  return `<article class="schedule-card ${escapeHtml(item.status)}">
    <div class="schedule-card-head">
      <span class="office-number">0${index + 1}</span>
      <span class="status-pill ${escapeHtml(item.status)}">${labels[item.status] || "Unknown"}</span>
    </div>
    <h3 class="office-name">${escapeHtml(item.name)}</h3>
    <div class="source-note">Exact eGovPH calendar · device-assisted</div>
    <p class="date-label">Checked window</p>
    <div class="schedule-date">${escapeHtml(item.checkedRange)}</div>
    <p class="schedule-message">${escapeHtml(
      open
        ? `Open calendar cells detected in ${item.openMonths.join(", ")}. Check the phone for the exact date.`
        : item.evidence,
    )}</p>
  </article>`;
}

function notifyOnChanges(snapshot) {
  if (!priorState || Notification.permission !== "granted") return;
  const oldById = new Map(priorState.schedules.map((item) => [item.id, item]));
  for (const item of snapshot.schedules) {
    const old = oldById.get(item.id);
    if (
      old &&
      (old.status !== item.status ||
        JSON.stringify(old.openMonths || []) !== JSON.stringify(item.openMonths || []))
    ) {
      new Notification(`MARINA schedule changed: ${item.name}`, {
        body: item.openMonths?.length
          ? `An opening is visible in ${item.openMonths.join(", ")}.`
          : "No open dates are visible through December.",
      });
    }
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showError("This browser does not support desktop notifications.");
    return;
  }
  await Notification.requestPermission();
  updateNotificationButton();
}

function updateNotificationButton() {
  if (!("Notification" in window)) {
    alertsButton.textContent = "Alerts unavailable";
    alertsButton.disabled = true;
  } else if (Notification.permission === "granted") {
    alertsButton.textContent = "Alerts enabled ✓";
  } else if (Notification.permission === "denied") {
    alertsButton.textContent = "Alerts blocked";
  }
}

function setChecking(value) {
  checkButton.disabled = value;
  checkButton.classList.toggle("is-checking", value);
  checkButton.lastChild.textContent = value ? " Reloading…" : " Reload results";
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
}

function relativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  return formatter.format(Math.round(seconds / 60), "minute");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
