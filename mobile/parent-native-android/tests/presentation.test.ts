import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adviserName,
  displayTime,
  statusColor,
  tierColor,
} from "../src/presentation.ts";

test("adviser uses the current profile teacher fields before the optional legacy name", () => {
  assert.equal(
    adviserName({
      teacher_fname: " Ana ",
      teacher_lname: " Cruz ",
      adviser_name: "Old name",
    }),
    "Ana Cruz",
  );
  assert.equal(
    adviserName({ teacher_fname: " Ana ", teacher_lname: null }),
    "Ana",
  );
  assert.equal(adviserName({ teacher_lname: " Cruz " }), "Cruz");
  assert.equal(
    adviserName({
      teacher_fname: " ",
      teacher_lname: "",
      adviser_name: " Ana Cruz ",
    }),
    "Ana Cruz",
  );
  assert.equal(
    adviserName({ teacher_fname: null, teacher_lname: " ", adviser_name: " " }),
    "Not assigned",
  );
  assert.equal(adviserName({}), "Not assigned");
});

test("message timestamps use Philippine time and preserve missing/invalid states", () => {
  assert.equal(displayTime(null), "No messages yet");
  assert.equal(displayTime("not-a-date"), "Time unavailable");
  assert.equal(
    displayTime("2026-11-15T00:30:00"),
    displayTime("2026-11-15T08:30:00+08:00"),
  );
  assert.match(displayTime("2026-11-15T00:30:00Z"), /8:30/);
  assert.match(displayTime("2026-11-15T23:30:00Z", true), /Nov 16/);
});
test("server status enums and baseline tiers have distinct accessible colors", () => {
  assert.equal(statusColor("success"), "#15803d");
  assert.equal(statusColor("warning"), "#b45309");
  assert.equal(statusColor("unrecognized"), "#64748b");
  assert.equal(tierColor("Average"), "#15803d");
  assert.equal(tierColor("Slight Delay"), "#b45309");
  assert.equal(tierColor("Delay"), "#b91c1c");
});
