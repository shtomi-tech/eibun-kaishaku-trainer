"use strict";

const ROLES = ["S", "V", "O", "C", "M"];
const SENTENCE_PATTERNS = [
  { id: "SV", label: "第1文型 SV" },
  { id: "SVC", label: "第2文型 SVC" },
  { id: "SVO", label: "第3文型 SVO" },
  { id: "SVOO", label: "第4文型 SVOO" },
  { id: "SVOC", label: "第5文型 SVOC" },
  { id: "special", label: "その他・特殊構文" },
];
const STORE_PREFIX = "reading_trainer_v1";
const DEFAULT_STUDENT = "default";

const state = {
  manifest: { datasets: [] },
  datasetId: "",
  dataset: null,
  studentName: loadPreferredStudent(),
  progress: null,
  mode: "player",
  playerFilter: "all",
  session: null,
  interpretation: null,
  editor: defaultEditorState(),
};

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return node;
}

function defaultProgress() {
  return {
    clearedItemIds: [],
    needsReviewItemIds: [],
    itemAttempts: {},
    mistakes: {},
    roleStats: {},
    interpretationClearedItemIds: [],
    interpretationAttempts: {},
    lastItemId: "",
  };
}

function defaultEditorState() {
  return {
    datasetId: "custom-reading-set",
    datasetLabel: "自作 英文解釈",
    source: "手入力",
    itemId: `custom_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
    status: "ready",
    sentence: "",
    chunks: [],
    selectedChunk: -1,
    savedItems: [],
    removedItemIds: [],
    editNote: "",
    rawJson: "",
  };
}

function normalizeStudentName(name) {
  const trimmed = (name || "").trim();
  return trimmed || DEFAULT_STUDENT;
}

function studentLabel() {
  return normalizeStudentName(state.studentName);
}

function loadPreferredStudent() {
  try {
    return localStorage.getItem("reading_trainer_student") || "";
  } catch (e) {
    return "";
  }
}

function savePreferredStudent() {
  try {
    localStorage.setItem("reading_trainer_student", state.studentName || "");
  } catch (e) {
    /* ignore */
  }
}

function progressKey(datasetId = state.datasetId, studentName = state.studentName) {
  return `${STORE_PREFIX}::${datasetId}::${normalizeStudentName(studentName)}`;
}

function loadProgress() {
  if (!state.datasetId) return defaultProgress();
  try {
    const raw = localStorage.getItem(progressKey());
    if (raw) return normalizeProgress(JSON.parse(raw));
  } catch (e) {
    /* ignore */
  }
  return defaultProgress();
}

function normalizeProgress(progress) {
  const base = { ...defaultProgress(), ...(progress || {}) };
  if (!Array.isArray(base.clearedItemIds)) base.clearedItemIds = [];
  if (!Array.isArray(base.needsReviewItemIds)) base.needsReviewItemIds = [];
  if (!Array.isArray(base.interpretationClearedItemIds)) base.interpretationClearedItemIds = [];
  if (!base.itemAttempts || typeof base.itemAttempts !== "object") base.itemAttempts = {};
  if (!base.interpretationAttempts || typeof base.interpretationAttempts !== "object") base.interpretationAttempts = {};
  if (!base.mistakes || typeof base.mistakes !== "object") base.mistakes = {};
  if (!base.roleStats || typeof base.roleStats !== "object") base.roleStats = {};
  for (const role of ROLES) {
    if (!base.roleStats[role]) base.roleStats[role] = { correct: 0, wrong: 0 };
    if (typeof base.roleStats[role].correct !== "number") base.roleStats[role].correct = 0;
    if (typeof base.roleStats[role].wrong !== "number") base.roleStats[role].wrong = 0;
  }
  for (const [itemId, att] of Object.entries(base.itemAttempts)) {
    base.itemAttempts[itemId] = normalizeAttempt(att);
    if (base.itemAttempts[itemId].wrong > 0 && !base.needsReviewItemIds.includes(itemId)) {
      base.needsReviewItemIds.push(itemId);
    }
  }
  const hasRoleStats = ROLES.some((role) => base.roleStats[role].correct > 0 || base.roleStats[role].wrong > 0);
  if (!hasRoleStats) {
    for (const role of ROLES) {
      const wrongCount = Object.values(base.mistakes[role] || {}).reduce((sum, count) => sum + count, 0);
      base.roleStats[role].wrong = wrongCount;
    }
  }
  return base;
}

function normalizeAttempt(attempt) {
  const att = { ...(attempt || {}) };
  if (typeof att.attempts !== "number") att.attempts = 0;
  if (typeof att.wrong !== "number") att.wrong = 0;
  if (typeof att.correct !== "number") att.correct = 0;
  if (typeof att.cleanClears !== "number") att.cleanClears = 0;
  if (typeof att.reviewClears !== "number") att.reviewClears = 0;
  if (typeof att.lastResult !== "string") att.lastResult = "";
  if (typeof att.lastAt !== "string") att.lastAt = "";
  if (!att.roleWrong || typeof att.roleWrong !== "object") att.roleWrong = {};
  if (!att.roleCorrect || typeof att.roleCorrect !== "object") att.roleCorrect = {};
  return att;
}

function saveProgress() {
  try {
    localStorage.setItem(progressKey(), JSON.stringify(state.progress));
  } catch (e) {
    /* ignore */
  }
}

function itemAttempt(itemId) {
  if (!state.progress.itemAttempts[itemId]) {
    state.progress.itemAttempts[itemId] = normalizeAttempt({});
  }
  state.progress.itemAttempts[itemId] = normalizeAttempt(state.progress.itemAttempts[itemId]);
  return state.progress.itemAttempts[itemId];
}

function roleStat(role) {
  if (!state.progress.roleStats[role]) {
    state.progress.roleStats[role] = { correct: 0, wrong: 0 };
  }
  if (typeof state.progress.roleStats[role].correct !== "number") state.progress.roleStats[role].correct = 0;
  if (typeof state.progress.roleStats[role].wrong !== "number") state.progress.roleStats[role].wrong = 0;
  return state.progress.roleStats[role];
}

function isCleared(itemId) {
  return state.progress.clearedItemIds.includes(itemId);
}

function isInterpretationCleared(itemId) {
  return state.progress.interpretationClearedItemIds.includes(itemId);
}

function isReviewNeeded(itemId) {
  return state.progress.needsReviewItemIds.includes(itemId);
}

function addReviewItem(itemId) {
  if (!isReviewNeeded(itemId)) state.progress.needsReviewItemIds.push(itemId);
}

function removeReviewItem(itemId) {
  state.progress.needsReviewItemIds = state.progress.needsReviewItemIds.filter((id) => id !== itemId);
}

function interpretationAttempt(itemId) {
  if (!state.progress.interpretationAttempts[itemId]) {
    state.progress.interpretationAttempts[itemId] = { attempts: 0, lastAt: "", lastScore: null };
  }
  return state.progress.interpretationAttempts[itemId];
}

function markInterpretationComplete(itemId, score) {
  if (!isInterpretationCleared(itemId)) state.progress.interpretationClearedItemIds.push(itemId);
  state.progress.lastItemId = itemId;
  const att = interpretationAttempt(itemId);
  att.attempts += 1;
  att.lastAt = new Date().toISOString();
  att.lastScore = score;
  saveProgress();
}

function markCleared(itemId, session = null) {
  if (!isCleared(itemId)) state.progress.clearedItemIds.push(itemId);
  state.progress.lastItemId = itemId;
  const att = itemAttempt(itemId);
  att.lastAt = new Date().toISOString();
  att.lastResult = session?.wrongCount ? "cleared_with_mistakes" : "clean_clear";
  if (session?.wrongCount) {
    addReviewItem(itemId);
  } else {
    att.cleanClears += 1;
    if (isReviewNeeded(itemId)) att.reviewClears += 1;
    removeReviewItem(itemId);
  }
  saveProgress();
}

function recordMistake(itemId, correctRole, chosenRole) {
  if (!state.progress.mistakes[correctRole]) state.progress.mistakes[correctRole] = {};
  state.progress.mistakes[correctRole][chosenRole] = (state.progress.mistakes[correctRole][chosenRole] || 0) + 1;
  const att = itemAttempt(itemId);
  att.wrong += 1;
  att.roleWrong[correctRole] = (att.roleWrong[correctRole] || 0) + 1;
  att.lastAt = new Date().toISOString();
  addReviewItem(itemId);
  roleStat(correctRole).wrong += 1;
  saveProgress();
}

function recordCorrect(itemId, correctRole) {
  if (correctRole === "接続") return;
  const att = itemAttempt(itemId);
  att.correct += 1;
  att.roleCorrect[correctRole] = (att.roleCorrect[correctRole] || 0) + 1;
  att.lastAt = new Date().toISOString();
  roleStat(correctRole).correct += 1;
  saveProgress();
}

function escapeText(value) {
  return String(value ?? "");
}

function chunkTranslation(chunk) {
  if (chunk.translation) return chunk.translation;
  if (chunk.children?.chunks?.length) {
    return chunk.children.chunks.map(chunkTranslation).filter(Boolean).join(" ");
  }
  return "";
}

function chunkHasChildren(chunk) {
  return Array.isArray(chunk.children?.chunks) && chunk.children.chunks.length > 0;
}

function teacherChunks(item) {
  return item?.root?.chunks || [];
}

function patternLabel(patternId) {
  return SENTENCE_PATTERNS.find((pattern) => pattern.id === patternId)?.label || patternId || "未判定";
}

function normalizePatternId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.toUpperCase().replace(/[第文型\s]/g, "");
  if (compact.includes("SVOC")) return "SVOC";
  if (compact.includes("SVOO")) return "SVOO";
  if (compact.includes("SVC")) return "SVC";
  if (compact.includes("SVO")) return "SVO";
  if (compact.includes("SV")) return "SV";
  if (["1", "SV"].includes(compact)) return "SV";
  if (["2", "SVC"].includes(compact)) return "SVC";
  if (["3", "SVO"].includes(compact)) return "SVO";
  if (["4", "SVOO"].includes(compact)) return "SVOO";
  if (["5", "SVOC"].includes(compact)) return "SVOC";
  if (raw.includes("その他") || raw.includes("特殊") || raw.toLowerCase() === "special") return "special";
  return raw;
}

function inferPatternFromChunks(chunks) {
  const core = [];
  for (const chunk of chunks || []) {
    if (["S", "V", "O", "C"].includes(chunk.role)) core.push(chunk.role);
  }
  const signature = core.join("");
  if (signature === "SV") return "SV";
  if (signature === "SVC") return "SVC";
  if (signature === "SVO") return "SVO";
  if (signature === "SVOO") return "SVOO";
  if (signature === "SVOC") return "SVOC";
  return "special";
}

function teacherPattern(item) {
  return normalizePatternId(item?.sentencePattern || item?.pattern || inferPatternFromChunks(teacherChunks(item)));
}

function patternEvidence(chunks) {
  const grouped = { S: [], V: [], O: [], C: [], M: [] };
  for (const chunk of chunks || []) {
    if (grouped[chunk.role]) grouped[chunk.role].push(chunk.text);
  }
  return ["S", "V", "O", "C", "M"]
    .filter((role) => grouped[role].length)
    .map((role) => `${role} = ${grouped[role].join(" / ")}`)
    .join("、");
}

function splitBySlash(value) {
  return String(value || "")
    .split("/")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function createStudentChunksFromSlash(value) {
  return splitBySlash(value).map((text) => ({
    text,
    role: "",
    translation: "",
  }));
}

function defaultSlashText(item) {
  return item?.sentence || "";
}

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.,!?;:()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compareInterpretation(session) {
  const teacher = teacherChunks(session.item);
  const student = session.studentChunks;
  const rows = [];
  const count = Math.max(teacher.length, student.length);
  let textMatches = 0;
  let roleMatches = 0;
  let translated = 0;
  for (let index = 0; index < count; index += 1) {
    const t = teacher[index] || null;
    const s = student[index] || null;
    const textMatch = Boolean(t && s && normalizedText(t.text) === normalizedText(s.text));
    const roleMatch = Boolean(t && s && t.role === s.role);
    if (textMatch) textMatches += 1;
    if (roleMatch) roleMatches += 1;
    if (s?.translation?.trim()) translated += 1;
    rows.push({ index, teacher: t, student: s, textMatch, roleMatch });
  }
  return {
    rows,
    textMatches,
    roleMatches,
    patternMatch: normalizePatternId(session.studentPattern) === teacherPattern(session.item),
    translated,
    totalTeacher: teacher.length,
    totalStudent: student.length,
  };
}

function flattenChunkSteps(chunks, depth = 0, parentPath = []) {
  const steps = [];
  chunks.forEach((chunk, index) => {
    const path = parentPath.concat(index);
    steps.push({ chunk, depth, path, auto: chunk.role === "接続" });
    if (chunkHasChildren(chunk)) {
      steps.push(...flattenChunkSteps(chunk.children.chunks, depth + 1, path.concat("children")));
    }
  });
  return steps;
}

function newSession(item, options = {}) {
  const countAttempt = options.countAttempt !== false;
  const steps = flattenChunkSteps(item.root?.chunks || []);
  if (countAttempt) {
    const att = itemAttempt(item.id);
    att.attempts += 1;
    att.lastAt = new Date().toISOString();
    state.progress.lastItemId = item.id;
    saveProgress();
  }
  return {
    item,
    steps,
    startedAsReview: isReviewNeeded(item.id),
    currentIndex: 0,
    completed: new Set(),
    revealed: new Set(),
    expanded: new Set(),
    wrongOnCurrent: 0,
    wrongCount: 0,
    feedback: "",
    forced: false,
  };
}

function newInterpretationSession(item) {
  return {
    item,
    stage: "split",
    slashText: defaultSlashText(item),
    studentChunks: [],
    studentPattern: "",
    scoreSaved: false,
  };
}

function currentStep() {
  return state.session?.steps[state.session.currentIndex] || null;
}

function stepKey(step) {
  return step.path.join(".");
}

async function loadApp() {
  const manifest = await fetch("data/manifest.json").then((r) => r.json());
  state.manifest = manifest;
  state.datasetId = manifest.datasets[0]?.id || "";
  await loadDataset(state.datasetId);
  bindShell();
  render();
}

async function loadDataset(datasetId) {
  const info = state.manifest.datasets.find((d) => d.id === datasetId) || state.manifest.datasets[0];
  if (!info) throw new Error("No dataset found");
  state.datasetId = info.id;
  state.dataset = await fetch(info.url).then((r) => r.json());
  state.progress = loadProgress();
  state.session = null;
  state.interpretation = null;
  if (state.progress.lastItemId) {
    const item = findItem(state.progress.lastItemId);
    if (item && isReadyItem(item)) state.interpretation = newInterpretationSession(item);
  }
}

function findItem(itemId) {
  return (state.dataset?.items || []).find((item) => item.id === itemId);
}

function isReadyItem(item) {
  return item?.status !== "editing";
}

function readyItems() {
  return (state.dataset?.items || []).filter(isReadyItem);
}

function editingItems() {
  return (state.dataset?.items || []).filter((item) => item.status === "editing");
}

function bindShell() {
  $("#playerTab").addEventListener("click", () => {
    state.mode = "player";
    render();
  });
  $("#editorTab").addEventListener("click", () => {
    state.mode = "editor";
    render();
  });
  $("#resetProgressBtn").addEventListener("click", () => {
    if (!confirm(`「${studentLabel()}」の進捗をリセットしますか？`)) return;
    state.progress = defaultProgress();
    state.session = null;
    state.interpretation = null;
    saveProgress();
    render();
  });
}

function render() {
  $("#playerTab").classList.toggle("active", state.mode === "player");
  $("#editorTab").classList.toggle("active", state.mode === "editor");
  $("#playerTab").setAttribute("aria-selected", state.mode === "player" ? "true" : "false");
  $("#editorTab").setAttribute("aria-selected", state.mode === "editor" ? "true" : "false");
  $("#playerView").classList.toggle("hide", state.mode !== "player");
  $("#editorView").classList.toggle("hide", state.mode !== "editor");
  if (state.mode === "player") renderPlayer();
  else renderEditor();
}

function renderPlayer() {
  const view = $("#playerView");
  view.innerHTML = "";
  view.appendChild(renderControls());
  view.appendChild(renderSummary());
  view.appendChild(renderProgressDetails());
  if (state.interpretation) view.appendChild(renderInterpretationSession());
  if (state.session) view.appendChild(renderSession());
  view.appendChild(renderItemList());
}

function renderControls() {
  const datasetSelect = el("select", {
    id: "datasetSelect",
    onchange: async (event) => {
      await loadDataset(event.target.value);
      state.session = null;
      render();
    },
  }, ...state.manifest.datasets.map((d) => el("option", {
    value: d.id,
    selected: d.id === state.datasetId ? "selected" : null,
  }, d.label)));

  const studentInput = el("input", {
    id: "studentName",
    value: state.studentName,
    placeholder: "未入力なら default",
    oninput: (event) => {
      state.studentName = event.target.value;
      savePreferredStudent();
      state.progress = loadProgress();
      state.session = null;
      state.interpretation = null;
    },
    onchange: () => {
      state.progress = loadProgress();
      state.session = null;
      state.interpretation = null;
      render();
    },
  });

  return el("section", { class: "panel controls" },
    field("教材", datasetSelect),
    field("生徒名", studentInput),
    el("button", {
      class: "primary",
      type: "button",
      onclick: () => {
        const next = nextItem();
        if (next) {
          state.interpretation = newInterpretationSession(next);
          state.session = null;
          render();
        }
      },
    }, "解釈作成を始める"),
    el("button", {
      class: "ghost",
      type: "button",
      onclick: () => {
        const item = nextRoleDrillItem();
        if (item) {
          state.interpretation = null;
          state.session = newSession(item);
          render();
        }
      },
    }, "確認モード"),
    el("button", {
      class: "ghost",
      type: "button",
      onclick: () => {
        const lastItem = findItem(state.progress.lastItemId);
        const item = (isReadyItem(lastItem) && lastItem) || readyItems()[0];
        if (item) {
          state.interpretation = newInterpretationSession(item);
          state.session = null;
          render();
        }
      },
    }, "前回の文")
  );
}

function field(label, control) {
  return el("label", { class: "field" },
    el("span", { class: "fieldLabel" }, label),
    control
  );
}

function nextItem() {
  return readyItems().find((item) => !isInterpretationCleared(item.id)) || readyItems()[0] || null;
}

function nextRoleDrillItem() {
  return readyItems().find((item) => !isCleared(item.id)) || readyItems()[0] || null;
}

function reviewItem() {
  return readyItems().find((item) => isReviewNeeded(item.id)) || null;
}

function filterItems(items) {
  if (state.playerFilter === "open") return items.filter((item) => isReadyItem(item) && !isInterpretationCleared(item.id));
  if (state.playerFilter === "review") return items.filter((item) => isReadyItem(item) && isReviewNeeded(item.id));
  if (state.playerFilter === "cleared") return items.filter((item) => isReadyItem(item) && isInterpretationCleared(item.id));
  if (state.playerFilter === "editing") return items.filter((item) => !isReadyItem(item));
  return items;
}

function filterLabel(filter) {
  return {
    all: "すべて",
    open: "未解釈",
    review: "復習",
    cleared: "解釈済み",
    editing: "編集待ち",
  }[filter] || "すべて";
}

function renderSummary() {
  const items = state.dataset?.items || [];
  const ready = items.filter(isReadyItem);
  const editing = items.filter((item) => !isReadyItem(item)).length;
  const interpreted = ready.filter((item) => isInterpretationCleared(item.id)).length;
  const review = ready.filter((item) => isReviewNeeded(item.id)).length;
  const mistakeTotal = Object.values(state.progress.mistakes).flatMap((row) => Object.values(row)).reduce((a, b) => a + b, 0);
  return el("section", { class: "stats" },
    statCell(interpreted, `${ready.length}`, "解釈済み"),
    statCell(editing, `${items.length}`, "編集待ち"),
    statCell(review, `${ready.length}`, "復習対象"),
    statCell(mistakeTotal, "", "誤答記録"),
    statCell(roleWeakestLabel(), "", "弱点 role")
  );
}

function statCell(main, sub, label) {
  return el("div", { class: "statCell" },
    el("div", { class: "statNum" }, String(main), sub ? el("small", {}, `/${sub}`) : null),
    el("div", { class: "statLabel" }, label)
  );
}

function roleWeakestLabel() {
  let best = { role: "-", count: 0 };
  for (const role of ROLES) {
    const count = roleStat(role).wrong;
    if (count > best.count) best = { role, count };
  }
  return best.role;
}

function renderProgressDetails() {
  return el("section", { class: "panel progressDetails" },
    el("div", { class: "sectionHead" },
      el("div", {},
        el("p", { class: "label" }, "Progress"),
        el("h2", {}, "役割別の弱点")
      )
    ),
    el("div", { class: "roleGrid" },
      ...ROLES.map((role) => {
        const stat = roleStat(role);
        const total = stat.correct + stat.wrong;
        const accuracy = total ? Math.round((stat.correct / total) * 100) : null;
        const level = stat.wrong > stat.correct ? "weak" : stat.wrong > 0 ? "watch" : "steady";
        return el("div", { class: `roleStat ${level}` },
          el("div", { class: "roleStatHead" },
            el("span", { class: "roleTag" }, role),
            el("strong", {}, accuracy == null ? "-" : `${accuracy}%`)
          ),
          el("div", { class: "roleMeter", "aria-label": `${role} 正解率` },
            el("span", { style: `width:${accuracy == null ? 0 : accuracy}%` })
          ),
          el("p", {}, `正解 ${stat.correct} / 誤答 ${stat.wrong}`)
        );
      })
    )
  );
}

function renderInterpretationSession() {
  const session = state.interpretation;
  if (!session) return null;
  const stageIndex = ["split", "roles", "pattern", "translation", "compare"].indexOf(session.stage);
  const steps = ["区切り", "役割", "文型", "直訳", "比較"];
  return el("section", { class: "panel interpretationPanel" },
    el("div", { class: "sessionHead" },
      el("div", {},
        el("p", { class: "label" }, session.item.source || "Interpretation"),
        el("h2", {}, session.item.sentence)
      ),
      el("div", { class: "sessionActions" },
        el("button", {
          class: "ghost",
          type: "button",
          onclick: () => {
            state.interpretation = newInterpretationSession(session.item);
            render();
          },
        }, "この文をやり直す"),
        el("button", { class: "ghost", type: "button", onclick: () => { state.interpretation = null; render(); } }, "一覧へ")
      )
    ),
    el("div", { class: "stageRail", "aria-label": "解釈作成ステップ" },
      ...steps.map((label, index) => el("div", {
        class: `stageCell ${index === stageIndex ? "active" : ""} ${index < stageIndex ? "done" : ""}`,
      },
        el("span", {}, String(index + 2)),
        el("strong", {}, label)
      ))
    ),
    session.stage === "split" ? renderSplitStage(session) : null,
    session.stage === "roles" ? renderRoleStage(session) : null,
    session.stage === "pattern" ? renderPatternStage(session) : null,
    session.stage === "translation" ? renderTranslationStage(session) : null,
    session.stage === "compare" ? renderCompareStage(session) : null
  );
}

function renderSplitStage(session) {
  return el("div", { class: "interpretStage" },
    el("p", { class: "label" }, "Step 2"),
    el("h3", {}, "英文に区切りを入れる"),
    el("p", { class: "hint" }, "意味のかたまりごとに / を入れます。あとで先生版と見比べます。"),
    field("区切り入り英文", el("textarea", {
      rows: "5",
      oninput: (event) => {
        session.slashText = event.target.value;
      },
    }, session.slashText)),
    el("div", { class: "previewStrip" },
      ...createStudentChunksFromSlash(session.slashText).map((chunk) => el("span", {}, chunk.text))
    ),
    el("div", { class: "actions" },
      el("button", {
        class: "primary",
        type: "button",
        onclick: () => {
          const chunks = createStudentChunksFromSlash(session.slashText);
          if (!chunks.length) {
            alert("少なくとも1つの区切りを作ってください。");
            return;
          }
          session.studentChunks = chunks;
          session.stage = "roles";
          render();
        },
      }, "役割付けへ")
    )
  );
}

function renderRoleStage(session) {
  return el("div", { class: "interpretStage" },
    el("p", { class: "label" }, "Step 3"),
    el("h3", {}, "各かたまりの役割を付ける"),
    el("p", { class: "hint" }, "S/V/O/C/M/接続を選びます。迷う箇所はMに寄せず、いったん自分の判断を残します。"),
    el("div", { class: "studentChunkList" },
      ...session.studentChunks.map((chunk, index) => el("div", { class: "studentChunkRow" },
        el("span", { class: "itemNo" }, String(index + 1).padStart(2, "0")),
        el("strong", {}, chunk.text),
        el("select", {
          onchange: (event) => {
            chunk.role = event.target.value;
          },
        },
          el("option", { value: "", selected: !chunk.role ? "selected" : null }, "未選択"),
          ...ROLES.concat("接続").map((role) => el("option", {
            value: role,
            selected: chunk.role === role ? "selected" : null,
          }, role))
        )
      ))
    ),
    el("div", { class: "actions" },
      el("button", { class: "ghost", type: "button", onclick: () => { session.stage = "split"; render(); } }, "区切りへ戻る"),
      el("button", {
        class: "primary",
        type: "button",
        onclick: () => {
          if (session.studentChunks.some((chunk) => !chunk.role)) {
            alert("すべてのかたまりに役割を付けてください。");
            return;
          }
          session.studentPattern = session.studentPattern || inferPatternFromChunks(session.studentChunks);
          session.stage = "pattern";
          render();
        },
      }, "文型判定へ")
    )
  );
}

function renderPatternStage(session) {
  const inferred = inferPatternFromChunks(session.studentChunks);
  return el("div", { class: "interpretStage" },
    el("p", { class: "label" }, "Step 4"),
    el("h3", {}, "文全体の文型を選ぶ"),
    el("p", { class: "hint" }, "S/V/O/C をもとに、第1文型〜第5文型で判断します。迷う文はその他・特殊構文を選びます。"),
    el("div", { class: "patternHint" },
      el("p", { class: "label" }, "Your Structure"),
      el("p", {}, patternEvidence(session.studentChunks) || "S/V/O/C がまだありません。"),
      el("p", { class: "hint" }, `役割からの自動推定: ${patternLabel(inferred)}`)
    ),
    el("div", { class: "patternChoices", role: "group", "aria-label": "文型選択" },
      ...SENTENCE_PATTERNS.map((pattern) => el("button", {
        type: "button",
        class: `patternChoice ${normalizePatternId(session.studentPattern) === pattern.id ? "active" : ""}`,
        onclick: () => {
          session.studentPattern = pattern.id;
          render();
        },
      }, pattern.label))
    ),
    el("div", { class: "actions" },
      el("button", { class: "ghost", type: "button", onclick: () => { session.stage = "roles"; render(); } }, "役割へ戻る"),
      el("button", {
        class: "primary",
        type: "button",
        onclick: () => {
          if (!session.studentPattern) {
            alert("文型を選んでください。");
            return;
          }
          session.stage = "translation";
          render();
        },
      }, "直訳へ")
    )
  );
}

function renderTranslationStage(session) {
  return el("div", { class: "interpretStage" },
    el("p", { class: "label" }, "Step 5"),
    el("h3", {}, "かたまりごとに直訳を書く"),
    el("p", { class: "hint" }, "きれいな日本語より、構造が見える訳を優先します。"),
    el("div", { class: "translationRows" },
      ...session.studentChunks.map((chunk, index) => el("label", { class: "translationRow" },
        el("span", { class: "roleTag" }, chunk.role),
        el("strong", {}, chunk.text),
        el("textarea", {
          rows: "2",
          placeholder: "直訳",
          oninput: (event) => {
            chunk.translation = event.target.value;
          },
        }, chunk.translation || "")
      ))
    ),
    el("div", { class: "actions" },
      el("button", { class: "ghost", type: "button", onclick: () => { session.stage = "pattern"; render(); } }, "文型へ戻る"),
      el("button", {
        class: "primary",
        type: "button",
        onclick: () => {
          const score = compareInterpretation(session);
          markInterpretationComplete(session.item.id, {
            textMatches: score.textMatches,
            roleMatches: score.roleMatches,
            patternMatch: score.patternMatch,
            studentPattern: normalizePatternId(session.studentPattern),
            teacherPattern: teacherPattern(session.item),
            translated: score.translated,
            totalTeacher: score.totalTeacher,
            totalStudent: score.totalStudent,
          });
          session.scoreSaved = true;
          session.stage = "compare";
          render();
        },
      }, "先生版と比較")
    )
  );
}

function renderCompareStage(session) {
  const score = compareInterpretation(session);
  return el("div", { class: "interpretStage" },
    el("p", { class: "label" }, "Step 6"),
    el("h3", {}, "先生版と比較する"),
    renderPatternCompare(session, score),
    el("div", { class: "compareStats" },
      statCell(score.textMatches, `${score.totalTeacher}`, "区切り一致"),
      statCell(score.roleMatches, `${score.totalTeacher}`, "役割一致"),
      statCell(score.patternMatch ? "OK" : "CHECK", "", "文型"),
      statCell(score.translated, `${score.totalStudent}`, "訳入力")
    ),
    el("div", { class: "compareTable" },
      ...score.rows.map((row) => renderCompareRow(row))
    ),
    el("div", { class: "actions" },
      el("button", { class: "ghost", type: "button", onclick: () => { session.stage = "translation"; render(); } }, "自分の訳を直す"),
      el("button", {
        class: "primary",
        type: "button",
        onclick: () => {
          const next = nextItem();
          state.interpretation = next ? newInterpretationSession(next) : null;
          render();
        },
      }, "次の文へ")
    )
  );
}

function renderPatternCompare(session, score) {
  const teacher = teacherPattern(session.item);
  const student = normalizePatternId(session.studentPattern);
  return el("div", { class: `patternCompare ${score.patternMatch ? "match" : "diff"}` },
    el("div", {},
      el("p", { class: "label" }, "Your Pattern"),
      el("strong", {}, patternLabel(student))
    ),
    el("div", {},
      el("p", { class: "label" }, "Teacher Pattern"),
      el("strong", {}, patternLabel(teacher)),
      el("p", { class: "hint" }, session.item.patternNote || patternEvidence(teacherChunks(session.item)) || "根拠メモなし")
    )
  );
}

function renderCompareRow(row) {
  const teacher = row.teacher;
  const student = row.student;
  return el("div", { class: `compareRow ${row.textMatch && row.roleMatch ? "match" : "diff"}` },
    el("div", { class: "compareSide" },
      el("p", { class: "label" }, "Your Work"),
      student
        ? [
            el("strong", {}, student.text),
            el("p", {}, el("span", { class: "roleTag" }, student.role || "-"), student.translation || "訳なし"),
          ]
        : el("p", { class: "hint" }, "対応する区切りなし")
    ),
    el("div", { class: "compareSide teacher" },
      el("p", { class: "label" }, "Teacher Model"),
      teacher
        ? [
            el("strong", {}, teacher.text),
            el("p", {}, el("span", { class: "roleTag" }, teacher.role), chunkTranslation(teacher) || "訳なし"),
            chunkHasChildren(teacher) ? renderTeacherChildren(teacher.children.chunks) : null,
          ]
        : el("p", { class: "hint" }, "先生版にはない追加区切り")
    )
  );
}

function renderTeacherChildren(chunks) {
  return el("div", { class: "teacherChildren" },
    ...chunks.map((chunk) => el("div", {},
      el("span", { class: "roleTag" }, chunk.role),
      el("span", {}, `${chunk.text} / ${chunkTranslation(chunk)}`)
    ))
  );
}

function renderSession() {
  const session = state.session;
  const step = currentStep();
  const done = session.completed.size;
  const total = session.steps.length;
  const complete = done >= total;

  const body = el("section", { class: "panel sessionPanel" },
    el("div", { class: "sessionHead" },
      el("div", {},
        el("p", { class: "label" }, session.item.source || "Sentence"),
        el("h2", {}, session.item.sentence)
      ),
      el("div", { class: "sessionActions" },
        el("button", {
          class: "ghost",
          type: "button",
          onclick: () => {
            state.session = newSession(session.item);
            render();
          },
        }, "この文をやり直す"),
        el("button", { class: "ghost", type: "button", onclick: () => { state.session = null; render(); } }, "一覧へ")
      )
    ),
    el("div", { class: "progressBar", "aria-label": `進捗 ${done}/${total}` },
      el("span", { style: `width:${total ? (done / total) * 100 : 0}%` })
    ),
    renderChunkMap(session.item.root?.chunks || [], []),
    complete ? renderCompleteBox(session.item) : renderQuestionBox(step)
  );

  if (session.feedback) body.appendChild(el("p", { class: session.forced ? "feedback warn" : "feedback" }, session.feedback));
  return body;
}

function renderChunkMap(chunks, parentPath, depth = 0) {
  return el("div", { class: `chunkLayer depth${Math.min(depth, 3)}` },
    ...chunks.map((chunk, index) => {
      const path = parentPath.concat(index);
      const key = path.join(".");
      const complete = state.session.completed.has(key);
      const active = currentStep() && stepKey(currentStep()) === key;
      const expanded = state.session.expanded.has(key);
      const classes = ["chunkCard"];
      if (complete) classes.push("done");
      if (active) classes.push("active");
      if (chunk.role === "接続") classes.push("connector");
      const children = [
        el("div", { class: "chunkText" }, chunk.text),
        complete ? el("div", { class: "chunkAnswer" },
          el("span", { class: "roleTag" }, chunk.role),
          el("span", {}, chunkTranslation(chunk))
        ) : el("div", { class: "chunkPending" }, active ? "判定中" : "未表示")
      ];
      if (expanded && chunkHasChildren(chunk)) {
        children.push(renderChunkMap(chunk.children.chunks, path.concat("children"), depth + 1));
      }
      return el("div", { class: classes.join(" ") }, ...children);
    })
  );
}

function renderQuestionBox(step) {
  if (!step) return null;
  if (step.auto) {
    setTimeout(() => revealCurrent(true), 280);
    return el("div", { class: "questionBox connectorNotice" },
      el("p", { class: "label" }, "接続語"),
      el("p", {}, "このかたまりは採点せず、訳だけ表示します。")
    );
  }
  return el("div", { class: "questionBox" },
    el("p", { class: "label" }, `Depth ${step.depth + 1}`),
    el("h3", {}, step.chunk.text),
    el("p", { class: "hint" }, "このかたまりの役割を選んでください。"),
    el("div", { class: "roleButtons" },
      ...ROLES.map((role) => el("button", {
        type: "button",
        class: "roleBtn",
        onclick: () => chooseRole(role),
      }, role))
    )
  );
}

function renderCompleteBox(item) {
  const clean = !state.session?.wrongCount;
  const wasReview = state.session?.startedAsReview;
  return el("div", { class: "completeBox" },
    el("p", { class: "label" }, "Complete"),
    el("h3", {}, clean && wasReview ? "復習クリア。前から訳が完成しました。" : "前から訳が完成しました。"),
    el("p", {}, collectTranslations(item.root?.chunks || []).join(" / ")),
    el("button", {
      class: "primary",
      type: "button",
      onclick: () => {
        const next = nextItem();
        state.session = next ? newSession(next) : null;
        render();
      },
    }, "次の文へ")
  );
}

function collectTranslations(chunks) {
  const out = [];
  for (const chunk of chunks) {
    out.push(chunkTranslation(chunk));
  }
  return out.filter(Boolean);
}

function chooseRole(role) {
  const step = currentStep();
  if (!step) return;
  if (role === step.chunk.role) {
    recordCorrect(state.session.item.id, step.chunk.role);
    state.session.feedback = "正解。訳を表示しました。";
    state.session.forced = false;
    revealCurrent(false);
    return;
  }
  state.session.wrongOnCurrent += 1;
  state.session.wrongCount += 1;
  recordMistake(state.session.item.id, step.chunk.role, role);
  if (state.session.wrongOnCurrent >= 3) {
    state.session.feedback = `3回確認しました。正解は ${step.chunk.role} です。`;
    state.session.forced = true;
    revealCurrent(false);
  } else {
    state.session.feedback = `もう一度。${role} ではありません。`;
    state.session.forced = false;
    render();
  }
}

function revealCurrent(auto) {
  const step = currentStep();
  if (!step) return;
  const key = stepKey(step);
  state.session.completed.add(key);
  state.session.revealed.add(key);
  if (chunkHasChildren(step.chunk)) state.session.expanded.add(key);
  state.session.currentIndex += 1;
  state.session.wrongOnCurrent = 0;
  if (auto) {
    state.session.feedback = "接続語を読み流しました。";
    state.session.forced = false;
  }
  if (state.session.currentIndex >= state.session.steps.length) {
    markCleared(state.session.item.id, state.session);
  }
  render();
}

function renderItemList() {
  const items = state.dataset?.items || [];
  const visibleItems = filterItems(items);
  return el("section", { class: "panel" },
    el("div", { class: "sectionHead" },
      el("div", {},
        el("p", { class: "label" }, "Sentences"),
        el("h2", {}, `文リスト: ${filterLabel(state.playerFilter)}`)
      ),
      renderFilterButtons(items)
    ),
    visibleItems.length ? el("div", { class: "itemList" },
      ...visibleItems.map((item) => {
        const att = itemAttempt(item.id);
        const interpretation = interpretationAttempt(item.id);
        const originalIndex = items.findIndex((candidate) => candidate.id === item.id);
        const ready = isReadyItem(item);
        return el("button", {
          type: "button",
          class: `itemRow ${isInterpretationCleared(item.id) ? "cleared" : ""} ${isReviewNeeded(item.id) ? "review" : ""} ${!ready ? "editing" : ""}`,
          disabled: ready ? null : "disabled",
          onclick: () => {
            if (!ready) return;
            state.interpretation = newInterpretationSession(item);
            state.session = null;
            render();
          },
        },
          el("span", { class: "itemNo" }, String(originalIndex + 1).padStart(2, "0")),
          el("span", { class: "itemMain" },
            el("strong", {}, item.sentence),
            el("small", {}, ready
              ? `${item.source || ""} / 解釈 ${interpretation.attempts || 0}${interpretation.lastAt ? ` / 最終 ${formatDateTime(interpretation.lastAt)}` : ""} / 確認 ${att.attempts || 0} / 誤答 ${att.wrong || 0}`
              : `${item.source || ""} / ${item.editNote || "編集待ち"}`)
          ),
          el("span", { class: "itemStatus" }, itemStatusLabel(item))
        );
      })
    ) : el("div", { class: "emptyBox" }, "この条件に合う文はありません。"),
    renderMistakeTable()
  );
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

function itemStatusLabel(item) {
  if (!isReadyItem(item)) return "EDIT";
  if (isReviewNeeded(item.id)) return "REVIEW";
  if (isInterpretationCleared(item.id)) return "DONE";
  if (isCleared(item.id)) return "CHECK";
  return "OPEN";
}

function renderFilterButtons(items) {
  const ready = items.filter(isReadyItem);
  const counts = {
    all: items.length,
    open: ready.filter((item) => !isInterpretationCleared(item.id)).length,
    review: ready.filter((item) => isReviewNeeded(item.id)).length,
    cleared: ready.filter((item) => isInterpretationCleared(item.id)).length,
    editing: items.filter((item) => !isReadyItem(item)).length,
  };
  return el("div", { class: "filterButtons", role: "group", "aria-label": "文リスト表示" },
    ...["all", "open", "review", "cleared", "editing"].map((filter) => el("button", {
      type: "button",
      class: `filterBtn ${state.playerFilter === filter ? "active" : ""}`,
      onclick: () => {
        state.playerFilter = filter;
        render();
      },
    }, `${filterLabel(filter)} ${counts[filter]}`))
  );
}

function renderMistakeTable() {
  const roles = Object.keys(state.progress.mistakes);
  if (!roles.length) {
    return el("div", { class: "emptyBox" }, "まだ誤答はありません。");
  }
  return el("div", { class: "mistakeBox" },
    el("p", { class: "label" }, "Weak Points"),
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "正解role"), el("th", {}, "選んだrole"), el("th", {}, "回数"))),
      el("tbody", {},
        ...roles.flatMap((correct) => Object.entries(state.progress.mistakes[correct]).map(([chosen, count]) =>
          el("tr", {}, el("td", {}, correct), el("td", {}, chosen), el("td", {}, String(count)))
        ))
      )
    )
  );
}

function renderEditor() {
  const view = $("#editorView");
  view.innerHTML = "";
  const validation = validateEditorItem(editorItem());
  view.appendChild(el("section", { class: "panel editorPanel" },
    el("div", { class: "sectionHead" },
      el("div", {},
        el("p", { class: "label" }, "Teacher Editor"),
        el("h2", {}, "教材を編集する")
      ),
      el("button", { class: "ghost", type: "button", onclick: () => { state.editor = defaultEditorState(); renderEditor(); } }, "新規")
    ),
    el("div", { class: "editorWorkbench" },
      renderEditingQueue(),
      renderEditorDesk(validation)
    ),
    renderSavedItems(),
    renderJsonPreview()
  ));
}

function renderEditorDesk(validation) {
  return el("div", { class: "editorDesk" },
    renderEditorInputs(),
    renderEditorTools(validation),
    renderValidationBox(validation),
    renderEditorChunks()
  );
}

function renderEditorInputs() {
  return el("div", { class: "editorForm" },
    field("教材ID", el("input", {
      value: state.editor.datasetId,
      oninput: (e) => { state.editor.datasetId = slugify(e.target.value) || e.target.value; updateJsonPreviewOnly(); },
    })),
    field("教材名", el("input", {
      value: state.editor.datasetLabel,
      oninput: (e) => { state.editor.datasetLabel = e.target.value; updateJsonPreviewOnly(); },
    })),
    field("ID", el("input", {
      value: state.editor.itemId,
      oninput: (e) => { state.editor.itemId = e.target.value; updateJsonPreviewOnly(); },
    })),
    field("出典", el("input", {
      value: state.editor.source,
      oninput: (e) => { state.editor.source = e.target.value; updateJsonPreviewOnly(); },
    })),
    field("状態", el("select", {
      onchange: (e) => { state.editor.status = e.target.value; updateJsonPreviewOnly(); },
    },
      el("option", { value: "ready", selected: state.editor.status !== "editing" ? "selected" : null }, "解析済み"),
      el("option", { value: "editing", selected: state.editor.status === "editing" ? "selected" : null }, "編集待ち")
    )),
    field("英文", el("textarea", {
      rows: "3",
      placeholder: "例: I think that he is honest.",
      oninput: (e) => { state.editor.sentence = e.target.value; updateJsonPreviewOnly(); },
    }, state.editor.sentence))
  );
}

function renderEditorTools(validation) {
  return el("div", { class: "editorActions" },
    el("div", { class: "actions" },
      el("button", { class: "primary", type: "button", onclick: tokenizeSentence }, "自動分割"),
      el("button", { class: "ghost", type: "button", onclick: () => addChunkAfter(state.editor.chunks.length - 1) }, "chunk追加"),
      el("button", { class: "ghost", type: "button", onclick: mergeSelectedWithNext, disabled: selectedChunk() ? null : "disabled" }, "次と結合"),
      el("button", { class: "ghost", type: "button", onclick: splitSelectedChunk, disabled: selectedChunk() ? null : "disabled" }, "分割"),
      el("button", { class: "ghost", type: "button", onclick: makeSelectedClause, disabled: selectedChunk() ? null : "disabled" }, "節化")
    ),
    el("div", { class: "actions saveActions" },
      el("button", { class: "ghost", type: "button", onclick: () => keepCurrentItemEditing() }, "編集待ちでキープ"),
      el("button", { class: "primary", type: "button", onclick: () => saveCurrentItemReady() }, "完成として保存"),
      el("button", { class: "ghost", type: "button", onclick: downloadDatasetJson }, "教材JSON保存")
    )
  );
}

function tokenizeSentence() {
  const words = state.editor.sentence.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?|[.,!?;:()]/g) || [];
  state.editor.chunks = words.map((word) => ({ text: word, role: "M", translation: "" }));
  state.editor.selectedChunk = words.length ? 0 : -1;
  renderEditor();
}

function selectedChunk() {
  return state.editor.chunks[state.editor.selectedChunk] || null;
}

function mergeSelectedWithNext() {
  mergeChunkWithNext(state.editor.selectedChunk);
}

function mergeChunkWithNext(index) {
  const idx = Number(index);
  if (idx < 0 || idx >= state.editor.chunks.length - 1) return;
  const current = state.editor.chunks[idx];
  const next = state.editor.chunks[idx + 1];
  current.text = `${current.text} ${next.text}`.replace(/\s+([.,!?;:])/g, "$1");
  if (!current.translation && next.translation) current.translation = next.translation;
  state.editor.chunks.splice(idx + 1, 1);
  state.editor.selectedChunk = idx;
  renderEditor();
}

function splitSelectedChunk() {
  const idx = state.editor.selectedChunk;
  const chunk = selectedChunk();
  if (!chunk) return;
  const parts = chunk.text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return;
  const replacement = parts.map((part) => ({ text: part, role: chunk.role, translation: "" }));
  state.editor.chunks.splice(idx, 1, ...replacement);
  state.editor.selectedChunk = idx;
  renderEditor();
}

function makeSelectedClause() {
  const chunk = selectedChunk();
  if (!chunk) return;
  ensureChunkChildren(chunk);
  renderEditor();
}

function addChunkAfter(index) {
  const insertAt = Math.max(0, Math.min(state.editor.chunks.length, index + 1));
  state.editor.chunks.splice(insertAt, 0, { text: "", role: "M", translation: "" });
  state.editor.selectedChunk = insertAt;
  renderEditor();
}

function deleteChunk(index) {
  state.editor.chunks.splice(index, 1);
  if (state.editor.selectedChunk >= state.editor.chunks.length) state.editor.selectedChunk = state.editor.chunks.length - 1;
  renderEditor();
}

function ensureChunkChildren(chunk) {
  if (chunk.children?.chunks?.length) return;
  const words = chunk.text.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?|[.,!?;:()]/g) || [chunk.text];
  chunk.children = {
    chunks: words.map((word, index) => ({
      text: word,
      role: index === 0 && /^(that|when|if|because|who|which|what|where|why|how)$/i.test(word) ? "接続" : "M",
      translation: "",
    })),
  };
}

function renderEditorChunks() {
  if (!state.editor.chunks.length) {
    return el("div", { class: "emptyBox chunkEmpty" }, "chunkがありません。");
  }
  return el("div", { class: "editorChunks" },
    el("div", { class: "chunkHeader" },
      el("p", { class: "label" }, "Chunks"),
      el("div", { class: "roleLegend" },
        ...ROLES.map((role) => el("span", {}, roleLabel(role)))
      )
    ),
    ...state.editor.chunks.map((chunk, index) => renderEditableChunk(chunk, index))
  );
}

function renderEditableChunk(chunk, index) {
  const selected = state.editor.selectedChunk === index;
  return el("div", { class: `editChunk ${selected ? "selected" : ""}` },
    el("div", { class: "chunkTop" },
      el("button", {
        class: "chunkSelect",
        type: "button",
        onclick: () => { state.editor.selectedChunk = index; renderEditor(); },
      }, `${String(index + 1).padStart(2, "0")} ${chunk.text || "(empty)"}`),
      el("div", { class: "childActions" },
        el("button", {
          class: "tiny ghost",
          type: "button",
          disabled: index < state.editor.chunks.length - 1 ? null : "disabled",
          onclick: () => mergeChunkWithNext(index),
        }, "次と結合"),
        el("button", { class: "tiny ghost", type: "button", onclick: () => addChunkAfter(index) }, "後ろに追加"),
        el("button", { class: "tiny ghost", type: "button", onclick: () => deleteChunk(index) }, "削除")
      )
    ),
    el("div", { class: "chunkForm" },
      field("Text", el("input", {
        value: chunk.text,
        oninput: (e) => { chunk.text = e.target.value; updateJsonPreviewOnly(); },
      })),
      field("Role", roleSelect(chunk)),
      field("訳", el("input", {
        value: chunk.translation || "",
        oninput: (e) => { chunk.translation = e.target.value; updateJsonPreviewOnly(); },
      })),
      chunk.children ? renderChildEditor(chunk, [index]) : null
    )
  );
}

function roleSelect(chunk) {
  return el("select", {
    onchange: (e) => { chunk.role = e.target.value; updateJsonPreviewOnly(); },
  }, ...ROLES.concat("接続").map((role) => el("option", {
    value: role,
    selected: chunk.role === role ? "selected" : null,
  }, roleLabel(role))));
}

function roleLabel(role) {
  return {
    S: "S 主語",
    V: "V 動詞",
    O: "O 目的語",
    C: "C 補語",
    M: "M 修飾",
    "接続": "接続",
  }[role] || role;
}

function renderChildEditor(parentChunk, path) {
  return el("div", { class: "childEditor" },
    el("div", { class: "childHead" },
      el("span", { class: "label" }, `Nested Clause ${path.join(".")}`),
      el("button", {
        class: "tiny ghost",
        type: "button",
        onclick: () => { delete parentChunk.children; renderEditor(); },
      }, "節解除")
    ),
    ...parentChunk.children.chunks.map((child, index) =>
      el("div", { class: "childBlock" },
        el("div", { class: "childRow" },
          el("input", {
            value: child.text,
            oninput: (e) => { child.text = e.target.value; updateJsonPreviewOnly(); },
          }),
          roleSelect(child),
          el("input", {
            value: child.translation || "",
            placeholder: "訳",
            oninput: (e) => { child.translation = e.target.value; updateJsonPreviewOnly(); },
          }),
          el("div", { class: "childActions" },
            el("button", {
              class: "tiny ghost",
              type: "button",
              onclick: () => { ensureChunkChildren(child); renderEditor(); },
            }, "節化"),
            el("button", {
              class: "tiny ghost",
              type: "button",
              onclick: () => { parentChunk.children.chunks.splice(index, 1); renderEditor(); },
            }, "削除")
          )
        ),
        child.children ? renderChildEditor(child, path.concat("children", index)) : null
      )
    ),
    el("button", {
      class: "tiny",
      type: "button",
      onclick: () => {
        parentChunk.children.chunks.push({ text: "", role: "M", translation: "" });
        renderEditor();
      },
    }, "子chunk追加")
  );
}

function renderValidationBox(validation) {
  const ok = validation.errors.length === 0;
  return el("div", { class: `validationBox ${ok ? "ok" : "warn"}` },
    el("p", { class: "label" }, state.editor.status === "editing" ? "Editing" : ok ? "Ready" : "Check"),
    state.editor.status === "editing"
      ? el("p", {}, "編集待ちとして保持します。学習画面では出題されません。")
      : ok ? el("p", {}, "この文はプレイヤーで使用できます。") : el("ul", {},
      ...validation.errors.map((message) => el("li", {}, message))
    )
  );
}

function renderEditingQueue() {
  const queue = editingItems();
  if (!queue.length) {
    return el("aside", { class: "editingQueue emptyBox" }, "編集待ちの文はありません。");
  }
  return el("aside", { class: "editingQueue" },
    el("div", { class: "sectionHead compact" },
      el("div", {},
        el("p", { class: "label" }, "Editing Queue"),
        el("h3", {}, `編集待ち ${queue.length} 文`)
      )
    ),
    el("div", { class: "savedList" },
      ...queue.map((item, index) => el("div", { class: "savedRow editing" },
        el("span", { class: "itemNo" }, String(index + 1).padStart(2, "0")),
        el("span", { class: "itemMain" },
          el("strong", {}, item.sentence || item.id),
          el("small", {}, `${item.source || ""}${item.editNote ? ` / ${item.editNote}` : ""}`)
        ),
        el("div", { class: "childActions" },
          el("button", {
            class: "tiny ghost",
            type: "button",
            onclick: () => loadEditorItem(item),
          }, state.editor.itemId === item.id ? "編集中" : "開く"),
          el("button", {
            class: "tiny danger",
            type: "button",
            onclick: () => removeEditingItem(item),
          }, "削除")
        )
      ))
    )
  );
}

function renderSavedItems() {
  if (!state.editor.savedItems.length) {
    return el("div", { class: "savedItems emptyBox" }, "まだ教材に追加された文はありません。");
  }
  return el("div", { class: "savedItems" },
    el("div", { class: "sectionHead compact" },
      el("div", {},
        el("p", { class: "label" }, "Dataset Items"),
        el("h3", {}, `追加済み ${state.editor.savedItems.length} 文`)
      )
    ),
    el("div", { class: "savedList" },
      ...state.editor.savedItems.map((item, index) => el("div", { class: "savedRow" },
        el("span", { class: "itemNo" }, String(index + 1).padStart(2, "0")),
        el("span", { class: "itemMain" },
          el("strong", {}, item.sentence || item.id),
          el("small", {}, item.source || "")
        ),
        el("div", { class: "childActions" },
          el("button", {
            class: "tiny ghost",
            type: "button",
            onclick: () => loadEditorItem(item),
          }, "編集"),
          el("button", {
            class: "tiny ghost",
            type: "button",
            onclick: () => {
              state.editor.savedItems.splice(index, 1);
              renderEditor();
            },
          }, "削除")
        )
      ))
    )
  );
}

function validateEditorItem(item) {
  const errors = [];
  if (!item.id?.trim()) errors.push("IDが空です。");
  if (!item.sentence?.trim()) errors.push("英文が空です。");
  if (!item.root?.chunks?.length) errors.push("chunkがありません。");
  validateChunks(item.root?.chunks || [], "root", errors);
  return { errors };
}

function validateChunks(chunks, label, errors) {
  chunks.forEach((chunk, index) => {
    const where = `${label}.${index + 1}`;
    if (!chunk.text?.trim()) errors.push(`${where}: text が空です。`);
    if (!ROLES.concat("接続").includes(chunk.role)) errors.push(`${where}: role が不正です。`);
    if (!chunk.translation?.trim() && !chunkHasChildren(chunk)) errors.push(`${where}: 訳が空です。`);
    if (chunk.children?.chunks?.length) validateChunks(chunk.children.chunks, `${where}.children`, errors);
  });
}

function addCurrentItemToDataset() {
  const item = cloneItem(editorItem());
  const validation = validateEditorItem(item);
  if (item.status !== "editing" && validation.errors.length) {
    alert(`教材に追加できません:\n${validation.errors.join("\n")}`);
    return;
  }
  const existingIndex = state.editor.savedItems.findIndex((saved) => saved.id === item.id);
  if (existingIndex >= 0) state.editor.savedItems[existingIndex] = item;
  else state.editor.savedItems.push(item);
  const datasetIndex = (state.dataset?.items || []).findIndex((saved) => saved.id === item.id);
  if (datasetIndex >= 0) state.dataset.items[datasetIndex] = cloneItem(item);
  else if (state.dataset?.items) state.dataset.items.push(cloneItem(item));
  renderEditor();
}

function keepCurrentItemEditing() {
  state.editor.status = "editing";
  addCurrentItemToDataset();
}

function saveCurrentItemReady() {
  state.editor.status = "ready";
  addCurrentItemToDataset();
}

function removeEditingItem(item) {
  if (!item?.id) return;
  if (!confirm(`「${item.sentence || item.id}」を編集待ちから削除しますか？`)) return;
  if (state.dataset?.items) {
    state.dataset.items = state.dataset.items.filter((candidate) => candidate.id !== item.id);
  }
  state.editor.savedItems = state.editor.savedItems.filter((candidate) => candidate.id !== item.id);
  if (!state.editor.removedItemIds.includes(item.id)) state.editor.removedItemIds.push(item.id);
  if (state.editor.itemId === item.id) state.editor = {
    ...defaultEditorState(),
    datasetId: state.editor.datasetId,
    datasetLabel: state.editor.datasetLabel,
    savedItems: state.editor.savedItems,
    removedItemIds: state.editor.removedItemIds,
  };
  renderEditor();
}

function loadEditorItem(item) {
  state.editor.source = item.source || "JSON読込";
  state.editor.itemId = item.id || `custom_${Date.now()}`;
  state.editor.status = item.status || "ready";
  state.editor.sentence = item.sentence || "";
  state.editor.chunks = cloneItem(item).root?.chunks || [];
  state.editor.selectedChunk = state.editor.chunks.length ? 0 : -1;
  state.editor.editNote = item.editNote || "";
  renderEditor();
}

function cloneItem(item) {
  return JSON.parse(JSON.stringify(item));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function editorItem() {
  const item = {
    id: state.editor.itemId || `custom_${Date.now()}`,
    source: state.editor.source || "手入力",
    sentence: state.editor.sentence,
    root: {
      chunks: state.editor.chunks,
    },
  };
  if (state.editor.status === "editing") {
    item.status = "editing";
    item.editNote = state.editor.editNote || "編集待ち: chunk/role/translationを確定してください。";
  }
  return item;
}

function editorDataset() {
  const current = editorItem();
  const validation = validateEditorItem(current);
  const hasCurrent = current.status === "editing" || validation.errors.length === 0;
  const items = state.editor.savedItems.slice();
  if (hasCurrent && !items.some((item) => item.id === current.id)) items.push(current);
  return {
    meta: {
      id: state.editor.datasetId || "custom-reading-set",
      label: state.editor.datasetLabel || "自作 英文解釈",
      source: "英文解釈トレーナー 先生エディタ",
      version: 1,
      removedItemIds: state.editor.removedItemIds || [],
    },
    items,
  };
}

function renderJsonPreview() {
  const json = JSON.stringify(editorDataset(), null, 2);
  state.editor.rawJson = json;
  return el("details", { class: "jsonArea" },
    el("summary", {}, "JSON / 書き出し"),
    el("div", { class: "actions advancedActions" },
      el("button", { class: "ghost", type: "button", onclick: importJsonFromTextarea }, "JSON読込"),
      el("button", { class: "ghost", type: "button", onclick: downloadEditorJson }, "単文JSON保存")
    ),
    field("JSONプレビュー / 読込欄", el("textarea", {
      id: "jsonPreview",
      rows: "14",
      oninput: (e) => { state.editor.rawJson = e.target.value; },
    }, json))
  );
}

function updateJsonPreviewOnly() {
  const area = $("#jsonPreview");
  if (area) area.value = JSON.stringify(editorDataset(), null, 2);
}

function importJsonFromTextarea() {
  const text = $("#jsonPreview")?.value || state.editor.rawJson;
  try {
    const parsed = JSON.parse(text);
    const item = parsed.root ? parsed : parsed.items?.[0];
    if (!item?.root?.chunks) throw new Error("root.chunks が見つかりません。");
    const savedItems = Array.isArray(parsed.items) ? parsed.items.map(cloneItem) : state.editor.savedItems;
    state.editor = {
      datasetId: parsed.meta?.id || state.editor.datasetId,
      datasetLabel: parsed.meta?.label || state.editor.datasetLabel,
      source: item.source || "JSON読込",
      itemId: item.id || `custom_${Date.now()}`,
      status: item.status || "ready",
      sentence: item.sentence || "",
      chunks: cloneItem(item).root.chunks,
      selectedChunk: item.root.chunks.length ? 0 : -1,
      savedItems,
      removedItemIds: parsed.meta?.removedItemIds || state.editor.removedItemIds || [],
      editNote: item.editNote || "",
      rawJson: text,
    };
    renderEditor();
  } catch (error) {
    alert(`JSONを読み込めませんでした: ${error.message}`);
  }
}

function downloadEditorJson() {
  downloadJson(`${editorItem().id || "reading-item"}.json`, editorItem());
}

function downloadDatasetJson() {
  const dataset = editorDataset();
  if (!dataset.items.length && !dataset.meta.removedItemIds?.length) {
    alert("保存できる文や削除記録がありません。先にchunkと訳を入力するか、編集待ちを削除してください。");
    return;
  }
  downloadJson(`${dataset.meta.id || "reading-dataset"}.json`, dataset);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.addEventListener("DOMContentLoaded", () => {
  loadApp().catch((error) => {
    document.body.innerHTML = `<main class="wrap"><section class="panel"><h1>読み込みエラー</h1><p>${escapeText(error.message)}</p></section></main>`;
  });
});
