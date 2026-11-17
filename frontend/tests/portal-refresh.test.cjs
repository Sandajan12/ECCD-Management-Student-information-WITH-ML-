const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve, dirname } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const frontendRequire = createRequire(resolve(__dirname, "../package.json"));
const ts = frontendRequire("typescript");
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Execute the real hooks with deterministic effects, events, clock and API.
// No browser, backend, external services or extra test dependencies are needed.
function environment() {
  let now = 100000, active, nextTimer = 0;
  const timers = new Map(), modules = new Map(), calls = [], stored = new Map();
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      emit(name, detail) { for (const fn of [...(listeners.get(name) || [])]) fn({ detail }); },
    };
  };
  const window = target(), document = {
    ...target(), visibilityState: "visible",
    documentElement: { style: { setProperty() {} } },
  };
  const navigator = { onLine: true };
  const env = {
    window, document, navigator, timers, calls, stored,
    auth: { user: { id: 1, role: "admin" }, token: "token-1", updateUser() {} },
    respond: async (path) => path.includes("pending") ? [] : {},
    advance(ms) { now += ms; },
    async tick(ms) {
      now += ms;
      for (;;) {
        const due = [...timers].find(([, timer]) => timer.at <= now);
        if (!due) break;
        timers.delete(due[0]); due[1].fn(); await flush();
      }
    },
  };
  const API = {
    defaults: { baseURL: "http://localhost" },
    get(path, config) {
      calls.push({ path, config });
      return Promise.resolve(env.respond(path, config)).then((data) => ({ data }));
    },
    request(config) { return this.get(config.url, config); },
  };
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    createContext: (value) => ({ Provider: "provider", value }),
    useContext: (context) => context.value,
    useRef(value) {
      const runner = active, i = runner.cursor++;
      return runner.slots[i] ||= { current: value };
    },
    useState(value) {
      const runner = active, i = runner.cursor++;
      if (!(i in runner.slots)) runner.slots[i] = typeof value === "function" ? value() : value;
      return [runner.slots[i], (next) => {
        runner.slots[i] = typeof next === "function" ? next(runner.slots[i]) : next;
      }];
    },
    useCallback(fn, deps) {
      const runner = active, i = runner.cursor++;
      if (!same(runner.slots[i]?.deps, deps)) runner.slots[i] = { fn, deps };
      return runner.slots[i].fn;
    },
    useEffect(fn, deps) {
      const runner = active, i = runner.cursor++;
      if (!same(runner.slots[i]?.deps, deps)) {
        const prior = runner.slots[i];
        runner.slots[i] = { fn, deps, effect: true };
        runner.effects.push(() => { prior?.cleanup?.(); runner.slots[i].cleanup = fn(); });
      }
    },
  };
  const apiExports = {
    __esModule: true, default: API,
    getAccessToken: () => env.auth.token,
    errorMessage: (error) => error.message,
    isNetworkError: (error) => error.network === true,
  };
  function load(file) {
    const path = resolve(__dirname, "../src", file);
    if (modules.has(path)) return modules.get(path);
    const exports = {};
    modules.set(path, exports);
    const source = readFileSync(path, "utf8").replaceAll("import.meta.env", "({})");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(compiled, {
      exports, window, document, navigator, AbortController,
      Date: class extends Date { static now() { return now; } },
      localStorage: {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
      },
      setInterval() { throw new Error("Unexpected background polling"); },
      setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
      require(name) {
        if (name === "react") return hooks;
        if (name === "axios") return { __esModule: true, default: { isAxiosError: (err) => Boolean(err.response) } };
        if (name.endsWith("/api") || name === "./api") return apiExports;
        if (name.endsWith("/AuthContext") || name === "./AuthContext") return { useAuth: () => env.auth };
        if (name.endsWith("context/TeacherContext") && env.teacher) return { useTeacher: () => env.teacher };
        if (name === "socket.io-client") return { io: (...args) => env.io(...args) };
        if (name.endsWith("utils/drafts")) return { listPending: () => [], isTeacherEccdDraft: () => false };
        if (name.startsWith(".")) {
          const base = resolve(dirname(path), name);
          const dependency = [base + ".ts", base + ".tsx"].find(existsSync);
          assert.ok(dependency, `Missing dependency: ${name}`);
          return load(dependency);
        }
        return frontendRequire(name);
      },
    }, { filename: path });
    return exports;
  }
  env.load = load;
  env.runner = (run) => {
    const runner = {
      slots: [], effects: [], cursor: 0,
      render() {
        runner.cursor = 0; active = runner;
        const value = run();
        runner.effects.splice(0).forEach((effect) => effect());
        return value;
      },
      replay() {
        runner.slots.filter((slot) => slot?.effect).forEach((slot) => { slot.cleanup?.(); slot.cleanup = slot.fn(); });
      },
      unmount() { runner.slots.filter((slot) => slot?.effect).forEach((slot) => slot.cleanup?.()); },
    };
    return runner;
  };
  return env;
}

