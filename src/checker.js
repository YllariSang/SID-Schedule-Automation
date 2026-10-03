import { EventEmitter } from "node:events";
import { changedSchedules, isExactSnapshot } from "./marina.js";
import { loadSnapshot, saveSnapshot } from "./store.js";
import { INITIAL_VERIFIED_SNAPSHOT } from "./verified.js";

export class ScheduleChecker extends EventEmitter {
  #config;
  #snapshot = null;
  #error = null;
  #checking = false;

  constructor(config) {
    super();
    this.#config = config;
  }

  async initialize() {
    const saved = await loadSnapshot();
    this.#snapshot = isExactSnapshot(saved) ? saved : INITIAL_VERIFIED_SNAPSHOT;
    if (saved !== this.#snapshot) await saveSnapshot(this.#snapshot);
  }

  getStatus() {
    return {
      snapshot: this.#snapshot,
      error: this.#error,
      checking: this.#checking,
      mode: "device-assisted",
      automaticRefresh: false,
      refreshNote:
        "A new exact scan needs an active eGovPH MARINA session on the connected phone.",
    };
  }

  async check() {
    if (this.#checking) return this.getStatus();
    this.#checking = true;
    this.emit("checking");

    try {
      const saved = await loadSnapshot();
      if (isExactSnapshot(saved)) {
        const changes = changedSchedules(this.#snapshot, saved);
        this.#snapshot = saved;
        this.#error = null;
        if (changes.length) {
          this.emit("changed", { snapshot: saved, changes });
          await this.#sendWebhook(saved, changes);
        }
      }
    } catch (error) {
      this.#error = {
        message: error.message,
        at: new Date().toISOString(),
      };
      this.emit("check-error", this.#error);
    } finally {
      this.#checking = false;
      this.emit("complete", this.getStatus());
    }

    return this.getStatus();
  }

  async #sendWebhook(snapshot, changes) {
    if (!this.#config.webhookUrl) return;

    try {
      const response = await fetch(this.#config.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "marina.schedule.changed",
          scope: snapshot.scope,
          checkedAt: snapshot.checkedAt,
          changes,
        }),
        signal: AbortSignal.timeout(this.#config.timeoutMs),
      });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    } catch (error) {
      this.emit("webhook-error", { message: error.message });
    }
  }
}
