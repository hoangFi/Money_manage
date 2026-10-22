import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { seed } from "./seed";
import type { DB } from "./types";

// Local JSON store. Good enough for a single-process demo.
const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "db.json");
export const EVIDENCE_DIR = join(DATA_DIR, "evidence");

export function loadDB(): DB {
  if (!existsSync(DB_PATH)) {
    const db = seed();
    saveDB(db);
    return db;
  }
  return JSON.parse(readFileSync(DB_PATH, "utf-8"));
}

export function saveDB(db: DB) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function resetDB() {
  saveDB(seed());
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
