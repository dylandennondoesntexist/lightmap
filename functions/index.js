const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest} = require("firebase-functions/v2/https");
const {getDatabase} = require("firebase-admin/database");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

// Initialize the Firebase Admin SDK.
admin.initializeApp();

// Define the retention period (7 days in milliseconds)
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A helper function to clean up old records from a specified database path.
 * @param {string} path The database path to clean up (e.g., "messages").
 * @return {Promise<number>} A promise that resolves with the number of
 * deleted records.
 */
async function cleanupPath(path) {
  const now = Date.now();
  const cutoff = now - SEVEN_DAYS_IN_MS;
  const ref = getDatabase().ref(path);

  // Query for records older than the cutoff timestamp.
  const oldRecordsQuery = ref.orderByChild("timestamp").endAt(cutoff);

  try {
    const snapshot = await oldRecordsQuery.once("value");
    if (!snapshot.exists()) {
      logger.log(`No old records to delete in /${path}.`);
      return 0;
    }

    let deletedCount = 0;
    const updates = {};

    // Create a single multi-path update to remove all old records at once.
    // Setting a path to "null" in a multi-path update deletes it.
    snapshot.forEach((childSnapshot) => {
      updates[childSnapshot.key] = null;
      deletedCount++;
    });

    // Atomically remove all old records.
    await ref.update(updates);

    logger.log(
        `Successfully deleted ${deletedCount} old records from /${path}.`,
    );
    return deletedCount;
  } catch (error) {
    logger.error(`Error cleaning up old records from /${path}:`, error);
    // Rethrow error to ensure function execution is marked as failure.
    throw error;
  }
}

/**
 * Scheduled Cloud Function to clean up old messages and permanent messages.
 * It runs once a week at midnight on Sunday.
 */
exports.scheduledCleanup = onSchedule("every sunday 00:00", async (event) => {
  logger.log("Running weekly database cleanup...");

  try {
    // Run cleanup for both paths in parallel for efficiency.
    const [messagesDeleted, permanentMessagesDeleted] = await Promise.all([
      cleanupPath("messages"),
      cleanupPath("permanent_messages"),
    ]);

    logger.log(
        `Cleanup finished. Deleted ${messagesDeleted} ephemeral ` +
        `messages and ${permanentMessagesDeleted} permanent messages.`,
    );
  } catch (error) {
    logger.error("Database cleanup failed overall.", error);
    // The function will be marked as having an error, which you can monitor.
  }
});

/**
 * Optional: An HTTP-triggered function for manually testing the cleanup logic.
 * Access this via its URL after deployment.
 * Be cautious, as this will delete data from your database.
 */
exports.testCleanup = onRequest(async (req, res) => {
  try {
    const [messagesDeleted, permanentMessagesDeleted] = await Promise.all([
      cleanupPath("messages"),
      cleanupPath("permanent_messages"),
    ]);
    const totalDeleted = messagesDeleted + permanentMessagesDeleted;
    res.status(200).send(
        `Test cleanup completed. Deleted ${totalDeleted} total records.`,
    );
  } catch (error) {
    logger.error("Error during test cleanup:", error);
    res.status(500).send(`Error during test cleanup: ${error.message}`);
  }
});
