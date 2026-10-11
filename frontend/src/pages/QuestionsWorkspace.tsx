import { useCallback, useEffect, useState } from "react";
import API, { errorMessage } from "../services/api";
import { useDurableForm } from "../utils/drafts";
import type { Domain, Question } from "../types";
import {
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  PageHeader,
  Select,
  TextArea,
} from "../components/ui";
function ConfigForm({
  domain,
  question,
  type,
  onSaved,
}: {
  domain?: Domain;
  question?: Question;
  type: "domain" | "question";
  onSaved: () => void;
}) {
  const { values, change, save } = useDurableForm(
    `config_${type}_${type === 'question' ? question ? `edit_${question.question_id}` : `new_domain_${domain?.domain_id}` : domain ? `edit_${domain.domain_id}` : 'new'}`,
    {
      domain_name: domain?.domain_name || "",
      question_text: question?.question_text || "",
      sequence_order: String(
        question?.sequence_order || (domain?.questions.length || 0) + 1,
      ),
      is_home_based: question?.is_home_based || false,
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const id =
            type === "domain" ? domain?.domain_id : question?.question_id;
          const result = await save(
            `/api/eccd-config/${type}s${id ? `/${id}` : ""}`,
            id ? "put" : "post",
            type === "domain"
              ? { domain_name: values.domain_name }
              : {
                  question_text: values.question_text,
                  sequence_order: Number(values.sequence_order),
                  domain_id: domain?.domain_id,
                  is_home_based: values.is_home_based,
                },
          );
          if (result === "saved") onSaved();
          else setError("Saved on this device for reconnection.");
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      {type === "domain" ? (
        <Field
          label="Domain name"
          maxLength={100}
          value={values.domain_name}
          onChange={(e) => change({ ...values, domain_name: e.target.value })}
          required
        />
      ) : (
        <>
          <TextArea
            label="Question text"
            value={values.question_text}
            onChange={(e) =>
              change({ ...values, question_text: e.target.value })
            }
            required
          />
          <Field
            label="Sequence order"
            type="number"
            min={1}
            value={values.sequence_order}
            onChange={(e) =>
              change({ ...values, sequence_order: e.target.value })
            }
            required
          />
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={values.is_home_based}
              onChange={(e) =>
                change({ ...values, is_home_based: e.target.checked })
              }
            />
            Include in home-based parent checklist
          </label>
        </>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
export default function QuestionsWorkspace() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [id, setId] = useState(0);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{
    type: "domain" | "question";
    domain?: Domain;
    question?: Question;
  } | null>(null);
  const [remove, setRemove] = useState<{
    type: "domains" | "questions";
    id: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setDomains((await API.get<Domain[]>("/api/eccd-config/")).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("ames-record-synced", handler);
    return () => window.removeEventListener("ames-record-synced", handler);
  }, [refresh]);
  const domain = domains.find((d) => d.domain_id === id) || domains[0];
  return (
    <>
      <PageHeader
        title="ECCD Questions"
        subtitle="Manage development domains and classroom or home-based checklist items."
        actions={
          <Button onClick={() => setEditor({ type: "domain" })}>
            + Add domain
          </Button>
        }
      />
      <Notice tone="error">{error}</Notice>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_3fr]">
        <aside className="card">
          <Select
            label="Development domain"
            value={domain?.domain_id || ""}
            onChange={(e) => setId(Number(e.target.value))}
          >
            {domains.map((d) => (
              <option key={d.domain_id} value={d.domain_id}>
                {d.domain_name}
              </option>
            ))}
          </Select>
          {domain && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setEditor({ type: "domain", domain })}
              >
                Rename domain
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  setRemove({ type: "domains", id: domain.domain_id })
                }
              >
                Delete domain
              </Button>
            </div>
          )}
        </aside>
        <section className="card">
          {domain ? (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">{domain.domain_name}</h2>
                <Button onClick={() => setEditor({ type: "question", domain })}>
                  + Add question
                </Button>
              </div>
              <div className="space-y-4">
                {domain.questions.map((q) => (
                  <article
                    className="rounded-xl bg-slate-50 p-4"
                    key={q.question_id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <p className="min-w-0 flex-1 text-sm leading-6">
                        <span className="mr-2 text-slate-400">
                          {q.sequence_order}.
                        </span>
                        {q.question_text}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setEditor({ type: "question", domain, question: q })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() =>
                            setRemove({ type: "questions", id: q.question_id })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <label className="mt-4 flex items-center gap-3 text-xs font-medium text-slate-500">
                      <input
                        type="checkbox"
                        checked={q.is_home_based || false}
                        disabled={busy}
                        onChange={async (e) => {
                          setBusy(true);
                          try {
                            await API.put(
                              `/api/eccd-config/questions/${q.question_id}/home-based`,
                              { is_home_based: e.target.checked },
                            );
                            await refresh();
                          } catch (err) {
                            setError(errorMessage(err));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                      Home-based assessment
                    </label>
                  </article>
                ))}
              </div>
              {!domain.questions.length && (
                <Empty>No questions yet. Add your first checklist item.</Empty>
              )}
            </>
          ) : (
            <Empty>Add a development domain to begin.</Empty>
          )}
        </section>
      </div>
      {editor && (
        <Modal
          title={`${editor.type === "domain" ? (editor.domain ? "Edit" : "Add") : editor.question ? "Edit" : "Add"} ${editor.type}`}
          onClose={() => setEditor(null)}
        >
          <ConfigForm
            {...editor}
            onSaved={() => {
              setEditor(null);
              void refresh();
            }}
          />
        </Modal>
      )}
      {remove && (
        <Modal
          title="Delete checklist content?"
          onClose={() => setRemove(null)}
        >
          <Notice tone="error">
            Deleting a domain or question also removes related evaluation
            answers. This cannot be undone.
          </Notice>
          <Notice tone="error">{error}</Notice>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await API.delete(
                  `/api/eccd-config/${remove.type}/${remove.id}`,
                );
                setRemove(null);
                await refresh();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete permanently
          </Button>
        </Modal>
      )}
    </>
  );
}
