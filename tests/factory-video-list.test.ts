import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isAutoclippedFactoryVideo } from "../src/lib/factory-video-list";

test("autoclipped job list includes archive selections and marked edited clips", () => {
  assert.equal(
    isAutoclippedFactoryVideo({ source: { kind: "watchArchiveSelection" } }),
    true,
  );
  assert.equal(
    isAutoclippedFactoryVideo({ source: { kind: "clip", autoclipped: true } }),
    true,
  );
  assert.equal(
    isAutoclippedFactoryVideo({ source: { kind: "clip" } }),
    false,
  );
});
