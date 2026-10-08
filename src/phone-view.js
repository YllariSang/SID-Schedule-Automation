import { execFileSync, spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";

const port = Number(argumentValue("--port") ?? 4180);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be a number from 1 to 65535.");
}

const host = argumentValue("--host") ?? preferredLanAddress();
if (!host || !(host === "127.0.0.1" || isPrivateIpv4(host))) {
  throw new Error("No private LAN IPv4 address found. Pass --host=<your-computer-LAN-IP>.");
}

const devices = execFileSync("adb", ["devices"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.match(/^([^\s]+)\s+device(?:\s|$)/)?.[1])
  .filter(Boolean);
if (devices.length !== 1) {
  throw new Error(`Expected one authorized ADB phone; found ${devices.length}.`);
}
const deviceSerial = devices[0];
const token = randomBytes(16).toString("hex");
const tokenBytes = Buffer.from(token, "hex");
const viewers = new Set();
let capture = null;
let stopTimer = null;

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (request.method !== "GET" || !authorized(url.searchParams.get("token"))) {
    return reply(response, 404, "Not found");
  }

  if (url.pathname === "/") {
    response.writeHead(200, headers("text/html; charset=utf-8"));
    response.end(page(token));
    return;
  }
  if (url.pathname !== "/stream") return reply(response, 404, "Not found");

  response.writeHead(200, headers("multipart/x-mixed-replace; boundary=frame"));
  viewers.add(response);
  response.on("close", () => {
    viewers.delete(response);
    if (viewers.size === 0) {
      stopTimer = setTimeout(() => stopCapture(), 5000);
    }
  });
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  if (!capture) startCapture();
});

server.listen(port, host, () => {
  console.log(`Read-only phone view: http://${host}:${port}/?token=${token}`);
  console.log(`Streaming ${deviceSerial} only while a viewer is connected. Press Ctrl+C to stop.`);
});
server.on("error", (error) => {
  console.error(`Phone view server: ${error.message}`);
  stopCapture();
  process.exitCode = 1;
});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function startCapture() {
  const command = [
    'scrcpy -V error --serial="$1" --no-window --no-control --no-audio --no-power-on',
    '--record=/dev/stdout --record-format=mkv --max-size=1080 --max-fps=8',
    '| ffmpeg -hide_banner -loglevel error -i pipe:0 -an -vf fps=4',
    '-c:v mjpeg -q:v 4 -f mpjpeg -boundary_tag frame pipe:1',
  ].join(" ");
  const pipeline = spawn("bash", ["-o", "pipefail", "-c", command, "phone-view", deviceSerial], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const current = { pipeline, error: "" };
  capture = current;
  pipeline.stderr.on("data", (chunk) => {
    current.error = tail(current.error + chunk, 2000);
  });
  pipeline.stdout.on("data", (chunk) => {
    for (const viewer of viewers) {
      if (viewer.writableLength > 1024 * 1024) viewer.destroy();
      else viewer.write(chunk);
    }
  });
  pipeline.on("error", (error) => failCapture(current, error.message));
  pipeline.on("exit", () => failCapture(current, current.error || "video pipeline stopped"));
}

function failCapture(current, reason) {
  if (capture !== current) return;
  console.error(`Phone stream ended: ${reason.trim()}`);
  stopCapture();
  for (const viewer of viewers) viewer.end();
  viewers.clear();
}

function stopCapture() {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  if (!capture) return;
  const current = capture;
  capture = null;
  try {
    process.kill(-current.pipeline.pid, "SIGTERM");
  } catch {
    // The capture pipeline may already have exited.
  }
}

function shutdown() {
  stopCapture();
  for (const viewer of viewers) viewer.end();
  viewers.clear();
  server.close();
}

function authorized(value) {
  return Boolean(
    value && /^[0-9a-f]{32}$/.test(value) &&
    timingSafeEqual(Buffer.from(value, "hex"), tokenBytes),
  );
}

function headers(contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store, no-cache, must-revalidate",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  };
}

function reply(response, status, message) {
  response.writeHead(status, headers("text/plain; charset=utf-8"));
  response.end(message);
}

function page(accessToken) {
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live MARINA phone view</title>
<style>
  body { margin: 0; background: #111827; color: #f9fafb; font: 16px system-ui, sans-serif; text-align: center; }
  header { padding: 14px 10px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0; color: #d1d5db; font-size: 13px; }
  img { display: block; margin: 0 auto; max-width: 100%; max-height: calc(100dvh - 78px); object-fit: contain; }
</style>
<header><h1>Live phone view</h1><p>Read-only · no audio · refresh if the connection stops</p></header>
<img src="/stream?token=${accessToken}" alt="Live phone screen">
</html>`;
}

function preferredLanAddress() {
  const candidates = Object.entries(networkInterfaces())
    .filter(([name]) => !/^(?:docker|br-|veth|tailscale|tun|wg)/.test(name))
    .flatMap(([, addresses]) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal && isPrivateIpv4(address.address));
  return candidates[0]?.address;
}

function isPrivateIpv4(value) {
  const parts = String(value).split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

function argumentValue(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function tail(value, length) {
  return String(value).slice(-length);
}
