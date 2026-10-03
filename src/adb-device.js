import { execFileSync } from "node:child_process";

export const EGOV_PACKAGE = "egov.app";
export const CALIBRATED_WIDTH = 1220;
export const CALIBRATED_HEIGHT = 2712;
export const CALIBRATED_DENSITY = 480;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function parseAdbDevices(output) {
  return String(output)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state = "unknown", ...details] = line.split(/\s+/);
      return { serial, state, details: details.join(" ") };
    });
}

export function selectAdbDevice(devices, { mode = "adb", serial } = {}) {
  if (serial) {
    const selected = devices.find((device) => device.serial === serial);
    if (!selected) throw new Error(`ADB device ${serial} was not found.`);
    if (selected.state !== "device") {
      throw new Error(`ADB device ${serial} is ${selected.state}; authorize it before running the watcher.`);
    }
    return selected;
  }

  const ready = devices.filter((device) => device.state === "device");
  if (mode === "waydroid") {
    const marked = ready.filter((device) => /waydroid/i.test(`${device.serial} ${device.details}`));
    if (marked.length === 1) return marked[0];

    const network = ready.filter((device) => device.serial.includes(":"));
    if (network.length === 1) return network[0];

    const unauthorized = devices.find(
      (device) => device.state === "unauthorized" && (device.serial.includes(":") || /waydroid/i.test(device.details)),
    );
    if (unauthorized) {
      throw new Error("Waydroid is waiting for ADB authorization. Accept the debugging prompt in Waydroid, then retry.");
    }
    throw new Error(`Expected one connected Waydroid ADB device; found ${marked.length || network.length}.`);
  }

  if (ready.length !== 1) {
    throw new Error(`Expected one authorized ADB device; found ${ready.length}. Use --serial=<id> when more than one is connected.`);
  }
  return ready[0];
}

export function parseDisplaySize(output) {
  const value = String(output);
  const override = value.match(/Override size:\s*(\d+)x(\d+)/i);
  const physical = value.match(/Physical size:\s*(\d+)x(\d+)/i);
  const match = override || physical;
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

export function extractPng(output) {
  const value = Buffer.isBuffer(output) ? output : Buffer.from(output);
  const start = value.indexOf(PNG_SIGNATURE);
  if (start < 0) throw new Error("Android screenshot output did not contain a PNG image.");
  return value.subarray(start);
}

export function assertWaydroidRunning(run = runText) {
  let status;
  try {
    status = run("waydroid", ["status"]);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Waydroid is not installed.");
    throw error;
  }
  if (!/^Session:\s*RUNNING\s*$/im.test(status)) {
    throw new Error("Waydroid is not running. Start it with `waydroid show-full-ui`, then retry.");
  }
}

export function connectWaydroidAdb(run = runText) {
  assertWaydroidRunning(run);
  try {
    run("waydroid", ["adb", "connect"]);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("ADB is not installed. Install the host `adb` package before using Waydroid mode.");
    }
    const networkHint = /Unknown container IP address/i.test(error.message)
      ? " If `waydroid status` shows IP address UNKNOWN, check the documented host-firewall rules."
      : "";
    throw new Error(`Could not connect ADB to Waydroid: ${error.message}${networkHint}`);
  }
}

export function runText(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 5 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.code === "ENOENT") throw error;
    const detail = String(error.stderr || error.stdout || error.message).trim();
    throw new Error(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
}
