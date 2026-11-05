import React from "react";
import ChatInterface from "../../components/ChatInterface";

const MessageParent: React.FC = () => {
  return (
    <section className="flex h-[calc(100dvh-5.25rem)] min-h-0 flex-col gap-4 legacy-sm:h-[calc(100dvh-5.5rem)] legacy-md:h-[calc(100dvh-3rem)]">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Message Parents
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Communicate directly and securely with your student's parents.
        </p>
      </div>

      {/* Keep shared chat styling local and preserve its mobile panel switch. */}
      <div
        className={[
          "h-[calc(100vh-140px)] min-h-0 flex-1 overflow-hidden flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm",
          // Let the shared Paper shrink within the available viewport height.
          "[&>.MuiPaper-root]:h-full! [&>.MuiPaper-root]:min-h-0! [&>.MuiPaper-root]:min-w-0 [&>.MuiPaper-root]:flex-1 [&>.MuiPaper-root]:rounded-none! [&>.MuiPaper-root]:border-0! [&>.MuiPaper-root]:shadow-none!",
          "[&>.MuiPaper-root>div]:min-h-0 [&>.MuiPaper-root>div]:min-w-0 [&_.MuiList-root]:min-h-0 [&_.MuiList-root]:overflow-y-auto [&_.MuiList-root]:overscroll-contain",
          // The message feed directly precedes the existing composer form.
          "[&_div:has(+form)]:min-h-0 [&_div:has(+form)]:overflow-y-auto [&_div:has(+form)]:overscroll-contain [&_div:has(+form)]:gap-0! [&_div:has(+form)]:space-y-2 [&_div:has(+form)>div]:shrink-0",
          "[&_div:has(+form)>div>div]:px-3.5! [&_div:has(+form)>div>div]:py-2! [&_div:has(+form)>div>div]:rounded-2xl! [&_div:has(+form)>div>div]:text-sm [&_div:has(+form)>div>div]:leading-relaxed",
          "[&_div:has(+form)_.MuiTypography-body2]:text-sm! [&_div:has(+form)_.MuiTypography-body2]:leading-relaxed!",
        ].join(" ")}
      >
        <ChatInterface currentUserRole="teacher" />
      </div>
    </section>
  );
};

export default MessageParent;
