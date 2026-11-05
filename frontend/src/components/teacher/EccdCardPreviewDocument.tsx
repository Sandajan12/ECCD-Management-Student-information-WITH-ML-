import { useMemo } from "react";
import type { SyntheticEvent } from "react";
import previewUtilities from "./eccdCardPreview.css?inline";

interface EccdCardPreviewDocumentProps {
  html: string;
}

const HEADER_LABELS = new Set([
  "PRE",
  "PRETEST",
  "PRE-TEST",
  "MID",
  "POST",
  "POSTTEST",
  "POST-TEST",
  "KAYA",
  "DI-KAYA",
  "RAW SCORE",
  "SCALED SCORE",
]);

function frameDocument(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  // The iframe keeps its sandbox and CSP. Only compiled presentation utilities
  // enter the document; workbook content, merged cells and colgroup stay intact.
  const stylesheet = document.createElement("style");
  stylesheet.textContent = previewUtilities;
  document.head.append(stylesheet);
  document.body.classList.add("p-0!");
  document.querySelectorAll("table").forEach((table) => {
    // Intrinsic sizing lets long score labels reserve space without overlapping
    // adjacent columns. The outer viewer owns scrolling for the complete sheet.
    table.classList.add("table-auto!", "min-w-full!");
    table.querySelectorAll<HTMLTableCellElement>("td, th").forEach((cell) => {
      const label = cell.textContent?.trim().replace(/\s+/g, " ");
      if (!label || !HEADER_LABELS.has(label)) return;
      cell.classList.add(
        "text-[10px]!",
        "sm:text-[11px]!",
        "leading-tight!",
        "text-center!",
        "py-1!",
        "px-1!",
        "whitespace-nowrap!",
      );
      if (cell.colSpan === 1) {
        cell.classList.add("w-8!", "sm:w-10!", "min-w-8!");
      }
    });
  });
  return `<!doctype html>${document.documentElement.outerHTML}`;
}

export default function EccdCardPreviewDocument({
  html,
}: EccdCardPreviewDocumentProps) {
  const source = useMemo(() => frameDocument(html), [html]);

  function fitDocument(event: SyntheticEvent<HTMLIFrameElement>): void {
    const frame = event.currentTarget;
    const document = frame.contentDocument;
    if (!document?.body) return;
    const body = document.body;
    // Fit the static document before measuring its height. A second width pass
    // accounts for the renderer's responsive header utilities at the new width.
    // The small allowance includes collapsed table borders and pixel rounding.
    frame.width = String(Math.ceil(body.scrollWidth) + 2);
    frame.width = String(Math.ceil(body.scrollWidth) + 2);
    frame.height = String(Math.ceil(body.scrollHeight + body.offsetTop * 2));
  }

  return (
    <div className="mx-auto w-fit min-w-[980px] rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
      <iframe
        title="Official ECCD Card"
        // Document access is used only for sizing; scripts remain sandboxed.
        sandbox="allow-same-origin"
        srcDoc={source}
        onLoad={fitDocument}
        className="block max-w-none zoom-50 border-0"
      />
    </div>
  );
}
