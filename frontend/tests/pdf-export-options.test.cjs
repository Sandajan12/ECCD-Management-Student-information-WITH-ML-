// Exercise the dialog's selection and download handlers without a browser.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const frontendRequire = createRequire(resolve(__dirname, "../package.json"));
const ts = frontendRequire("typescript");
const source = readFileSync(resolve(__dirname, "../src/components/teacher/EccdDownloadDialog.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function dialog(kind = "records") {
  const states = [];
  let index = 0;
  const exports = {};
  runInNewContext(compiled, {
    exports, URLSearchParams,
    require(name) {
      if (name === "react") return {
        useState(initial) {
          const slot = index++;
          if (!(slot in states)) states[slot] = initial;
          return [states[slot], (value) => { states[slot] = value; }];
        },
      };
      if (name === "@mui/material") return new Proxy({}, { get: (_, key) => String(key) });
      return frontendRequire(name);
    },
  });
  const downloads = [];
  const props = {
    kind, section: { section_id: 1 },
    students: [{ student_id: 8, section_id: 1, school_year: "2026-2027", is_active: true }],
    currentSchoolYear: "2026-2027", schoolYears: ["2025-2026"],
    initialStudentId: "8", downloading: false, onClose() {},
    async onDownload(...args) { downloads.push(args); return null; },
  };
  function elements(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    return [node, ...elements(node.props?.children)];
  }
  return {
    downloads, props,
    render() { index = 0; return elements(exports.default(props)); },
  };
}

test("individual checklist defaults to the unchanged Excel request and can select PDF", () => {
  const view = dialog();
  let elements = view.render();
  assert.equal(elements.find((e) => e.props?.label === "File Format").props.value, "xlsx");
  elements.find((e) => e.type === "Button" && e.props.variant === "contained").props.onClick();
  assert.equal(view.downloads[0][0], "/api/eccd/export/card-single?school_year=2026-2027&student_id=8");
  assert.equal(view.downloads[0][1], "ECCD_Assessment_2026-2027.xlsx");
  elements.find((e) => e.props?.label === "File Format").props.onChange({ target: { value: "pdf" } });
  elements = view.render();
  elements.find((e) => e.type === "Button" && e.props.variant === "contained").props.onClick();
  assert.match(view.downloads[1][0], /format=pdf/);
  assert.match(view.downloads[1][1], /\.pdf$/);
});

test("PDF summary and archived records retain section and year scope", () => {
  for (const kind of ["records", "summary"]) {
    const view = dialog(kind);
    let elements = view.render();
    elements.find((e) => e.props?.label === "File Format").props.onChange({ target: { value: "pdf" } });
    elements.find((e) => e.props?.label === "School Year").props.onChange({ target: { value: "2025-2026" } });
    elements = view.render();
    const download = elements.find((e) => e.type === "Button" && e.props.variant === "contained");
    assert.equal(download.props.disabled, false);
    download.props.onClick();
    const [path, filename] = view.downloads[0];
    assert.match(path, new RegExp(`/export/${kind === "summary" ? "section-summary" : "cards-zip"}\\?`));
    const query = new URLSearchParams(path.split("?")[1]);
    assert.equal(query.get("format"), "pdf");
    assert.equal(query.get("section_id"), "1");
    assert.equal(query.get("school_year"), "2025-2026");
    assert.match(filename, kind === "summary" ? /\.pdf$/ : /\.zip$/);
  }
});

test("download controls are locked while a request is in progress", () => {
  const view = dialog();
  view.props.downloading = true;
  const elements = view.render();
  const button = elements.find((e) => e.type === "Button" && e.props.variant === "contained");
  assert.equal(button.props.disabled, true);
  button.props.onClick();
  assert.equal(view.downloads.length, 0);
});
