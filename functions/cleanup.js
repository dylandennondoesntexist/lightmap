const BATCH_SIZE = 500;

/**
 * Builds a multi-location deletion update from a Firebase snapshot.
 * @param {import("firebase-admin/database").DataSnapshot} snapshot snapshot
 * @return {{updates: Record<string, null>, count: number}} deletion batch
 */
function buildDeletionBatch(snapshot) {
  const updates = {};
  let count = 0;

  snapshot.forEach((childSnapshot) => {
    updates[childSnapshot.key] = null;
    count += 1;
  });

  return {updates, count};
}

/**
 * Deletes records older than a retention window in bounded batches.
 * @param {import("firebase-admin/database").Database} database database
 * @param {string} path database path
 * @param {number} retentionMs retention duration
 * @param {number} now current time, injectable for tests
 * @return {Promise<number>} number of deleted records
 */
async function cleanupPath(database, path, retentionMs, now = Date.now()) {
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
    throw new RangeError("retentionMs must be a positive number.");
  }

  const reference = database.ref(path);
  const cutoff = now - retentionMs;
  let deletedCount = 0;
  let batchCount;

  do {
    const snapshot = await reference
      .orderByChild("timestamp")
      .endAt(cutoff)
      .limitToFirst(BATCH_SIZE)
      .once("value");

    if (!snapshot.exists()) break;

    const {updates, count} = buildDeletionBatch(snapshot);
    await reference.update(updates);
    deletedCount += count;
    batchCount = count;
  } while (batchCount === BATCH_SIZE);

  return deletedCount;
}

module.exports = {buildDeletionBatch, cleanupPath};
