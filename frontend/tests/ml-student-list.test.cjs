// Exercise the actual student-list controls without a browser or API server.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const frontendRequire = createRequire(resolve(__dirname, "../package.json"));
const ts = frontendRequire("typescript");
const source = readFileSync(resolve(__dirname, "../src/pages/teacher/MlInsights.tsx"), "utf8");
const compiled = ts.transpileModule(source + "\nexport { StudentEvaluation };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const roster = Array.from({ length: 31 }, (_, index) => ({
  student_id: index + 1, student_name: `Learner ${index + 1}`,
  pre_complete: index % 2 === 0, readiness_note: "PRE status from the API",
}));

async function studentList(initialRoster = roster) {
  const slots = [], effects = [], listeners = {}, batches = [], exports = {};
  let cursor = 0, students = initialRoster;
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], (value) => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useEffect(effect, deps) {
      const slot = cursor++;
      if (!slots[slot] || deps.some((value, index) => value !== slots[slot][index])) {
        slots[slot] = deps;
        effects.push(effect);
      }
    },
  };
  runInNewContext(compiled, {
    exports, AbortController,
    window: { addEventListener: (name, callback) => { listeners[name] = callback; }, removeEventListener() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "@mui/material") return new Proxy({}, { get: (_, key) => String(key) });
      if (name.endsWith("services/api")) return { __esModule: true, default: { get: async () => ({ data: students }) } };
      if (name.endsWith("context/TeacherContext")) return { useTeacher: () => ({ section: { section_id: 1 } }) };
      if (name.endsWith("utils/drafts")) return { useDurableForm: () => ({ values: { studentId: "" }, change() {} }) };
      if (name.endsWith("utils/concurrency")) return { settleWithConcurrency: async (items, limit) => {
        batches.push({ ids: Array.from(items, (item) => item.student_id), limit });
        return items.map(() => ({ status: "fulfilled" }));
      } };
      if (name.startsWith("../")) return {};
      return frontendRequire(name);
    },
  });
  function elements(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    return [node, ...elements(node.props?.children)];
  }
  function render() {
    cursor = 0;
    const nodes = elements(exports.StudentEvaluation({ sectionId: 1, tabs: null, active: true }));
    for (const effect of effects.splice(0)) effect();
    return nodes;
  }
  const flush = () => new Promise(setImmediate);
  render();
  await flush();
  return { render, batches, flush, async reload(next) {
    students = next; listeners.online(); render(); await flush();
  } };
}
const pager = (nodes) => nodes.find((node) => node.type === "Pagination");
const filter = (nodes) => nodes.find((node) => node.type === "FormControlLabel").props.control;
const rows = (nodes) => nodes.filter((node) => node.type === "tr" && node.props["aria-haspopup"] === "dialog");
const names = (nodes) => rows(nodes).map((row) => row.props.children[0].props.children);
const content = (nodes) => nodes.flatMap((node) => typeof node.props?.children === "string" ? [node.props.children] : []).join(" ");

test("31 students are reachable in four pages with correct ranges and no dropped rows", async () => {
  const view = await studentList();
  let nodes = view.render();
  assert.equal(pager(nodes).props.count, 4);
  const seen = [];
  for (let page = 1; page <= 4; page++) {
    pager(nodes).props.onChange(null, page);
    nodes = view.render();
    assert.equal(rows(nodes).length, page === 4 ? 1 : 10);
    seen.push(...names(nodes));
  }
  assert.deepEqual(seen, roster.map((student) => student.student_name));
  assert.match(content(nodes), /Showing 31–31 of 31 learners/);
});

test("Ready PRE filter resets pagination and Predict All keeps all eligible students", async () => {
  const view = await studentList();
  let nodes = view.render();
  pager(nodes).props.onChange(null, 4);
  nodes = view.render();
  filter(nodes).props.onChange(null, true);
  nodes = view.render();
  assert.equal(pager(nodes).props.page, 1);
  assert.equal(pager(nodes).props.count, 2);
  assert.deepEqual(names(nodes), roster.filter((student) => student.pre_complete).slice(0, 10).map((student) => student.student_name));
  assert.match(content(nodes), /Showing 1–10 of 16 learners/);
  pager(nodes).props.onChange(null, 2);
  nodes = view.render();
  assert.equal(rows(nodes).length, 6);
  nodes.find((node) => node.type === "button" && node.props.disabled === false).props.onClick();
  view.render();
  await view.flush();
  assert.deepEqual(view.batches, [{ ids: roster.filter((student) => student.pre_complete).map((student) => student.student_id), limit: 3 }]);
  nodes = view.render();
  filter(nodes).props.onChange(null, false);
  nodes = view.render();
  assert.equal(pager(nodes).props.page, 1);
  assert.equal(pager(nodes).props.count, 4);
});

test("empty readiness results and shrinking refreshed rosters keep the list usable", async () => {
  const view = await studentList(roster.map((student) => ({ ...student, pre_complete: false })));
  let nodes = view.render();
  filter(nodes).props.onChange(null, true);
  nodes = view.render();
  assert.equal(rows(nodes).length, 0);
  assert.equal(pager(nodes), undefined);
  assert.match(content(nodes), /No learners with a Ready PRE assessment/);
  filter(nodes).props.onChange(null, false);
  nodes = view.render();
  pager(nodes).props.onChange(null, 4);
  await view.reload(roster.slice(0, 2));
  nodes = view.render();
  assert.equal(pager(nodes).props.page, 1);
  assert.equal(rows(nodes).length, 2);
  await view.reload([]);
  nodes = view.render();
  assert.equal(pager(nodes), undefined);
  assert.match(content(nodes), /No active learners in this section yet/);
});
