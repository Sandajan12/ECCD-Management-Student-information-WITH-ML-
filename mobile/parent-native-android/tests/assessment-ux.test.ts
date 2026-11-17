import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checklistDomains,
  confirmHomeQuestions,
  homeScope,
  overviewStatus,
  remainingHomeDomains,
} from "../src/presentation.ts";
import { homeKey, HomeObservations } from "../src/homeObservations.ts";
import type { HomeValues } from "../src/homeObservations.ts";
import { draft, DraftStore, OFFLINE_MESSAGE } from "../src/draftStore.ts";
import { ApiError } from "../src/sessionCore.ts";
import { assessmentFixture } from "./assessment-fixture.ts";

describe("1. Permission-safe ECCD ordering", () => {
  test("DI-KAYA precedes KAYA and unmarked without changing original numbers or source", () => {
    const f = assessmentFixture(),
      before = JSON.stringify(f.assessment);
    const rows = checklistDomains(f.child, f.assessment, "PRE")[0]
      .questions;
    assert.deepEqual(
      rows.map((q) => q.question_id),
      [47, 46, 45],
    );
    assert.deepEqual(
      rows.map((q) => q.sequence_order),
      [2, 1, 3],
    );
    assert.equal(JSON.stringify(f.assessment), before);
    assert.equal(checklistDomains(f.child, f.assessment, "MID")[0].questions.length, 3);
  });
  test("hidden answers cannot influence order; own home marks remain independent of scores", () => {
    const f = assessmentFixture();
    f.child.allow_parent_view_eccd_marks = false;
    const before = checklistDomains(f.child, f.assessment, "PRE");
    assert.deepEqual(
      before[0].questions.map((q) => q.question_id),
      [46, 47, 45],
    );
    f.assessment.domains[0].questions[1].answers.PRE = "DI-KAYA";
    assert.deepEqual(
      checklistDomains(f.child, f.assessment, "PRE")[0].questions.map(
        (q) => q.question_id,
      ),
      [46, 47, 45],
    );
    f.assessment.domains[0].questions[1].evaluator_roles.PRE = "parent";
    f.child.allow_parent_view_eccd_pre = false;
    assert.deepEqual(
      checklistDomains(
        f.child,
        f.assessment,
        "PRE",
      )[0].questions.map((q) => q.question_id),
      [46, 47, 45],
    );
    f.assessment.parent_assessment_access.pre_test_parent_editable = false;
    assert.deepEqual(
      checklistDomains(f.child, f.assessment, "PRE")[0].questions.map(q => q.question_id),
      [46, 47, 45],
    );
  });
});

describe("2. Overview aggregate release gates", () => {
  test("server home/school aggregates need latest-period release, not home-edit or mark access", () => {
    const f = assessmentFixture();
    f.child.allow_parent_view_eccd_marks = false;
    f.child.allow_parent_edit_home_based_eccd = false;
    assert.equal(
      overviewStatus(f.child, f.dashboard, f.assessment),
      "available",
    );
    for (const phase of ["MID", "POST"] as const) {
      f.dashboard.latestPhase = phase;
      assert.equal(
        overviewStatus(f.child, f.dashboard, f.assessment),
        "locked",
      );
    }
    f.dashboard.latestPhase = "PRE";
    f.assessment.permissions.allow_parent_view_eccd_pre = false;
    assert.equal(overviewStatus(f.child, f.dashboard, f.assessment), "locked");
    f.assessment.permissions.allow_parent_view_eccd_pre = true;
    f.child.allow_parent_view_eccd_pre = false;
    assert.equal(overviewStatus(f.child, f.dashboard, f.assessment), "locked");
    f.child.allow_parent_view_eccd_pre = true;
    f.dashboard.is_published = false;
    assert.equal(overviewStatus(f.child, f.dashboard, f.assessment), "locked");
  });
  test("masked latest data never falls back; no-data and mastery stay distinct", () => {
    const f = assessmentFixture();
    f.dashboard.latestPhase = null;
    f.dashboard.currentPhase = "Pending Adviser Release";
    assert.equal(overviewStatus(f.child, f.dashboard, f.assessment), "locked");
    f.dashboard.currentPhase = "Not Started";
    assert.equal(overviewStatus(f.child, f.dashboard, f.assessment), "empty");
    f.dashboard.latestPhase = "PRE";
    f.dashboard.assessmentMastered = true;
    f.dashboard.needsSupportIn = "All Skills Mastered";
    assert.equal(
      overviewStatus(f.child, f.dashboard, f.assessment),
      "available",
    );
    assert.equal(overviewStatus(f.child, f.dashboard, null), "loading");
    f.assessment.summary.PRE.isReleased = false;
    assert.equal(overviewStatus(f.child, f.dashboard, f.assessment), "locked");
  });
});

