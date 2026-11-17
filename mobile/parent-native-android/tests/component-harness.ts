import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";

export type Props = Record<string, unknown>;
export interface Element {
  type: string | symbol | ((props: Props) => Element);
  props: Props;
}
interface Slot {
  value?: unknown;
  deps?: readonly unknown[];
  cleanup?: () => void;
}
interface Frame {
  slots: Slot[];
  index: number;
  effects: Array<() => void>;
}
export interface Renderer {
  render: (props?: Props) => Element;
  unmount: () => void;
}
export const elements = (node: unknown): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
};
export const text = (node: unknown): string => {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node && typeof node === "object" && "props" in node)
    return text((node as Element).props.children);
  return typeof node === "string" || typeof node === "number"
    ? String(node)
    : "";
};

/** Exercises actual component handlers with mocked hooks/hosts; this is not native gesture or layout testing. */
export function componentHarness(file: string, mocks: Record<string, unknown>) {
  const filename = fileURLToPath(new URL(`../src/${file}`, import.meta.url));
  const require = createRequire(filename);
  let current: Frame;
  const slot = () => (current.slots[current.index++] ||= {});
  const equal = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !!a &&
    !!b &&
    a.length === b.length &&
    a.every((v, i) => Object.is(v, b[i]));
  const react: Record<string, unknown> = {
    __esModule: true,
    Fragment: Symbol("Fragment"),
    createElement: (
      type: Element["type"],
      props: Props | null,
      ...children: unknown[]
    ) => ({
      type,
      props: {
        ...props,
        children: children.length === 1 ? children[0] : children,
      },
    }),
    useState: (initial: unknown) => {
      const s = slot();
      if (!("value" in s))
        s.value = typeof initial === "function" ? initial() : initial;
      return [
        s.value,
        (next: unknown) => {
          s.value = typeof next === "function" ? next(s.value) : next;
        },
      ];
    },
    useRef: (value: unknown) => {
      const s = slot();
      return (s.value ||= { current: value });
    },
    useMemo: (fn: () => unknown, deps: readonly unknown[]) => {
      const s = slot();
      if (!equal(s.deps, deps)) {
        s.value = fn();
        s.deps = deps;
      }
      return s.value;
    },
    useEffect: (fn: () => (() => void) | void, deps: readonly unknown[]) => {
      const s = slot();
      if (equal(s.deps, deps)) return;
      s.deps = deps;
      current.effects.push(() => {
        s.cleanup?.();
        s.cleanup = fn() || undefined;
      });
    },
    useContext: (context: string) =>
      context === "BrandColor" ? "#4543c0" : { system_name: "AMES Parent" },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
      snapshot(),
  };
  react.default = react;
  const native = {
    Pressable: "Pressable",
    View: "View",
    Text: "Text",
    Keyboard: { addListener: () => ({ remove() {} }) },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
  };
  const ui = new Proxy({ styles: { row: {}, card: {} }, fonts: {} } as Props, {
    get: (target, key) => target[String(key)] ?? key,
  });
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports: Record<string, (props: Props) => Element> = {};
  const module = { exports };
  const resolve = (id: string): unknown => {
    if (id === "react") return react;
    if (id === "react-native") return native;
    if (id === "./ui") return ui;
    if (id in mocks) return mocks[id];
    if (id === "react-native-image-picker") return {launchImageLibrary: async () => ({didCancel: true})};
    if (id.startsWith("./")) return require(`${id}.ts`);
    return require(id);
  };
  new Function("require", "module", "exports", compiled)(
    resolve,
    module,
    exports,
  );
  function renderer(
    component: (props: Props) => Element,
    initial: Props,
  ): Renderer {
    const frame: Frame = { slots: [], index: 0, effects: [] };
    let props = initial;
    return {
      render(next = props) {
        props = next;
        current = frame;
        frame.index = 0;
        const result = component(props);
        for (const effect of frame.effects.splice(0)) effect();
        return result;
      },
      unmount() {
        for (const s of frame.slots) s.cleanup?.();
        frame.slots.length = 0;
      },
    };
  }
  return {
    mount: (name: string, props: Props) =>
      renderer(module.exports[name], props),
    child: (element: Element) =>
      renderer(element.type as (props: Props) => Element, element.props),
  };
}
