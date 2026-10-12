import { useCallback, useEffect, useRef, useState } from "react";
import API, { errorMessage } from "../../services/api";
import { useDurableForm } from "../../utils/drafts";
import type { Domain, Question } from "../../types";
import {
  Button,
  Field,
  Modal,
  Notice,
  TextArea,
} from "../../components/chairman/ui";
import Icon from "../../components/chairman/Icon";
import { IconButton } from "../../components/chairman/ui";
function HomeBasedToggle({
  question,
  onSaved,
}: {
  question: Question;
  onSaved: () => void;
}) {
  const { values, change, save } = useDurableForm(
    `question_home_${question.question_id}`,
    { is_home_based: question.is_home_based || false },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  return (
    <div>
      <IconButton
        title={
          values.is_home_based ? "Remove from Home-Based" : "Set as Home-Based"
        }
        aria-label="Home-based assessment"
        aria-pressed={values.is_home_based}
        disabled={busy}
        className={values.is_home_based ? "text-[#2e7d32]" : "text-black/54"}
        onClick={async () => {
          if (submitting.current) return;
          submitting.current = true;
          setBusy(true);
          const next = { is_home_based: !values.is_home_based };
          change(next);
          setError("");
          try {
            const result = await save(
              `/api/eccd-config/questions/${question.question_id}/home-based`,
              "put",
              next,
              next,
            );
            if (result === "saved") onSaved();
            else setError("Saved for reconnection.");
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            submitting.current = false;
            setBusy(false);
          }
        }}
      >
        <Icon name={values.is_home_based ? "Home" : "HomeOutlined"} />
      </IconButton>
      <Notice tone="error">{error}</Notice>
    </div>
  );
}
function ConfigForm({
  domain,
  question,
  type,
  onSaved,
  onBusyChange,
}: {
  onBusyChange: (busy: boolean) => void;
  domain?: Domain;
  question?: Question;
  type: "domain" | "question";
  onSaved: () => void;
}) {
  const { values, change, save } = useDurableForm(
    `config_${type}_${type === "question" ? (question ? `edit_${question.question_id}` : `new_domain_${domain?.domain_id}`) : domain ? `edit_${domain.domain_id}` : "new"}`,
    {
      domain_name: domain?.domain_name || "",
      question_text: question?.question_text || "",
      sequence_order: question ? String(question.sequence_order) : "",
      is_home_based: question?.is_home_based || false,
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  return (
    <form
      id="chairman-config-form"
      className="flex flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        setBusy(true);
        onBusyChange(true);
        setError("");
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
          submitting.current = false;
          setBusy(false);
          onBusyChange(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      {type === "domain" ? (
        <Field
          label="Domain Name"
          autoFocus
          floating
          small={false}
          containerClassName="mt-2 mb-1"
          maxLength={100}
          disabled={busy}
          value={values.domain_name}
          onChange={(e) => change({ ...values, domain_name: e.target.value })}
          required
        />
      ) : (
        <>
          <Field
            label="Sequence Order (e.g. 1)"
            containerClassName="mt-2 mb-4"
            floating
            small={false}
            type="number"
            min={1}
            disabled={busy}
            value={values.sequence_order}
            onChange={(e) =>
              change({ ...values, sequence_order: e.target.value })
            }
            required
          />
          <TextArea
            label="Question Text"
            className="mt-2 mb-1"
            autoFocus
            disabled={busy}
            value={values.question_text}
            onChange={(e) =>
              change({ ...values, question_text: e.target.value })
            }
            required
          />
        </>
      )}
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
  const [loading, setLoading] = useState(true);
  const refreshRevision = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    setLoading(true);
    setError("");
    try {
      const response = await API.get<Domain[]>("/api/eccd-config/");
      if (revision === refreshRevision.current) setDomains(response.data);
    } catch (err) {
      if (revision === refreshRevision.current) setError(errorMessage(err));
    } finally {
      if (revision === refreshRevision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("ames-record-synced", handler);
    return () => {
      window.removeEventListener("ames-record-synced", handler);
      refreshRevision.current++;
    };
  }, [refresh]);
  const domain = domains.find((d) => d.domain_id === id);
  return (
    <div className="min-h-screen p-2 pb-10">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 legacy-sm:flex-row">
        <div>
          <h1 className="mb-1 text-[34px] font-extrabold leading-[1.235] text-[#1e1e2f]">
            ECCD Questions Management
          </h1>
          <p className="text-base leading-[1.5] text-[#777]">
            Manage ECCD Domains and their respective assessment questions.
          </p>
        </div>
        {!domain && (
          <Button
            startIcon={<Icon name="Add" />}
            className="font-bold"
            onClick={() => setEditor({ type: "domain" })}
          >
            Add Domain
          </Button>
        )}
      </div>
      <Notice tone="error">{error}</Notice>
      {loading ? (
        <div
          className="my-10 flex justify-center"
          role="status"
          aria-label="Loading ECCD domains"
        >
          <svg
            className="size-10 animate-spin text-[#4543c0]"
            viewBox="0 0 44 44"
            aria-hidden="true"
          >
            <circle
              cx="22"
              cy="22"
              r="20.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.6"
              strokeDasharray="80 200"
            />
          </svg>
        </div>
      ) : !domain ? (
        <div className="grid min-w-0 grid-cols-1 gap-10 legacy-sm:grid-cols-3">
          {domains.map((item) => (
            <article
              key={item.domain_id}
              className="mx-auto flex h-[300px] min-w-0 w-full max-w-[300px] cursor-pointer flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-[0_4px_15px_rgba(0,0,0,.05)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_12px_25px_rgba(0,0,0,.1)] xl:min-w-[300px]"
              onClick={() => setId(item.domain_id)}
            >
              <div className="mb-4 flex items-start justify-between">
                <h2 className="h-[65px] min-w-0 line-clamp-2 text-xl font-bold leading-[1.6] break-words text-[#1e1e2f]">
                  {item.domain_name}
                </h2>
                <div>
                  <IconButton
                    small
                    title="Edit Domain"
                    className="text-[#4543c0]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditor({ type: "domain", domain: item });
                    }}
                  >
                    <Icon name="Edit" className="size-5" />
                  </IconButton>
                  <IconButton
                    small
                    title="Delete Domain"
                    className="text-[#d32f2f]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRemove({ type: "domains", id: item.domain_id });
                    }}
                  >
                    <Icon name="Delete" className="size-5" />
                  </IconButton>
                </div>
              </div>
              <div className="flex grow items-center justify-center">
                <p className="text-base font-medium leading-[1.5] text-[#777]">
                  {item.questions.length} Questions Available
                </p>
              </div>
              <Button
                className="mt-auto w-full py-2 font-bold shadow-none"
                onClick={() => setId(item.domain_id)}
              >
                Manage Questions
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <>
          <Button
            variant="text"
            startIcon={<Icon name="ArrowBack" />}
            className="mb-6 px-2! text-[17.6px] font-bold text-[#777]"
            onClick={() => setId(0)}
          >
            Back to Domains
          </Button>
          <section className="mb-8 overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,.05)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e2e8f0] bg-[#fbfbfb] p-6">
              <h2 className="text-2xl font-extrabold leading-[1.334] text-[#1e1e2f]">
                {domain.domain_name} Questions
              </h2>
              <Button
                className="font-bold"
                startIcon={<Icon name="Add" />}
                onClick={() => setEditor({ type: "question", domain })}
              >
                Add Question
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-[#fbfbfb]">
                  <tr>
                    <th className="w-[10%] font-bold! text-[#777]!">ORDER</th>
                    <th className="w-[70%] font-bold! text-[#777]!">
                      QUESTION / INDICATOR
                    </th>
                    <th className="w-[20%] text-center! font-bold! text-[#777]!">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {domain.questions.map((question, index) => (
                    <tr
                      key={question.question_id}
                      className="hover:bg-[#f8fafc] [&:last-child>td]:border-0"
                    >
                      <td className="font-bold! text-[#64748b]">
                        {question.sequence_order || index + 1}
                      </td>
                      <td className="py-6! text-[16.8px]! font-medium! text-[#334155]">
                        {question.question_text}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-2">
                          <HomeBasedToggle
                            question={question}
                            onSaved={() => void refresh()}
                          />
                          <IconButton
                            title="Edit Question"
                            className="text-[#4543c0]"
                            onClick={() =>
                              setEditor({ type: "question", domain, question })
                            }
                          >
                            <Icon name="Edit" />
                          </IconButton>
                          <IconButton
                            title="Delete Question"
                            className="text-[#d32f2f]"
                            onClick={() =>
                              setRemove({
                                type: "questions",
                                id: question.question_id,
                              })
                            }
                          >
                            <Icon name="Delete" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!domain.questions.length && (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-8! text-center! text-base! leading-[1.5]! text-[#777]"
                      >
                        No questions found. Please add a question.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {editor && (
        <Modal
          title={`${editor.type === "domain" ? (editor.domain ? "Edit" : "Add") : editor.question ? "Edit" : "Add"} ${editor.type === "domain" ? "Domain" : "Question"}`}
          titleClassName="[&_h2]:font-semibold"
          bodyClassName="border-y border-black/12 pt-4 pb-4!"
          locked={busy}
          footer={
            <>
              <Button
                variant="text"
                className="px-2!"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" form="chairman-config-form" disabled={busy}>
                Save
              </Button>
            </>
          }
          onClose={() => setEditor(null)}
        >
          <ConfigForm
            key={`${editor.type}_${editor.question?.question_id ?? editor.domain?.domain_id ?? "new"}`}
            onBusyChange={setBusy}
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
    </div>
  );
}
