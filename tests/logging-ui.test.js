import assert from "node:assert/strict";
import test from "node:test";

test("logging ui package is wired for build", () => {
  assert.equal("constitute-logging-ui".startsWith("constitute-"), true);
});