test("wake refresh waits 60 seconds, coalesces events, skips offline/hidden and cleans up", async () => {
  const env = environment();
  let reads = 0;
  const stop = env.load("hooks/refreshOnWake.ts").refreshOnWake(() => { reads++; });
  env.window.emit("focus"); env.advance(59999); env.window.emit("online");
  assert.equal(reads, 0);
  env.advance(1); env.window.emit("focus"); env.document.emit("visibilitychange"); env.window.emit("online");
  assert.equal(reads, 1);
  env.advance(60000); env.document.visibilityState = "hidden"; env.window.emit("focus");
  env.document.visibilityState = "visible"; env.navigator.onLine = false; env.window.emit("focus");
  assert.equal(reads, 1);
  env.navigator.onLine = true; env.window.emit("online"); assert.equal(reads, 2);
  stop(); env.advance(60000); env.window.emit("focus"); assert.equal(reads, 2);
  assert.equal(env.timers.size, 0);
});

test("shared GET deduplicates overlap, isolates credentials and permits retry after failure", async () => {
  const env = environment(), result = deferred();
  env.respond = () => result.promise;
  const { sharedGet } = env.load("services/sharedGet.ts");
  const a = sharedGet("/pending", { a: 1, b: 2 });
  assert.equal(sharedGet("/pending", { b: 2, a: 1 }), a);
  env.auth.token = "other-account";
  const b = sharedGet("/pending", { a: 1, b: 2 });
  assert.notEqual(a, b); assert.equal(env.calls.length, 2);
  result.reject(new Error("offline"));
  await Promise.all([assert.rejects(a, /offline/), assert.rejects(b, /offline/)]);
  env.respond = async () => [];
  await sharedGet("/pending", { a: 1, b: 2 }); assert.equal(env.calls.length, 3);
});

test("Teacher provider shares one pending read across consumers, StrictMode and token renewal", async () => {
  const env = environment(), pending = deferred();
  env.respond = async (path) => {
    if (path.endsWith("/pending")) return pending.promise;
    if (path === "/api/sections/") return [{ section_id: 1, section_name: "A" }];
    if (path.endsWith("dashboard-filters")) return { sections: ["A"] };
    return { section_id: 1, section_name: "A" };
  };
  const { TeacherProvider } = env.load("context/TeacherContext.tsx");
  const runner = env.runner(() => TeacherProvider({ children: null }));
  runner.render(); runner.replay();
  const count = () => env.calls.filter((call) => call.path.endsWith("/pending")).length;
  assert.equal(count(), 1);
  pending.resolve([{ observation_id: 5, has_photo: true }]); await flush();
  const shared = runner.render().props.value.homeObservations;
  assert.equal(shared.rows[0].has_photo, true);
  for (let consumer = 0; consumer < 3; consumer++) {
    assert.equal(runner.render().props.value.homeObservations.rows, shared.rows);
  }
  env.auth = { ...env.auth, token: "renewed", user: { ...env.auth.user, full_name: "Updated" } };
  runner.render(); await flush(); assert.equal(count(), 1);
  await env.tick(180000); assert.equal(count(), 1);
  env.window.emit("focus"); env.window.emit("online"); env.document.emit("visibilitychange");
  await flush(); assert.equal(count(), 2);
  await runner.render().props.value.homeObservations.refresh(); assert.equal(count(), 3);
  runner.unmount();
});

test("post-save refresh bypasses a pre-save read without losing newer in-flight deduplication", async () => {
  const env = environment(), before = deferred(), after = deferred();
  const { sharedGet } = env.load("services/sharedGet.ts");
  env.respond = () => before.promise;
  const stale = sharedGet("/pending");
  env.respond = () => after.promise;
  const fresh = sharedGet("/pending", undefined, true);
  before.resolve(["old"]); await stale;
  assert.equal(sharedGet("/pending"), fresh);
  after.resolve(["saved"]);
  assert.deepEqual(await fresh, ["saved"]);
  assert.equal(env.calls.length, 2);
});

test("dashboard resource dependencies stay stable across renders and wake events coalesce", async () => {
  const env = environment();
  env.teacher = { initialized: true, error: "", dashboardFilters: { domains: [] } };
  const { useTeacherDashboard } = env.load("hooks/useTeacherDashboard.ts");
  const runner = env.runner(() => useTeacherDashboard(1, "PRE", "All", 1));
  runner.render(); runner.replay(); await flush();
  assert.equal(env.calls.length, 2);
  for (let i = 0; i < 5; i++) runner.render();
  await env.tick(120000); assert.equal(env.calls.length, 2);
  env.window.emit("focus"); env.window.emit("online"); env.document.emit("visibilitychange");
  await flush(); assert.equal(env.calls.length, 4);
  runner.unmount();
});

