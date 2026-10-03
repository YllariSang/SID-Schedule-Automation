import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRuntimeConfig } from "./config.js";
import { ScheduleChecker } from "./checker.js";

const config = readRuntimeConfig();
const checker = new ScheduleChecker(config);
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/status") {
    return json(response, 200, checker.getStatus());
  }

  if (request.method === "POST" && url.pathname === "/api/check") {
    const status = await checker.check();
    return json(response, status.error ? 502 : 200, status);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { ok: true });
  }

  const asset = request.method === "GET" ? files.get(url.pathname) : null;
  if (!asset) return json(response, 404, { error: "Not found" });

  try {
    const body = await readFile(path.join(publicDir, asset[0]));
    response.writeHead(200, {
      "content-type": asset[1],
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(body);
  } catch {
    json(response, 500, { error: "Unable to load asset" });
  }
});

checker.on("changed", ({ changes }) => {
  console.log(`[MARINA] ${changes.length} schedule change(s) detected.`);
});
checker.on("check-error", ({ message }) => console.error(`[MARINA] ${message}`));
checker.on("webhook-error", ({ message }) => console.error(`[Webhook] ${message}`));

await checker.initialize();
server.listen(config.port, "127.0.0.1", () => {
  console.log(`MARINA OAS Watch is running at http://127.0.0.1:${config.port}`);
});

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}
