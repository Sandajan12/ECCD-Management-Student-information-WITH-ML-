import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "tailwindcss";
const files = ["ParentEccdAssessment.jsx"];
const content = await Promise.all(
  files.map((file) =>
    readFile(
      new URL(
        `../../../AMES-SYSTEM-LEGACY/frontend/src/pages/users/${file}`,
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
const result = await postcss([
  tailwind({
    content: content.map((raw) => ({ raw, extension: "jsx" })),
    corePlugins: { preflight: false },
    important: ".parent-portal",
  }),
]).process("@tailwind utilities;", { from: undefined });
await writeFile(
  new URL(
    "../../src/components/parent/reference-utilities.css",
    import.meta.url,
  ),
  "/* Scoped measurements from the read-only legacy parent assessment. */\n" +
    result.css,
);
