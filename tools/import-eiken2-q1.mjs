import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "..", "英検2級_大問1アプリ", "data", "questions_2026-1.json");
const targetPath = join(root, "data", "eiken2-2026-1.json");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const target = JSON.parse(await readFile(targetPath, "utf8"));
const readyById = new Map((target.items || [])
  .filter((item) => item.status !== "editing")
  .map((item) => [item.id, { ...item, status: item.status || "ready" }]));

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

function draftItem(question, sentence, index) {
  const id = `eiken2-2026-1_q${question.q}_s${index + 1}`;
  if (readyById.has(id)) return readyById.get(id);
  return {
    id,
    status: "editing",
    source: `英検2級 2026年度第1回 大問1 Q${question.q} / sentence ${index + 1}`,
    sentence,
    translation: question.translation,
    editNote: "編集待ち: Codexまたは先生エディタでchunk/role/translationを確定してください。",
    root: {
      chunks: [
        {
          role: "M",
          text: sentence,
          translation: ""
        }
      ]
    }
  };
}

const importedItems = [];
for (const question of source.questions || []) {
  splitSentences(completeStem(question)).forEach((sentence, index) => {
    importedItems.push(draftItem(question, sentence, index));
  });
}

target.meta = {
  ...target.meta,
  importedFrom: "英語/英検2級_大問1アプリ/data/questions_2026-1.json",
  importedAt: new Date().toISOString(),
  note: "英検2級 大問1の保存済み問題を完全文化して文単位で取り込み。status=editing は編集待ち。"
};
target.items = importedItems;

await writeFile(targetPath, `${JSON.stringify(target, null, 2)}\n`, "utf8");

const ready = importedItems.filter((item) => item.status !== "editing").length;
const editing = importedItems.filter((item) => item.status === "editing").length;
console.log(`Imported ${importedItems.length} sentences: ready=${ready}, editing=${editing}`);
