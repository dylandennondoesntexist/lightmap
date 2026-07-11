const {initializeApp} = require("firebase-admin/app");
const {getDatabase} = require("firebase-admin/database");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {cleanupPath} = require("./cleanup");

initializeApp();

const HOUR_IN_MS = 60 * 60 * 1000;
const RETENTION = {
  messages: HOUR_IN_MS,
  permanentMessages: 25 * HOUR_IN_MS,
};

/**
 * Removes expired records every hour. Ephemeral messages remain in the
 * database for at most roughly two hours; daily dots for roughly 26 hours.
 */
exports.scheduledCleanup = onSchedule("every 60 minutes", async () => {
  logger.info("Starting database cleanup.");
  const database = getDatabase();

  const [messagesDeleted, permanentMessagesDeleted] = await Promise.all([
    cleanupPath(database, "messages", RETENTION.messages),
    cleanupPath(
      database,
      "permanent_messages",
      RETENTION.permanentMessages,
    ),
  ]);

  logger.info("Database cleanup completed.", {
    messagesDeleted,
    permanentMessagesDeleted,
  });
});
