import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const STATUS_FILE = path.join(DATA_DIR, "status.json");

export async function loadSnapshot() {
  try {
    return JSON.parse(await readFile(STATUS_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveSnapshot(snapshot) {
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = `${STATUS_FILE}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, STATUS_FILE);
}
