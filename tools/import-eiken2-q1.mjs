import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const targetPath = join(root, "data", "eiken2-2026-1.json");
const appData = join(root, "..", "英検2級_大問1アプリ", "data");

// 英検2級・準2級の大問1をまとめて取り込む。level で級を区別する。
const SOURCES = [
  {
    level: "2級",
    file: join(appData, "questions_2026-1.json"),
    idPrefix: "eiken2-2026-1",
    sourceLabel: "英検2級 2026年度第1回 大問1",
    from: "英語/英検2級_大問1アプリ/data/questions_2026-1.json",
  },
  {
    level: "準2級",
    file: join(appData, "questions_p2_2026-1.json"),
    idPrefix: "eiken-p2-2026-1",
    sourceLabel: "英検準2級 2026年度第1回 大問1",
    from: "英語/英検2級_大問1アプリ/data/questions_p2_2026-1.json",
  },
];

const target = JSON.parse(await readFile(targetPath, "utf8"));
// 既存アイテムはそのまま維持する（先生が削除・編集済みの構成を壊さない）。
// 既に取り込み済みの級（idPrefix が一致するアイテムがある級）は再生成しない。
const existingItems = (target.items || []).slice();
const existingPrefixes = new Set(
  existingItems
    .map((item) => String(item.id).replace(/_q\d+_s\d+$/, ""))
    .filter(Boolean),
);

function levelForId(id) {
  return String(id).startsWith("eiken-p2") ? "準2級" : "2級";
}
// 既存アイテムに level を補完する。
for (const item of existingItems) {
  if (!item.level) item.level = levelForId(item.id);
}

function completeStem(question) {
  const answer = question.choices[question.answerIndex];
  return question.stem.replace(/\(\s*\)/g, answer);
}

function splitSentences(text) {
  const protectedText = text
    .replace(/\bMr\./g, "Mr<dot>")
    .replace(/\bMrs\./g, "Mrs<dot>")
    .replace(/\bMs\./g, "Ms<dot>")
    .replace(/\bDr\./g, "Dr<dot>");

  return protectedText
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .map((sentence) => sentence.replaceAll("<dot>", "."))
    .filter(Boolean);
}

function draftItem(source, question, sentence, index) {
  const id = `${source.idPrefix}_q${question.q}_s${index + 1}`;
  return {
    id,
    status: "editing",
    level: source.level,
    source: `${source.sourceLabel} Q${question.q} / sentence ${index + 1}`,
    sentence,
    translation: question.translation,
    editNote: "編集待ち: Codexまたは先生エディタでchunk/role/translationを確定してください。",
    root: {
      chunks: [
        {
          role: "M",
          text: sentence,
          translation: "",
        },
      ],
    },
  };
}

const importedItems = existingItems.slice();
for (const source of SOURCES) {
  if (existingPrefixes.has(source.idPrefix)) {
    // 既に取り込み済みの級は先生の構成を尊重してスキップ。
    continue;
  }
  const data = JSON.parse(await readFile(source.file, "utf8"));
  for (const question of data.questions || []) {
    splitSentences(completeStem(question)).forEach((sentence, index) => {
      importedItems.push(draftItem(source, question, sentence, index));
    });
  }
}

target.meta = {
  ...target.meta,
  label: "英検2級・準2級 2026年度第1回",
  source: "英検2級・準2級 2026年度第1回 大問1",
  importedFrom: SOURCES.map((s) => s.from),
  importedAt: new Date().toISOString(),
  note: "英検2級・準2級 大問1の保存済み問題を完全文化して文単位で取り込み。level で級を区別、status=editing は編集待ち。",
};
target.items = importedItems;

await writeFile(targetPath, `${JSON.stringify(target, null, 2)}\n`, "utf8");

const summary = {};
for (const item of importedItems) {
  const level = item.level || "2級";
  const status = item.status === "editing" ? "editing" : "ready";
  summary[level] = summary[level] || { ready: 0, editing: 0 };
  summary[level][status] += 1;
}
console.log(`Imported ${importedItems.length} sentences`);
console.log(JSON.stringify(summary, null, 2));
