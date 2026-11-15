import { test } from "node:test";
import assert from "node:assert/strict";
import { RELATIONSHIPS } from "../src/contracts.ts";
import { registrationPayload } from "../src/policy.ts";
import { linkPayload } from "../src/profile.ts";
import { DraftStore } from "../src/draftStore.ts";

test("registration sends the selected canonical relationship and preserves password bytes", () => {
  assert.deepEqual(RELATIONSHIPS, ["Father", "Mother", "Guardian"]);
  for (const relationship of RELATIONSHIPS) {
    assert.deepEqual(
      registrationPayload({
        firstName: " Ana ",
        lastName: " Cruz ",
        email: " ANA@EXAMPLE.COM ",
        password: " Secret123 ",
        relationship,
      }),
      {
        firstName: "Ana",
        lastName: "Cruz",
        email: "ana@example.com",
        password: " Secret123 ",
        relationship,
        terms_accepted: true,
      },
    );
  }
});

test("legacy link drafts retain the LRN but never override the registered relationship", async () => {
  const key = "ames_draft_123_parent_link";
  const saved = {
    owner_id: 123,
    revision: "old-revision",
    is_pending_sync: false,
    values: { lrn_number: " 123456789012 ", relationship_type: "Father" },
  };
  const storage = new Map([[key, JSON.stringify(saved)]]);
  const store = new DraftStore({
    getItem: async (k) => storage.get(k) ?? null,
    setItem: async (k, v) => {
      storage.set(k, v);
    },
    removeItem: async (k) => {
      storage.delete(k);
    },
  });
  const snapshot = await store.load<typeof saved.values>(key, 123);
  assert.ok(snapshot);
  assert.deepEqual(linkPayload(snapshot.values), {
    lrn_number: "123456789012",
  });
  assert.deepEqual(
    JSON.parse(storage.get(key)!),
    saved,
    "reading/submitting a payload cannot erase unconfirmed input",
  );
  await store.confirm(key, 123, snapshot.revision);
  assert.equal(storage.has(key), false);
  assert.deepEqual(linkPayload({ lrn_number: "123456789012" }), {
    lrn_number: "123456789012",
  });
});
