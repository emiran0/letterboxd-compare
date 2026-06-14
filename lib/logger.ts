import fs from "node:fs";
import path from "node:path";

const LOG_DIR = process.env.LOG_DIR ?? path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "compare.log");

export interface LogEntry {
  ts: string;
  ip: string;
  ua: string;
  url1: string;
  url2: string;
}

export function appendLog(entry: LogEntry): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Never let logging crash the request.
  }
}

export function readLogs(limit = 200): LogEntry[] {
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((l) => JSON.parse(l) as LogEntry);
  } catch {
    return [];
  }
}
