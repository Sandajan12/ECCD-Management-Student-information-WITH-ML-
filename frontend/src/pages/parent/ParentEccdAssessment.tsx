import { useState } from "react";
import type { Period } from "../../types";
import { PERIOD_LABELS, PERIODS } from "../../types";
import { ChildSelector } from "../../components/parent/ChildSelection";
import { useChildren } from "../../hooks/useChildren";
import {
  Checklist,
  PeriodTabs,
} from "../../components/eccd/AssessmentChecklist";
import { useAssessment } from "../../hooks/useAssessment";
import {
  Button,
  Empty,
  Loading,
  Notice,
  PageHeader,
  Select,
} from "../../components/ui";

export default function ParentEccdAssessment() {
  const {
    children,
    child,
    selected,
    select,
    error: childError,
    loading: childrenLoading,
  } = useChildren();
  const { data, error, loading, refresh } = useAssessment(selected, true);
  const [tab, setTab] = useState<"official" | "checklist">("official");
  const [period, setPeriod] = useState<Period>("PRE");
  const [domainId, setDomainId] = useState(0);
  const domain =
    data?.domains.find((d) => d.domain_id === domainId) || data?.domains[0];
  return (
    <>
      <PageHeader
        title="ECCD Management"
        subtitle="View official results and complete your child’s home-based checklist."
      />
      <div className="card mb-6">
        <ChildSelector
          children={children}
          selected={selected}
          select={select}
        />
      </div>
      <Notice tone="error">{childError || error}</Notice>
      {childrenLoading || (loading && !data) ? (
        <Loading />
      ) : !child || !data ? (
        <Empty>
          Link a child from Child Information to access their assessments.
        </Empty>
      ) : (
        <>
          <div className="my-6 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
            <Button
              className="flex-1"
              variant={tab === "official" ? "primary" : "secondary"}
              onClick={() => setTab("official")}
            >
              Official Evaluation Summary
            </Button>
            <Button
              className="flex-1"
              variant={tab === "checklist" ? "primary" : "secondary"}
              onClick={() => setTab("checklist")}
            >
              Home-Based Checklist
            </Button>
          </div>
          {tab === "official" ? (
            <>
              <div className="mb-6 grid gap-5 md:grid-cols-3">
                {PERIODS.map((p) => {
                  const summary = data.summary?.[p];
                  return (
                    <section className="card" key={p}>
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">{PERIOD_LABELS[p]}</h2>
                        <span className="badge">
                          {summary?.is_published
                            ? summary.isEvaluated
                              ? "Evaluated"
                              : "Not evaluated"
                            : "Unreleased"}
                        </span>
                      </div>
                      {!summary?.is_published ? (
                        <Empty>Results Pending Adviser Release</Empty>
                      ) : (
                        <>
                          <p className="text-sm text-slate-500">
                            Standard score
                          </p>
                          <p className="my-3 text-4xl font-bold text-blue-600">
                            {summary.standardScore ?? "—"}
                          </p>
                          <p className="text-sm font-medium">
                            {summary.interpretation ||
                              "Assessment not yet completed"}
                          </p>
                          <dl className="mt-4 space-y-2 text-xs text-slate-500">
                            <div>Date: {summary.assessmentDate || "—"}</div>
                            <div>
                              Age at evaluation: {summary.decimalAge ?? "—"}
                            </div>
                            <div>
                              Sum of scaled scores:{" "}
                              {summary.sumOfScaledScores ?? "—"}
                            </div>
                          </dl>
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
              <section className="card">
                <h2 className="mb-4 font-semibold">Domain score matrix</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th>Domain</th>
                        {PERIODS.map((p) => (
                          <th key={p}>{PERIOD_LABELS[p]} • Raw / scaled</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.matrix?.map((d) => (
                        <tr key={d.domain_id}>
                          <td>{d.domain_name}</td>
                          {PERIODS.map((p) => (
                            <td key={p}>
                              {data.summary?.[p]?.is_published ? (
                                `${data.summary[p].rawScores?.[d.domain_code] ?? "—"} / ${d.scores[p] ?? "—"}`
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Pending release
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="card mb-5">
                <div className="grid items-end gap-5 md:grid-cols-2">
                  <Select
                    label="Development domain"
                    value={domain?.domain_id || ""}
                    onChange={(e) => setDomainId(Number(e.target.value))}
                  >
                    {data.domains.map((d) => (
                      <option key={d.domain_id} value={d.domain_id}>
                        {d.domain_name}
                      </option>
                    ))}
                  </Select>
                  <PeriodTabs period={period} select={setPeriod} />
                </div>
              </div>
              <section className="card">
                {domain && (
                  <Checklist
                    key={`${selected}_${period}_${domain.domain_id}_home`}
                    parent
                    data={data}
                    domain={domain}
                    period={period}
                    onSaved={() => void refresh()}
                  />
                )}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
