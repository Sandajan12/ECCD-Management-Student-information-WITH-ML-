import { useEffect, useId, useRef, useState } from "react";
import Popover from "@mui/material/Popover";
import type { Section, SectionCreatePayload } from "../../types";
import { errorMessage } from "../../services/api";
import { readDraft, useDurableForm } from "../../utils/drafts";
import type { RecordSyncedEvent } from "../../utils/drafts";
import Icon from "./Icon";
import { IconButton, Notice } from "./ui";

interface SectionPickerProps {
  sections: Section[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (section: Section) => void;
  onRenamed: (sectionId: number, name: string) => void;
  onBusyChange: (busy: boolean) => void;
}
interface SectionNameEditorProps {
  section: Section;
  sections: Section[];
  onDone: () => void;
  onRenamed: SectionPickerProps["onRenamed"];
  onSavingChange: (saving: boolean) => void;
}

function SectionNameEditor({
  section,
  sections,
  onDone,
  onRenamed,
  onSavingChange,
}: SectionNameEditorProps) {
  const { values, change, save, key } = useDurableForm<SectionCreatePayload>(
    `section_rename_${section.section_id}`,
    { section_name: section.section_name },
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => {
    const synced = (event: Event) => {
      const syncedEvent = event as RecordSyncedEvent<SectionCreatePayload>;
      if (syncedEvent.detail !== key || !syncedEvent.response) return;
      onRenamed(section.section_id, syncedEvent.response.section_name);
      // A completed older revision must not discard newer unsaved input.
      if (!readDraft(key)) onDone();
    };
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [key, section.section_id, onRenamed, onDone]);
  const submit = async () => {
    if (submitting.current) return;
    const name = values.section_name.trim();
    if (!name) {
      setError("Enter a section name.");
      input.current?.focus();
      return;
    }
    if (
      sections.some(
        (item) =>
          item.section_id !== section.section_id &&
          item.section_name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("Section name already exists.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    onSavingChange(true);
    setError("");
    try {
      const result = await save(`/api/sections/${section.section_id}`, "put", {
        section_name: name,
      });
      if (result === "saved") {
        onRenamed(section.section_id, name);
        onDone();
      } else
        setError("Draft saved. The section will update after reconnection.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  };
  return (
    <div
      className="w-full min-w-0 p-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Editing keys must never select a row or submit the surrounding teacher form.
        event.stopPropagation();
        if (
          event.key === "Enter" &&
          event.target === input.current &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          void submit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          if (!submitting.current) onDone();
        }
      }}
    >
      <div className="flex items-center gap-1" aria-busy={saving}>
        <input
          ref={input}
          type="text"
          aria-label={`Section name for ${section.section_name}`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          value={values.section_name}
          disabled={saving}
          maxLength={100}
          onChange={(event) => {
            change({ section_name: event.target.value });
            setError("");
          }}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <IconButton
          small
          aria-label="Save section name"
          disabled={saving}
          onClick={(event) => {
            event.stopPropagation();
            void submit();
          }}
          className="text-emerald-700"
        >
          {saving ? (
            <span
              role="status"
              aria-label="Saving section name"
              className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
          ) : (
            <Icon name="Check" className="size-5" />
          )}
        </IconButton>
        <IconButton
          small
          aria-label="Cancel section rename"
          disabled={saving}
          onClick={(event) => {
            event.stopPropagation();
            onDone();
          }}
        >
          <Icon name="Close" className="size-5" />
        </IconButton>
      </div>
      <div id={errorId}>
        <Notice tone="error">{error}</Notice>
      </div>
    </div>
  );
}

export default function SectionPicker({
  sections,
  value,
  disabled,
  onChange,
  onAdd,
  onDelete,
  onRenamed,
  onBusyChange,
}: SectionPickerProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = sections.find(
    (section) => String(section.section_id) === value,
  );
  useEffect(() => {
    onBusyChange(editing !== null);
    return () => onBusyChange(false);
  }, [editing, onBusyChange]);
  const focusRow = (sectionId?: number) => {
    const rows = Array.from(
      body.current?.querySelectorAll<HTMLButtonElement>(
        "[data-section-choice]",
      ) || [],
    );
    (
      rows.find(
        (row) => row.dataset.sectionChoice === String(sectionId ?? value),
      ) || rows[0]
    )?.focus();
  };
  const finishEditing = () => {
    const sectionId = editing;
    setEditing(null);
    requestAnimationFrame(() => focusRow(sectionId ?? undefined));
  };
  const close = () => {
    if (!saving) {
      setAnchor(null);
      setEditing(null);
    }
  };
  return (
    <div className="col-span-full min-w-0">
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-bold leading-[1.66]"
      >
        Class Name / Section
      </label>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label="Class Name / Section"
        aria-haspopup="dialog"
        aria-controls={anchor ? `${id}-popup` : undefined}
        aria-expanded={!!anchor}
        disabled={disabled}
        onClick={() => setAnchor(trigger.current)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setAnchor(trigger.current);
          }
        }}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded border border-black/25 bg-[#f9f9f9] px-3.5 py-2 text-left text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
      >
        <span
          className={`min-w-0 truncate ${selected ? "text-slate-800" : "text-slate-400"}`}
        >
          {selected?.section_name || "Select a Section"}
        </span>
        <span aria-hidden="true" className="shrink-0 text-slate-500">
          ▾
        </span>
      </button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={close}
        container={anchor?.closest("dialog") || undefined}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        marginThreshold={16}
        slotProps={{
          paper: {
            className:
              "flex min-h-0 flex-col overflow-hidden! rounded-xl! border border-slate-200 bg-white shadow-lg!",
            sx: {
              width: anchor?.offsetWidth,
              maxWidth: "calc(100vw - 2rem)",
              maxHeight: "calc(100dvh - 2rem)",
            },
          },
          transition: { onEntered: () => focusRow() },
        }}
      >
        <div
          id={`${id}-popup`}
          role="dialog"
          aria-labelledby={`${id}-heading`}
          className="flex min-h-0 flex-col overflow-hidden"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              event.preventDefault();
              close();
            }
          }}
        >
          <h3
            id={`${id}-heading`}
            className="shrink-0 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Select a Section
          </h3>
          <div
            ref={body}
            role="group"
            aria-label="Sections"
            className="max-h-56 min-h-0 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]"
            onKeyDown={(event) => {
              if (editing !== null) return;
              const rows = Array.from(
                body.current?.querySelectorAll<HTMLButtonElement>(
                  "[data-section-choice]",
                ) || [],
              );
              const index = rows.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                rows[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? rows.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          rows.length) %
                        rows.length
                ]?.focus();
              } else if (
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
              ) {
                rows
                  .slice(index + 1)
                  .concat(rows.slice(0, index + 1))
                  .find((row) =>
                    row.textContent
                      ?.trim()
                      .toLowerCase()
                      .startsWith(event.key.toLowerCase()),
                  )
                  ?.focus();
              }
            }}
          >
            {sections.map((section) => (
              <div
                key={section.section_id}
                className="flex min-w-0 items-center border-b border-slate-50 last:border-0"
              >
                {editing === section.section_id ? (
                  <SectionNameEditor
                    section={section}
                    sections={sections}
                    onDone={finishEditing}
                    onRenamed={onRenamed}
                    onSavingChange={setSaving}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      data-section-choice={section.section_id}
                      aria-pressed={String(section.section_id) === value}
                      disabled={editing !== null}
                      className={`min-w-0 flex-1 break-words px-3 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 disabled:opacity-50 ${String(section.section_id) === value ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700 hover:bg-slate-50"}`}
                      onClick={() => {
                        onChange(String(section.section_id));
                        close();
                      }}
                    >
                      {section.section_name}
                    </button>
                    <IconButton
                      small
                      aria-label={`Edit section ${section.section_name}`}
                      disabled={editing !== null}
                      className="text-indigo-600"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditing(section.section_id);
                      }}
                    >
                      <Icon name="EditOutlined" className="size-5" />
                    </IconButton>
                    <IconButton
                      small
                      aria-label={`Delete section ${section.section_name}`}
                      disabled={editing !== null}
                      className="text-rose-600"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        close();
                        onDelete(section);
                      }}
                    >
                      <Icon name="Delete" className="size-5" />
                    </IconButton>
                  </>
                )}
              </div>
            ))}
            {!sections.length && (
              <p className="px-4 py-3 text-sm text-slate-500">
                No sections yet.
              </p>
            )}
          </div>
          <footer className="shrink-0 border-t border-slate-100 p-2">
            <button
              type="button"
              disabled={editing !== null}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50"
              onClick={() => {
                close();
                onAdd();
              }}
            >
              + Add New Section
            </button>
          </footer>
        </div>
      </Popover>
    </div>
  );
}
