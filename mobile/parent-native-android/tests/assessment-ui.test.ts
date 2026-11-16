import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assessmentFixture } from "./assessment-fixture.ts";
import { componentHarness, elements, text } from "./component-harness.ts";
import type { Element, Props } from "./component-harness.ts";
import { confirmHomeQuestions } from "../src/presentation.ts";
import { HomeObservations } from "../src/homeObservations.ts";

const find = (tree: Element, predicate: (node: Element) => boolean) => {
  const result = elements(tree).find(predicate);
  assert.ok(result);
  return result;
};
const press = (node: Element) => {
  assert.equal(node.props.disabled === true, false);
  (node.props.onPress as () => void)();
};
const user = { id: 123, role: "user", full_name: "Parent" };

describe("6. Assessment touch, presentation and navigation handlers (mocked hosts)", () => {
  test("inherited home rows stay editable-list visible with KAYA selected and DI-KAYA disabled", () => {
    const f = assessmentFixture();
    const question = f.assessment.domains[0].questions[0];
    question.carry_forward = { MID: "locked" };
    const harness = componentHarness("OverviewScreen.tsx", {
      "./resources": {
        useResource: (path: string) => ({
          data: path.includes("dashboard-stats") ? f.dashboard : f.assessment,
          error: "",
          loading: false,
          reload: async () => {},
        }),
        Feedback: "Feedback",
      },
      "./drafts": {
        drafts: f.store,
        useDraft: () => ({ ready: true, snapshot: null, storageError: "" }),
      },
      "./session": { session: { snapshot: () => ({session: {user}}), request: async () => {} } },
      "./AssessmentScreens": { OverviewSummary: "OverviewSummary" },
    });
    const screen = harness.mount("OverviewScreen", {
      user,
      child: f.child,
      confirmed: {},
      onConfirmed() {},
      refreshChildren: async () => {},
      header: null,
      insights() {},
      results() {},
    });
    press(
      find(
        screen.render(),
        (node) =>
          node.props.accessibilityLabel === "Assess Home-Based Questions",
      ),
    );
    (
      find(screen.render(), (node) => node.type === "PeriodTabs").props
        .onChange as (period: string) => void
    )("MID");
    const domain = find(
      screen.render(),
      (node) =>
        typeof node.type === "function" && node.type.name === "HomeDomain",
    );
    const inner = harness.child(domain);
    press(find(inner.render(), (node) => node.type === "Pressable"));
    const tree = inner.render();
    assert.match(text(tree), /draft-not save/);
    assert.equal(
      find(
        tree,
        (node) => node.type === "Text" && text(node) === "draft-not save",
      ).props.numberOfLines,
      1,
    );
    const row = find(
      tree,
      (node) =>
        node.type === "View" &&
        text(node).includes("Indicator 45") &&
        elements(node).some((item) => item.props.title === "DI-KAYA"),
    );
    assert.equal(
      find(row, (node) => node.props.title === "KAYA").props.secondary,
      false,
    );
    assert.equal(
      find(row, (node) => node.props.title === "DI-KAYA").props.disabled,
      true,
    );
    assert.equal(
      elements(row).some((node) => node.props.title === "Remove local answer"),
      false,
    );
    assert.equal(f.records.size, 0);
  });

  test("whole collapsed surface expands; domain and answer handlers have no outer toggle ancestor", async () => {
    const f = assessmentFixture();
    let gets = 0,
      posts = 0;
    const resource = (path: string) => ({
      data: path.includes("dashboard-stats") ? f.dashboard : f.assessment,
      error: "",
      loading: false,
      reload: async () => {
        gets++;
      },
    });
    const serviceModule = await import("../src/homeObservations.ts");
    const actualHarness = componentHarness("OverviewScreen.tsx", {
      "./resources": { useResource: resource, Feedback: "Feedback" },
      "./drafts": {
        drafts: f.store,
        useDraft: () => ({ ready: true, snapshot: null, storageError: "" }),
      },
      "./session": {
        session: {
          snapshot: () => ({session: {user}}),
          request: async () => {
            posts++;
          },
        },
      },
      "./AssessmentScreens": { OverviewSummary: "OverviewSummary" },
      "./homeObservations": serviceModule,
    });
    const props: Props = {
      user,
      child: f.child,
      confirmed: {},
      onConfirmed() {},
      refreshChildren: async () => {
        gets++;
      },
      header: null,
      insights() {},
      results() {},
    };
    const screen = actualHarness.mount("OverviewScreen", props);
    const toggle = (tree: Element) =>
      find(
        tree,
        (node) =>
          node.props.accessibilityLabel === "Assess Home-Based Questions",
      );
    let tree = screen.render();
    assert.equal(
      toggle(tree).props.accessibilityState &&
        (toggle(tree).props.accessibilityState as Props).expanded,
      false,
    );
    const card = find(
      tree,
      (node) =>
        node.type === "Card" &&
        elements(node.props.children).includes(toggle(tree)),
    );
    assert.deepEqual(card.props.style, { padding: 0 });
    assert.equal(
      elements(card.props.children).filter((n) => n.type === "Pressable")
        .length,
      1,
    );
    const style = toggle(tree).props.style as Props[];
    assert.equal(style[1].padding, 16); // All card padding/whitespace belongs to the tap target.
    press(toggle(tree));
    tree = screen.render();
    assert.equal(
      (toggle(tree).props.accessibilityState as Props).expanded,
      true,
    );
    assert.match(
      text(tree),
      /Choose KAYA or DI-KAYA for one or more home-based questions, then tap Submit Observations\./,
    );
    assert.doesNotMatch(
      text(tree),
      /Drafts stay on this device|Everyday moments|Local drafts/,
    );
    const domain = find(
      tree,
      (node) =>
        typeof node.type === "function" && node.type.name === "HomeDomain",
    );
    assert.equal(elements(toggle(tree)).includes(domain), false);
    const inner = actualHarness.child(domain);
    let inside = inner.render();
    press(find(inside, (node) => node.type === "Pressable"));
    inside = inner.render();
    press(find(inside, (node) => node.props.title === "KAYA"));
    press(find(inside, (node) => node.props.title === "DI-KAYA"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    tree = screen.render();
    assert.equal(
      (toggle(tree).props.accessibilityState as Props).expanded,
      true,
    );
    assert.equal(
      f.store.peek<{ answers: Record<string, string> }>(
        "eccd_draft_7_PRE_2_home_123",
        123,
      )?.values.answers["46"],
      "DI-KAYA",
    );
    await (tree.props.onRefresh as () => Promise<void>)();
    assert.equal(gets, 3);
    assert.equal(posts, 0);
    press(toggle(tree));
    assert.equal(
      (toggle(screen.render()).props.accessibilityState as Props).expanded,
      false,
    );
  });

  test("ECCD defaults to All, filters visible indicators and stays read-only", () => {
    const f = assessmentFixture();
    const harness = componentHarness("AssessmentScreens.tsx", {
      "./session": {
        session: {
          request: () => {
            throw new Error("Read-only screen must not mutate");
          },
        },
      },
      "./resources": {
        useResource: () => ({
          data: f.assessment,
          error: "",
          loading: false,
          reload: async () => {},
        }),
        Feedback: "Feedback",
      },
    });
    const screen = harness.mount("ResultsTab", {
      child: f.child,
      refreshChildren: async () => {},
    });
    let tree = screen.render();
    const mode = find(tree, (node) => node.type === "Segments");
    (mode.props.onChange as (value: string) => void)("checklist");
    tree = screen.render();
    const filter = () =>
      elements(screen.render()).filter((node) => node.type === "Segments")[1];
    assert.equal(filter().props.value, "All");
    press(find(tree, (node) => node.type === "Pressable"));
    const rows = text(screen.render());
    assert.ok(rows.indexOf("Indicator 47") < rows.indexOf("Indicator 46"));
    (filter().props.onChange as (value: string) => void)("DI-KAYA");
    assert.match(text(screen.render()), /Indicator 47/);
    assert.doesNotMatch(text(screen.render()), /Indicator 46|Language/);
    f.child.allow_parent_view_eccd_marks = false;
    assert.match(
      text(screen.render()),
      /No visible indicators match this filter/,
    );
    assert.doesNotMatch(
      text(screen.render()),
      /Indicator 47|Pending Adviser Release/,
    );
    assert.equal(
      elements(screen.render()).some((node) => node.type === "Button"),
      false,
    );
  });

  test("manual confirmation hides only saved rows even when refresh retains stale data", async () => {
    const f = assessmentFixture();
    await new HomeObservations(f.store, 123, 7, async () => {}).change(
      2,
      "PRE",
      45,
      "KAYA",
    );
    let posts = 0;
    const state = {
      data: f.assessment,
      error: "",
      loading: false,
      reload: async () => {
        state.error = "Refresh offline";
      },
    };
    const harness = componentHarness("OverviewScreen.tsx", {
      "./resources": {
        useResource: (path: string) =>
          path.includes("dashboard-stats")
            ? { ...state, data: f.dashboard }
            : state,
        Feedback: "Feedback",
      },
      "./drafts": { drafts: f.store, useDraft: () => ({ ready: true }) },
      "./session": {
        session: {
          snapshot: () => ({session: {user}}),
          request: async () => {
            posts++;
          },
        },
      },
      "./AssessmentScreens": { OverviewSummary: "OverviewSummary" },
    });
    const props: Props = {
      user,
      child: f.child,
      confirmed: {},
      onConfirmed: (period: "PRE" | "MID" | "POST", ids: number[]) => {
        props.confirmed = confirmHomeQuestions(
          props.confirmed as Record<string, number[]>,
          user.id,
          7,
          period,
          ids,
        );
      },
      refreshChildren: async () => {},
      header: null,
      insights() {},
      results() {},
    };
    const screen = harness.mount("OverviewScreen", props);
    press(
      find(
        screen.render(),
        (node) =>
          node.props.accessibilityLabel === "Assess Home-Based Questions",
      ),
    );
    let tree = screen.render();
    press(tree.props.footer as Element);
    press(
      find(
        screen.render(),
        (node) =>
          node.type === "Button" && node.props.title === "Submit Answers",
      ),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    tree = screen.render();
    const domain = find(
      tree,
      (node) =>
        typeof node.type === "function" && node.type.name === "HomeDomain",
    );
    assert.deepEqual(
      (
        domain.props.domain as (typeof f.assessment.domains)[number]
      ).questions.map((q) => q.question_id),
      [46],
    );
    assert.equal(state.error, "Refresh offline");
    assert.equal(posts, 1);
    assert.deepEqual(props.confirmed, { "123_7_PRE": [45] });
    assert.equal(f.assessment.domains[0].questions[0].parent_locked.PRE, false);
    assert.match(text(tree), /Submitted — awaiting teacher review/);
  });

  test("completion removes submit action; closed windows say teacher lock rather than completed", () => {
    const f = assessmentFixture();
    const harness = componentHarness("OverviewScreen.tsx", {
      "./resources": {
        useResource: (path: string) => ({
          data: path.includes("dashboard-stats") ? f.dashboard : f.assessment,
          reload: async () => {},
          error: "",
          loading: false,
        }),
        Feedback: "Feedback",
      },
      "./drafts": { drafts: f.store, useDraft: () => ({ ready: true }) },
      "./session": { session: {} },
      "./AssessmentScreens": { OverviewSummary: "OverviewSummary" },
    });
    const props = {
      user,
      child: f.child,
      confirmed: confirmHomeQuestions({}, 123, 7, "PRE", [45, 46, 48]),
      onConfirmed() {},
      refreshChildren: async () => {},
      header: null,
      insights() {},
      results() {},
    };
    const screen = harness.mount("OverviewScreen", props);
    press(
      find(
        screen.render(),
        (node) =>
          node.props.accessibilityLabel === "Assess Home-Based Questions",
      ),
    );
    let tree = screen.render();
    assert.match(text(tree), /All home observations submitted/);
    assert.equal(tree.props.footer, false);
    f.assessment.parent_assessment_access.pre_test_parent_editable = false;
    tree = screen.render();
    assert.match(text(tree), /Locked by teacher/);
    assert.doesNotMatch(text(tree), /All home observations submitted/);
  });

  test("Overview renders server aggregates under release gates, never home-only recalculation", () => {
    const f = assessmentFixture();
    const harness = componentHarness("AssessmentScreens.tsx", {
      "./session": {},
      "./resources": {},
    });
    const state = { data: f.dashboard, error: "", loading: false };
    const screen = harness.mount("OverviewSummary", {
      child: f.child,
      assessment: f.assessment,
      state,
      insights() {},
      results() {},
    });
    assert.match(text(screen.render()), /Language/);
    assert.match(text(screen.render()), /Motor/);
    f.child.allow_parent_view_eccd_marks = false;
    f.child.allow_parent_edit_home_based_eccd = false;
    assert.match(text(screen.render()), /Language/);
    f.child.allow_parent_view_eccd_pre = false;
    let output = text(screen.render());
    assert.match(output, /Locked by teacher/);
    assert.doesNotMatch(output, /Language|Motor|Pending Adviser Release/);
    f.child.allow_parent_view_eccd_pre = true;
    f.dashboard.needsSupportIn = "All Skills Mastered";
    assert.match(text(screen.render()), /All Skills Mastered/);
    f.dashboard.latestPhase = null;
    f.dashboard.currentPhase = "Not Started";
    output = text(screen.render());
    assert.match(output, /Not evaluated/);
    assert.doesNotMatch(output, /Language|All Skills Mastered/);
  });

  test("only bottom navigation has Messages/unread; logout clears confirmations and ignores late saves", async () => {
    const f = assessmentFixture();
    let loggedOut = false;
    const harness = componentHarness("ChildPortal.tsx", {
      "@react-native-async-storage/async-storage": {
        __esModule: true,
        default: { getItem: async () => "7", setItem: async () => {} },
      },
      "./resources": {
        useResource: () => ({
          data: [f.child],
          error: "",
          loading: false,
          reload: async () => {},
        }),
        Feedback: "Feedback",
      },
      "./ProfileScreen": {
        LinkChild: "LinkChild",
        ProfileScreen: "ProfileScreen",
      },
      "./OverviewScreen": { OverviewScreen: "OverviewScreen" },
      "./AssessmentScreens": {
        ResultsTab: "ResultsTab",
        InsightsTab: "InsightsTab",
      },
      "./MessagesScreen": {
        useMessaging: () => ({ client: {}, state: { unread: 3 } }),
        MessagesScreen: "MessagesScreen",
      },
    });
    const screen = harness.mount("ChildPortal", {
      user,
      logout: () => {
        loggedOut = true;
      },
    });
    screen.render();
    await new Promise<void>((resolve) => setImmediate(resolve));
    let tree = screen.render();
    assert.equal(
      elements(tree).some(
        (node) => node.type === "IconButton" && node.props.name === "messages",
      ),
      false,
    );
    const messages = find(
      tree,
      (node) =>
        node.props.accessibilityRole === "tab" &&
        node.props.accessibilityLabel === "Messages",
    );
    assert.ok(
      elements(messages).some(
        (node) =>
          typeof node.type === "function" &&
          node.type.name === "Unread" &&
          node.props.count === 3,
      ),
    );
    const overview = () =>
      find(screen.render(), (node) => node.type === "OverviewScreen");
    const onConfirmed = overview().props.onConfirmed as (
      period: string,
      ids: number[],
    ) => void;
    onConfirmed("PRE", [45]);
    assert.deepEqual(overview().props.confirmed, { "123_7_PRE": [45] });
    press(messages);
    tree = screen.render();
    assert.ok(elements(tree).some((node) => node.type === "MessagesScreen"));
    press(
      find(
        tree,
        (node) => node.type === "IconButton" && node.props.name === "logout",
      ),
    );
    assert.equal(loggedOut, true);
    press(
      find(
        screen.render(),
        (node) =>
          node.props.accessibilityRole === "tab" &&
          node.props.accessibilityLabel === "Overview",
      ),
    );
    assert.deepEqual(overview().props.confirmed, {});
    onConfirmed("PRE", [46]);
    assert.deepEqual(overview().props.confirmed, {});
    screen.unmount();
  });
});
