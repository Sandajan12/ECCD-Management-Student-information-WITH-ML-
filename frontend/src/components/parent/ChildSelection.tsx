import { useState } from "react";
import { errorMessage } from "../../services/api";
import { useDurableForm } from "../../utils/drafts";
import type { Student } from "../../types";
import { studentName } from "../../types";
import { Button, Field, Notice, Select } from "../ui";

export function ChildSelector({
  children,
  selected,
  select,
}: {
  children: Student[];
  selected: number;
  select: (id: number) => void;
}) {
  return (
    <Select
      label="Select child"
      value={selected || ""}
      onChange={(e) => select(Number(e.target.value))}
    >
      {children.map((s) => (
        <option key={s.student_id} value={s.student_id}>
          {studentName(s)} • {s.masked_lrn}
        </option>
      ))}
    </Select>
  );
}
export function LinkChild({ onLinked }: { onLinked: () => void }) {
  const { values, change, save } = useDurableForm("link_child", {
    lrn_number: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const result = await save("/api/students/link", "post");
          setMessage(
            result === "saved"
              ? "Link request submitted. Your child's teacher must approve it before records become available."
              : "Your request is saved for reconnection.",
          );
          if (result === "saved") onLinked();
        } catch (err) {
          setMessage(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-500">
        Enter the 12-digit LRN provided by your child’s teacher to link their
        record.
      </p>
      <Notice>{message}</Notice>
      <Field
        label="Child’s LRN"
        inputMode="numeric"
        pattern="[0-9]{12}"
        maxLength={12}
        required
        value={values.lrn_number}
        onChange={(e) =>
          change({ lrn_number: e.target.value.replace(/\D/g, "") })
        }
      />
      <Button disabled={busy} type="submit">
        {busy ? "Linking…" : "Link child"}
      </Button>
    </form>
  );
}
