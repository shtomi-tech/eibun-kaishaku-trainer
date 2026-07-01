import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const sourcePath = process.argv[2];
const targetPath = process.argv[3] || "data/eiken2-2026-1.json";

if (!sourcePath) {
  console.error("Usage: node tools/apply-editor-json.mjs <editor-json> [target-json]");
  process.exit(1);
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const target = JSON.parse(await readFile(targetPath, "utf8"));

const removedIds = new Set(source.meta?.removedItemIds || []);
const touched = [];
let updated = 0;
let added = 0;
let removed = 0;

if (removedIds.size) {
  const before = target.items.length;
  target.items = target.items.filter((item) => !removedIds.has(item.id));
  removed = before - target.items.length;
}

const refreshedById = new Map((target.items || []).map((item, index) => [item.id, index]));
for (const item of source.items || []) {
  const nextItem = JSON.parse(JSON.stringify(item));
  delete nextItem.editNote;
  if (nextItem.status === "ready") delete nextItem.status;
  if (refreshedById.has(nextItem.id)) {
    target.items[refreshedById.get(nextItem.id)] = nextItem;
    updated += 1;
  } else {
    target.items.push(nextItem);
    refreshedById.set(nextItem.id, target.items.length - 1);
    added += 1;
  }
  touched.push(nextItem.id);
}

target.meta = {
  ...target.meta,
  lastEditedFrom: sourcePath,
  lastEditedAt: new Date().toISOString(),
};

await writeFile(targetPath, `${JSON.stringify(target, null, 2)}\n`, "utf8");

const ready = target.items.filter((item) => item.status !== "editing").length;
const editing = target.items.filter((item) => item.status === "editing").length;
console.log(JSON.stringify({
  source: basename(sourcePath),
  target: targetPath,
  updated,
  added,
  removed,
  total: target.items.length,
  ready,
  editing,
  touched,
  removedItemIds: [...removedIds],
}, null, 2));
