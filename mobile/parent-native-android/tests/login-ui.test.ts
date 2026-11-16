import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { componentHarness, elements, text } from "./component-harness.ts";
import type { Element, Props } from "./component-harness.ts";

const find = (tree: unknown, predicate: (node: Element) => boolean) => {
  const node = elements(tree).find(predicate);
  assert.ok(node);
  return node;
};
const button = (tree: unknown, title: string) =>
  find(tree, (node) => node.type === "Button" && node.props.title === title);
const press = (node: Element) => {
  assert.notEqual(node.props.disabled, true);
  (node.props.onPress as () => void)();
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const terms = (tree: unknown) => find(tree, (node) => node.type === "Terms");
const change = (tree: Element, label: string, value: string) => {
  (
    find(tree, (node) => node.type === "Input" && node.props.label === label)
      .props.onChangeText as (value: string) => void
  )(value);
};
function authHarness(
  authenticate: (path: string, body: unknown) => Promise<unknown>,
) {
  return componentHarness("AuthScreen.tsx", {
    "./session": { session: { authenticate } },
    "./TermsPrivacyAcknowledgment": {
      TermsPrivacyAcknowledgment: "Terms",
      linkBlue: "#155dfc",
    },
  }).mount("AuthScreen", {});
}

describe("Compact login and website Terms interactions (mocked hosts)", () => {
  test("compact login has an inline blue registration link, preserving entered credentials", (t) => {
    const screen = authHarness(async () => assert.fail("No request expected"));
    t.after(() => screen.unmount());
    let tree = screen.render();
    assert.doesNotMatch(
      text(tree),
      /Welcome back|Sign in to follow|New to AMES/,
    );
    assert.equal(
      elements(tree).some((n) =>
        /website|Create parent account/i.test(String(n.props.title)),
      ),
      false,
    );
    assert.match(
      text(tree).replace(/\s+/g, " "),
      /Don't have an account yet\? Click here/,
    );
    const link = find(
      tree,
      (n) => n.props.accessibilityRole === "link" && text(n) === "Click here",
    );
    assert.equal((link.props.style as Props).color, "#155dfc");
    change(tree, "Email", "parent@example.test");
    change(tree, "Password", " SamplePass1 ");
    press(link);
    tree = screen.render();
    assert.match(text(tree), /Create your parent account/);
    assert.ok(
      find(
        tree,
        (n) => n.props.accessibilityLabel === "Choose relationship to child",
      ),
    );
    assert.equal(
      find(tree, (n) => n.props.label === "Email").props.value,
      "parent@example.test",
    );
    press(
      find(
        tree,
        (n) =>
          n.props.accessibilityRole === "link" && text(n) === "Sign in instead",
      ),
    );
    tree = screen.render();
    assert.equal(
      find(tree, (n) => n.props.label === "Password").props.value,
      " SamplePass1 ",
    );
  });

  test("agreement gates login and OTP; request payload, challenge and cooldown remain intact", async (t) => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const screen = authHarness(async (path, body) => {
      calls.push({ path, body });
      return path.endsWith("login")
        ? {
            success: true,
            requireOtp: true,
            challengeToken: "challenge-only",
            email: "parent@example.test",
          }
        : { success: true };
    });
    t.after(() => screen.unmount());
    let tree = screen.render();
    change(tree, "Email", " Parent@Example.test ");
    change(tree, "Password", " KeepPassword1 ");
    tree = screen.render();
    assert.equal(button(tree, "Log In").props.disabled, true);
    // The handler also rejects an unchecked agreement, even if invoked directly.
    (button(tree, "Log In").props.onPress as () => void)();
    await flush();
    assert.equal(calls.length, 0);
    tree = screen.render();
    assert.match(
      text(tree),
      /Please accept the Terms and Conditions before signing in\./,
    );
    (terms(tree).props.onChange as (checked: boolean) => void)(true);
    tree = screen.render();
    assert.doesNotMatch(text(tree), /Please accept the Terms/);
    press(button(tree, "Log In"));
    assert.equal(terms(screen.render()).props.disabled, true);
    await flush();
    assert.deepEqual(calls, [
      {
        path: "/api/auth/login",
        body: {
          email: "parent@example.test",
          password: " KeepPassword1 ",
          terms_accepted: true,
        },
      },
    ]);
    tree = screen.render();
    assert.match(text(tree), /Verify your email/);
    assert.equal(
      find(tree, (n) => String(n.props.title).startsWith("Retry email in"))
        .props.disabled,
      true,
    );
    (
      find(tree, (n) => n.type === "OtpInput").props.onChange as (
        s: string,
      ) => void
    )("123456");
    (terms(tree).props.onChange as (checked: boolean) => void)(false);
    tree = screen.render();
    assert.equal(button(tree, "Verify & Log In").props.disabled, true);
    (button(tree, "Verify & Log In").props.onPress as () => void)();
    await flush();
    assert.equal(calls.length, 1);
    tree = screen.render();
    (terms(tree).props.onChange as (checked: boolean) => void)(true);
    tree = screen.render();
    press(button(tree, "Verify & Log In"));
    await flush();
    assert.deepEqual(calls[1], {
      path: "/api/auth/verify-otp",
      body: {
        challengeToken: "challenge-only",
        otp: "123456",
        terms_accepted: true,
      },
    });
  });

  test("Terms link is blue and separate from checkbox; Close never accepts, Accept does", () => {
    const changes: boolean[] = [];
    const onChange = (checked: boolean) => changes.push(checked);
    const harness = componentHarness("TermsPrivacyAcknowledgment.tsx", {});
    const screen = harness.mount("TermsPrivacyAcknowledgment", {
      checked: false,
      onChange,
    });
    let tree = screen.render();
    const link = find(tree, (n) => n.props.accessibilityRole === "link");
    assert.equal(text(link), "Terms and Conditions");
    assert.equal((link.props.style as Props).color, "#155dfc");
    assert.equal(
      elements(
        find(tree, (n) => n.props.accessibilityRole === "checkbox"),
      ).includes(link),
      false,
    );
    press(link);
    tree = screen.render();
    assert.deepEqual(changes, []);
    let dialog = find(tree, (n) => n.type === "Dialog");
    assert.equal(
      dialog.props.title,
      "Terms and Conditions and Data Privacy Notice",
    );
    assert.equal(dialog.props.closeLabel, "Close Terms and Conditions");
    assert.equal(
      elements(dialog).filter((n) => typeof n.type === "function").length,
      5,
    );
    press(button(dialog.props.footer, "Close"));
    tree = screen.render();
    assert.equal(
      elements(tree).some((n) => n.type === "Dialog"),
      false,
    );
    assert.deepEqual(changes, []);
    press(find(tree, (n) => n.props.accessibilityRole === "link"));
    tree = screen.render();
    dialog = find(tree, (n) => n.type === "Dialog");
    press(button(dialog.props.footer, "I Agree & Accept"));
    assert.deepEqual(changes, [true]);
    assert.equal(
      elements(screen.render()).some((n) => n.type === "Dialog"),
      false,
    );
    tree = screen.render({
      checked: true,
      onChange,
    });
    press(find(tree, (n) => n.props.accessibilityRole === "checkbox"));
    assert.deepEqual(changes, [true, false]);
    screen.unmount();
  });

  test("busy acknowledgment remains readable, but neither checkbox nor dialog may accept", () => {
    const changes: boolean[] = [];
    const screen = componentHarness("TermsPrivacyAcknowledgment.tsx", {}).mount(
      "TermsPrivacyAcknowledgment",
      {
        checked: false,
        disabled: true,
        onChange: (checked: boolean) => changes.push(checked),
      },
    );
    let tree = screen.render();
    assert.equal(
      find(tree, (n) => n.props.accessibilityRole === "checkbox").props
        .disabled,
      true,
    );
    press(find(tree, (n) => n.props.accessibilityRole === "link"));
    tree = screen.render();
    const dialog = find(tree, (n) => n.type === "Dialog");
    const accept = button(dialog.props.footer, "I Agree & Accept");
    assert.equal(accept.props.disabled, true);
    (accept.props.onPress as () => void)();
    assert.deepEqual(changes, []);
    (dialog.props.close as () => void)();
    assert.deepEqual(changes, []);
    screen.unmount();
  });
});
