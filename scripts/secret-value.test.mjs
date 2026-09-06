import assert from "node:assert/strict";
import test from "node:test";
import { requireSecretValue } from "./lib/secret-value.mjs";

test("export placeholders cannot become encryption keys", () => {
  for (const value of [undefined, "", "[SENSITIVE]", " [REDACTED] "]) {
    assert.throws(() => requireSecretValue(value, "TEST_SECRET"), /actual provisioned secret/);
  }
  assert.equal(requireSecretValue("synthetic-real-value", "TEST_SECRET"), "synthetic-real-value");
});
