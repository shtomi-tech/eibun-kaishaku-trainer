"use strict";

const ROLES = ["S", "V", "O", "C", "M"];
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
    lastItemId: "",
  };
}

function defaultEditorState() {
  return {
    datasetId: "custom-reading-set",
    datasetLabel: "自作 英文解釈",
    source: "手入力",
    itemId: `custom_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
    sentence: "",
    chunks: [],
    selectedChunk: -1,
    savedItems: [],
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
  if (!base.itemAttempts || typeof base.itemAttempts !== "object") base.itemAttempts = {};
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

function isReviewNeeded(itemId) {
  return state.progress.needsReviewItemIds.includes(itemId);
}

function addReviewItem(itemId) {
  if (!isReviewNeeded(itemId)) state.progress.needsReviewItemIds.push(itemId);
}

function removeReviewItem(itemId) {
  state.progress.needsReviewItemIds = state.progress.needsReviewItemIds.filter((id) => id !== itemId);
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
  if (state.progress.lastItemId) {
    const item = findItem(state.progress.lastItemId);
    if (item) state.session = newSession(item, { countAttempt: false });
  }
}

function findItem(itemId) {
  return (state.dataset?.items || []).find((item) => item.id === itemId);
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
    },
    onchange: () => {
      state.progress = loadProgress();
      state.session = null;
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
          state.session = newSession(next);
          render();
        }
      },
    }, "未クリアから始める"),
    el("button", {
      class: "ghost",
      type: "button",
      onclick: () => {
        const item = reviewItem();
        if (item) {
          state.session = newSession(item);
          state.playerFilter = "review";
          render();
        }
      },
    }, "復習から始める"),
    el("button", {
      class: "ghost",
      type: "button",
      onclick: () => {
        const item = findItem(state.progress.lastItemId) || state.dataset.items[0];
        if (item) {
          state.session = newSession(item);
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
  return (state.dataset?.items || []).find((item) => !isCleared(item.id)) || state.dataset?.items?.[0] || null;
}

function reviewItem() {
  return (state.dataset?.items || []).find((item) => isReviewNeeded(item.id)) || null;
}

function filterItems(items) {
  if (state.playerFilter === "open") return items.filter((item) => !isCleared(item.id));
  if (state.playerFilter === "review") return items.filter((item) => isReviewNeeded(item.id));
  if (state.playerFilter === "cleared") return items.filter((item) => isCleared(item.id));
  return items;
}

function filterLabel(filter) {
  return {
    all: "すべて",
    open: "未クリア",
    review: "復習",
    cleared: "クリア済み",
  }[filter] || "すべて";
}

function renderSummary() {
  const items = state.dataset?.items || [];
  const cleared = items.filter((item) => isCleared(item.id)).length;
  const review = items.filter((item) => isReviewNeeded(item.id)).length;
  const mistakeTotal = Object.values(state.progress.mistakes).flatMap((row) => Object.values(row)).reduce((a, b) => a + b, 0);
  return el("section", { class: "stats" },
    statCell(cleared, `${items.length}`, "クリア済み"),
    statCell(review, `${items.length}`, "復習対象"),
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
        const originalIndex = items.findIndex((candidate) => candidate.id === item.id);
        return el("button", {
          type: "button",
          class: `itemRow ${isCleared(item.id) ? "cleared" : ""} ${isReviewNeeded(item.id) ? "review" : ""}`,
          onclick: () => {
            state.session = newSession(item);
            render();
          },
        },
          el("span", { class: "itemNo" }, String(originalIndex + 1).padStart(2, "0")),
          el("span", { class: "itemMain" },
            el("strong", {}, item.sentence),
            el("small", {}, `${item.source || ""} / 挑戦 ${att.attempts || 0} / 正解 ${att.correct || 0} / 誤答 ${att.wrong || 0}${att.lastAt ? ` / 最終 ${formatDateTime(att.lastAt)}` : ""}`)
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
  const att = itemAttempt(item.id);
  if (isReviewNeeded(item.id)) return "REVIEW";
  if (isCleared(item.id)) return "CLEAR";
  return "OPEN";
}

function renderFilterButtons(items) {
  const counts = {
    all: items.length,
    open: items.filter((item) => !isCleared(item.id)).length,
    review: items.filter((item) => isReviewNeeded(item.id)).length,
    cleared: items.filter((item) => isCleared(item.id)).length,
  };
  return el("div", { class: "filterButtons", role: "group", "aria-label": "文リスト表示" },
    ...["all", "open", "review", "cleared"].map((filter) => el("button", {
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
        el("h2", {}, "教材JSONを作る")
      ),
      el("button", { class: "ghost", type: "button", onclick: () => { state.editor = defaultEditorState(); renderEditor(); } }, "新規")
    ),
    renderEditorInputs(),
    renderEditorTools(),
    renderValidationBox(validation),
    renderEditorChunks(),
    renderSavedItems(),
    renderJsonPreview()
  ));
}

function renderEditorInputs() {
  return el("div", { class: "editorGrid" },
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
    field("英文", el("textarea", {
      rows: "3",
      placeholder: "例: I think that he is honest.",
      oninput: (e) => { state.editor.sentence = e.target.value; updateJsonPreviewOnly(); },
    }, state.editor.sentence))
  );
}

function renderEditorTools() {
  return el("div", { class: "actions" },
    el("button", { class: "primary", type: "button", onclick: tokenizeSentence }, "単語に分割"),
    el("button", { class: "ghost", type: "button", onclick: mergeSelectedWithNext }, "次と結合"),
    el("button", { class: "ghost", type: "button", onclick: splitSelectedChunk }, "空白で分割"),
    el("button", { class: "ghost", type: "button", onclick: makeSelectedClause }, "節にする"),
    el("button", { class: "ghost", type: "button", onclick: addCurrentItemToDataset }, "教材に追加"),
    el("button", { class: "ghost", type: "button", onclick: importJsonFromTextarea }, "JSON読込"),
    el("button", { class: "ghost", type: "button", onclick: downloadEditorJson }, "単文JSON保存"),
    el("button", { class: "primary", type: "button", onclick: downloadDatasetJson }, "教材JSON保存")
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
  const idx = state.editor.selectedChunk;
  if (idx < 0 || idx >= state.editor.chunks.length - 1) return;
  const current = state.editor.chunks[idx];
  const next = state.editor.chunks[idx + 1];
  current.text = `${current.text} ${next.text}`.replace(/\s+([.,!?;:])/g, "$1");
  if (!current.translation && next.translation) current.translation = next.translation;
  state.editor.chunks.splice(idx + 1, 1);
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
    return el("div", { class: "emptyBox" }, "英文を入力して「単語に分割」を押してください。");
  }
  return el("div", { class: "editorChunks" },
    ...state.editor.chunks.map((chunk, index) => renderEditableChunk(chunk, index))
  );
}

function renderEditableChunk(chunk, index) {
  const selected = state.editor.selectedChunk === index;
  return el("div", { class: `editChunk ${selected ? "selected" : ""}` },
    el("button", {
      class: "chunkSelect",
      type: "button",
      onclick: () => { state.editor.selectedChunk = index; renderEditor(); },
    }, chunk.text || "(empty)"),
    selected ? el("div", { class: "chunkForm" },
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
    ) : null
  );
}

function roleSelect(chunk) {
  return el("select", {
    onchange: (e) => { chunk.role = e.target.value; updateJsonPreviewOnly(); },
  }, ...ROLES.concat("接続").map((role) => el("option", {
    value: role,
    selected: chunk.role === role ? "selected" : null,
  }, role)));
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
    el("p", { class: "label" }, ok ? "Ready" : "Check"),
    ok ? el("p", {}, "この文はプレイヤーで使用できます。") : el("ul", {},
      ...validation.errors.map((message) => el("li", {}, message))
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
  if (validation.errors.length) {
    alert(`教材に追加できません:\n${validation.errors.join("\n")}`);
    return;
  }
  const existingIndex = state.editor.savedItems.findIndex((saved) => saved.id === item.id);
  if (existingIndex >= 0) state.editor.savedItems[existingIndex] = item;
  else state.editor.savedItems.push(item);
  renderEditor();
}

function loadEditorItem(item) {
  state.editor.source = item.source || "JSON読込";
  state.editor.itemId = item.id || `custom_${Date.now()}`;
  state.editor.sentence = item.sentence || "";
  state.editor.chunks = cloneItem(item).root?.chunks || [];
  state.editor.selectedChunk = state.editor.chunks.length ? 0 : -1;
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
  return {
    id: state.editor.itemId || `custom_${Date.now()}`,
    source: state.editor.source || "手入力",
    sentence: state.editor.sentence,
    root: {
      chunks: state.editor.chunks,
    },
  };
}

function editorDataset() {
  const current = editorItem();
  const validation = validateEditorItem(current);
  const hasCurrent = validation.errors.length === 0;
  const items = state.editor.savedItems.slice();
  if (hasCurrent && !items.some((item) => item.id === current.id)) items.push(current);
  return {
    meta: {
      id: state.editor.datasetId || "custom-reading-set",
      label: state.editor.datasetLabel || "自作 英文解釈",
      source: "英文解釈トレーナー 先生エディタ",
      version: 1,
    },
    items,
  };
}

function renderJsonPreview() {
  const json = JSON.stringify(editorDataset(), null, 2);
  state.editor.rawJson = json;
  return el("div", { class: "jsonArea" },
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
      sentence: item.sentence || "",
      chunks: cloneItem(item).root.chunks,
      selectedChunk: item.root.chunks.length ? 0 : -1,
      savedItems,
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
  if (!dataset.items.length) {
    alert("保存できる文がありません。先にchunkと訳を入力してください。");
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