test("pending state ignores late responses after owner changes and unmount", async () => {
  const env = environment(), old = deferred();
  env.respond = () => old.promise;
  const { useHomeObservations } = env.load("hooks/useHomeObservations.ts");
  let owner = 1;
  const runner = env.runner(() => useHomeObservations(owner));
  runner.render(); owner = 2; env.auth.token = "owner-2";
  env.respond = async () => [{ observation_id: 2 }];
  runner.render(); await flush();
  old.resolve([{ observation_id: 1 }]); await flush();
  assert.equal(runner.render().rows[0].observation_id, 2);
  const late = deferred(); env.respond = () => late.promise;
  const refresh = runner.render().refresh(); runner.unmount();
  late.resolve([{ observation_id: 3 }]); await refresh;
  assert.equal(runner.render().rows[0].observation_id, 2);
});

test("children and assessments coalesce initial reads and stay idle without erasing local drafts", async () => {
  const env = environment();
  const draftKey = "eccd_draft_10_PRE_1_home_1";
  env.stored.set(draftKey, "unsaved parent answers");
  env.auth.user.role = "user";
  env.respond = async (path) => path.includes("my-child")
    ? [{ student_id: 10 }] : { student_id: 10, domains: [] };
  const { useChildren } = env.load("hooks/useChildren.ts");
  const { useAssessment } = env.load("hooks/useAssessment.ts");
  const roster = env.runner(() => useChildren());
  const assessment = env.runner(() => useAssessment(10, true));
  roster.render(); roster.replay(); assessment.render(); assessment.replay();
  await flush();
  assert.equal(env.calls.length, 2);
  assert.equal(roster.render().child.student_id, 10);
  assert.equal(assessment.render().data.student_id, 10);
  env.window.emit("focus"); await flush(); assert.equal(env.calls.length, 2);
  await env.tick(120000); assert.equal(env.calls.length, 2);
  env.window.emit("focus"); env.document.emit("visibilitychange"); await flush();
  assert.equal(env.calls.length, 4);
  await assessment.render().refresh(); assert.equal(env.calls.length, 5);
  assert.equal(env.stored.get(draftKey), "unsaved parent answers");
  roster.unmount(); assessment.unmount();
});

test("SettingsProvider keeps its fetch callback stable across settings rerenders", async () => {
  const env = environment();
  env.respond = async () => ({ system_title: "School", school_year_start_month: 8 });
  const { SettingsProvider } = env.load("context/SettingsContext.tsx");
  const runner = env.runner(() => SettingsProvider({ children: null }));
  const initial = runner.render().props.value.fetchGlobalSettings;
  runner.replay(); await flush();
  assert.equal(runner.render().props.value.fetchGlobalSettings, initial);
  runner.render(); await env.tick(120000); assert.equal(env.calls.length, 1);
  await initial(); assert.equal(env.calls.length, 2);
  runner.unmount();
});

test("messaging prefers WebSockets, never polls idle, and refreshes from push or cooled-down focus", async () => {
  const env = environment(), handlers = {};
  let options;
  const socket = {
    connected: false,
    on(name, fn) { handlers[name] = fn; },
    disconnect() { this.connected = false; }, connect() {},
  };
  env.io = (_, config) => { options = config; return socket; };
  env.respond = async () => ({ unreadCount: 2 });
  const { MessagingClient } = env.load("services/messaging.ts");
  const client = new MessagingClient("token", true), stop = client.start();
  await env.tick(0); socket.connected = true; handlers.connect(); await flush();
  assert.equal(Array.from(options.transports).join(","), "websocket,polling");
  assert.equal(options.tryAllTransports, true);
  assert.equal(env.calls.length, 1);
  let recoveries = 0; client.onRecover(async () => { recoveries++; });
  await env.tick(300000); assert.equal(env.calls.length, 1);
  socket.connected = false;
  handlers.connect_error(new Error("offline socket"));
  await env.tick(300000); assert.equal(env.calls.length, 1);
  env.window.emit("focus"); env.window.emit("online"); await flush();
  assert.equal(env.calls.length, 2); assert.equal(recoveries, 1);
  env.window.emit("focus"); await flush(); assert.equal(env.calls.length, 2);
  handlers.receive_message({ message_id: 1 }); await env.tick(250);
  assert.equal(env.calls.length, 3);
  handlers.receive_message({ message_id: 1 }); await env.tick(250);
  assert.equal(env.calls.length, 3);
  stop(); await env.tick(300000); env.window.emit("focus");
  assert.equal(env.calls.length, 3); assert.equal(env.timers.size, 0);
});

test("messaging honors longer Retry-After without restarting an idle read loop", async () => {
  const env = environment(), handlers = {};
  env.io = () => ({ on(name, fn) { handlers[name] = fn; }, disconnect() {} });
  env.respond = async () => ({ unreadCount: 0 });
  const { MessagingClient } = env.load("services/messaging.ts");
  const client = new MessagingClient("token", true), stop = client.start();
  await env.tick(0); handlers.connect(); await flush();
  client.failure({ response: { status: 429, headers: { "retry-after": "120" } } });
  await env.tick(60000); env.window.emit("focus"); await flush();
  assert.equal(env.calls.length, 1);
  await env.tick(60000); assert.equal(env.calls.length, 2);
  await env.tick(300000); assert.equal(env.calls.length, 2);
  stop(); assert.equal(env.timers.size, 0);
});
