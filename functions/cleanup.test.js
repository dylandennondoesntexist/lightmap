const assert = require("node:assert/strict");
const {test} = require("node:test");
const {buildDeletionBatch, cleanupPath} = require("./cleanup");

test("buildDeletionBatch maps every child key to null", () => {
  const snapshot = {
    forEach(callback) {
      callback({key: "first"});
      callback({key: "second"});
    },
  };

  assert.deepEqual(buildDeletionBatch(snapshot), {
    updates: {first: null, second: null},
    count: 2,
  });
});

test("cleanupPath skips updates when no records have expired", async () => {
  let cutoff;
  const snapshot = {exists: () => false};
  const query = {
    endAt(value) {
      cutoff = value;
      return this;
    },
    limitToFirst: () => query,
    once: async () => snapshot,
  };
  const reference = {
    orderByChild: () => query,
    update: async () => assert.fail("update should not be called"),
  };
  const database = {ref: () => reference};

  const deleted = await cleanupPath(database, "messages", 1_000, 5_000);

  assert.equal(cutoff, 4_000);
  assert.equal(deleted, 0);
});

test("cleanupPath rejects invalid retention windows", async () => {
  await assert.rejects(
    cleanupPath({ref: () => ({})}, "messages", 0),
    RangeError,
  );
});