describe("3. Partial saves and confirmation isolation", () => {
  test("only confirmed rows/domains disappear; account/child/period keys do not overlap", async () => {
    const f = assessmentFixture();
    const service = new HomeObservations(f.store, 123, 7, async (payload) => {
      assert.deepEqual(
        payload.evaluations.map((q) => q.question_id),
        [45],
      );
    });
    await service.change(2, "PRE", 45, "KAYA");
    const result = await service.submit(f.child, f.assessment, "PRE");
    let confirmed = confirmHomeQuestions({}, 123, 7, "PRE", result.questionIds);
    confirmed = confirmHomeQuestions(confirmed, 123, 7, "PRE", [45]);
    assert.deepEqual(confirmed[homeScope(123, 7, "PRE")], [45]);
    assert.deepEqual(
      remainingHomeDomains(
        f.assessment,
        "PRE",
        confirmed[homeScope(123, 7, "PRE")],
      ).map((d) => d.domain_id),
      [3],
    );
    confirmed = confirmHomeQuestions(confirmed, 123, 7, "PRE", [46]);
    assert.deepEqual(
      remainingHomeDomains(
        f.assessment,
        "PRE",
        confirmed[homeScope(123, 7, "PRE")],
      ).map((d) => d.domain_id),
      [3],
    );
    for (const key of [
      homeScope(999, 7, "PRE"),
      homeScope(123, 8, "PRE"),
      homeScope(123, 7, "MID"),
    ])
      assert.equal(confirmed[key], undefined);
    assert.equal(
      remainingHomeDomains(f.assessment, "MID", [])[0].questions.length,
      2,
    );
    f.assessment.domains[1].questions[0].parent_locked.PRE = true;
    assert.deepEqual(remainingHomeDomains(f.assessment, "PRE", [45, 46]), []);
  });
});

describe("4. Stale and failed refresh after confirmed saves", () => {
  test("confirmation excludes stale rows and retries without changing server marks or other drafts", async () => {
    const f = assessmentFixture();
    let calls = 0;
    const service = new HomeObservations(f.store, 123, 7, async () => {
      calls++;
    });
    await service.change(2, "PRE", 45, "KAYA");
    const result = await service.submit(f.child, f.assessment, "PRE");
    await assert.rejects(Promise.reject(new TypeError("Refresh offline")));
    assert.equal(
      remainingHomeDomains(
        f.assessment,
        "PRE",
        result.questionIds,
      )[0].questions.some((q) => q.question_id === 45),
      false,
    );
    assert.equal(f.assessment.domains[0].questions[0].answers.PRE, null);
    await service.change(2, "PRE", 45, "DI-KAYA");
    await assert.rejects(
      service.submit(f.child, f.assessment, "PRE", result.questionIds),
      /unlocked/,
    );
    assert.equal(calls, 1);
    assert.equal(
      f.store.peek<HomeValues>(homeKey(7, "PRE", 2, 123), 123)?.values.answers[
        "45"
      ],
      "DI-KAYA",
    );
  });
  test("a selected/drafted answer remains visible; cleanup storage failure still returns confirmed IDs", async () => {
    const f = assessmentFixture();
    const store = new DraftStore({
      ...f.storage,
      removeItem: async () => {
        throw new Error("Disk failure");
      },
    });
    const service = new HomeObservations(store, 123, 7, async () => {});
    await service.change(2, "PRE", 45, "KAYA");
    assert.equal(
      remainingHomeDomains(f.assessment, "PRE", [])[0].questions.some(
        (q) => q.question_id === 45,
      ),
      true,
    );
    const result = await service.submit(f.child, f.assessment, "PRE");
    assert.deepEqual(result.questionIds, [45]);
    assert.match(result.cleanupWarning!, /Observations saved/);
    assert.equal(
      remainingHomeDomains(
        f.assessment,
        "PRE",
        result.questionIds,
      )[0].questions.some((q) => q.question_id === 45),
      false,
    );
    assert.ok(f.records.has(homeKey(7, "PRE", 2, 123)));
  });
});

describe("5. Failure retention, revisions and manual submission", () => {
  test("network/rejection failures return no confirmations and preserve exact snapshots", async () => {
    for (const failure of [
      new TypeError("Offline"),
      ...[403, 409, 422].map(
        (status) => new ApiError("Locked by teacher", status),
      ),
    ]) {
      const f = assessmentFixture();
      let calls = 0;
      const service = new HomeObservations(f.store, 123, 7, async () => {
        calls++;
        throw failure;
      });
      await service.change(2, "PRE", 45, "KAYA");
      const key = homeKey(7, "PRE", 2, 123),
        revision = f.store.peek<HomeValues>(key, 123)!.revision;
      await assert.rejects(service.submit(f.child, f.assessment, "PRE"), {
        message:
          failure instanceof ApiError ? failure.message : OFFLINE_MESSAGE,
      });
      const saved = f.store.peek<HomeValues>(key, 123)!;
      assert.equal(saved.revision, revision);
      assert.deepEqual(saved.values.answers, { "45": "KAYA" });
      assert.equal(saved.is_pending_sync, !(failure instanceof ApiError));
      assert.equal(
        remainingHomeDomains(f.assessment, "PRE", [])[0].questions.length,
        1,
      );
      await service.load(f.assessment, "PRE");
      await service.load(f.assessment, "MID");
      assert.equal(calls, 1);
    }
  });
  test("a newer revision and other owner's work survive old confirmation", async () => {
    const f = assessmentFixture();
    let finish: () => void = () => {};
    let started: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const service = new HomeObservations(f.store, 123, 7, async () => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await service.change(2, "PRE", 45, "KAYA");
    const other = homeKey(7, "PRE", 2, 999);
    await f.store.put(other, draft(999, { answers: { "45": "DI-KAYA" } }));
    const sending = service.submit(f.child, f.assessment, "PRE");
    await pending;
    await service.change(2, "PRE", 45, "DI-KAYA");
    await service.change(2, "PRE", 46, "KAYA");
    const newer = f.store.peek<HomeValues>(homeKey(7, "PRE", 2, 123), 123)!;
    finish();
    const result = await sending;
    assert.deepEqual(result.questionIds, [45]);
    assert.equal(
      f.store.peek<HomeValues>(homeKey(7, "PRE", 2, 123), 123)!.revision,
      newer.revision,
    );
    assert.deepEqual(newer.values.answers, { "45": "DI-KAYA", "46": "KAYA" });
    assert.ok(f.records.has(other));
  });
});
