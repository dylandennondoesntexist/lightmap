// Behavioral tests for database.rules.json against the Realtime Database
// emulator. Not part of `npm test` because it needs the emulator (Java).
//
// Run with: npm run test:rules
// (which wraps: firebase emulators:exec --only database "node tests/rules.emulator.mjs")

import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? "127.0.0.1:9000";
const firebaserc = JSON.parse(await readFile(new URL("../.firebaserc", import.meta.url), "utf8"));
const PROJECT = firebaserc.projects.default;
const NS = `${PROJECT}-default-rtdb`;

const DAY_MS = 86_400_000;
const rulesJson = JSON.parse(await readFile(new URL("../database.rules.json", import.meta.url), "utf8"));
const CAP = Number(rulesJson.rules.stats.daily.count[".validate"].match(/newData\.val\(\) <= (\d+)/)[1]);
const SERVER_TIMESTAMP = {".sv": "timestamp"};
const INCREMENT_ONE = {".sv": {"increment": 1}};

function utcDayStart(ms) {
  return ms - (ms % DAY_MS);
}

// The emulator does not verify token signatures; this mirrors the unsecured
// JWT that @firebase/rules-unit-testing generates for authenticated contexts.
function fakeIdToken(uid) {
  const iat = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = {alg: "none", kid: "fakekid", type: "JWT"};
  const claims = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    iat,
    exp: iat + 3600,
    auth_time: iat,
    sub: uid,
    user_id: uid,
    provider_id: "anonymous",
    firebase: {sign_in_provider: "anonymous", identities: {}},
  };
  return `${encode(header)}.${encode(claims)}.`;
}

const USER_TOKEN = fakeIdToken("test-user-1");

async function request(method, path, {body, auth, admin} = {}) {
  const url = new URL(`http://${HOST}${path}.json`);
  url.searchParams.set("ns", NS);
  if (auth) url.searchParams.set("auth", USER_TOKEN);
  const headers = {};
  if (admin) headers.Authorization = "Bearer owner";
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Some denials return an empty body.
  }
  return {status: response.status, payload};
}

const adminPut = (path, body) => request("PUT", path, {body, admin: true});
const adminGet = (path) => request("GET", path, {admin: true});
const resetDatabase = () => adminPut("/", null);

let failures = 0;
async function check(name, promise, expectAllowed) {
  const {status} = await promise;
  const allowed = status === 200;
  if (allowed === expectAllowed) {
    console.log(`ok    - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  - ${name} (status ${status}, expected ${expectAllowed ? "allowed" : "denied"})`);
  }
}
const expectAllowed = (name, promise) => check(name, promise, true);
const expectDenied = (name, promise) => check(name, promise, false);

function message(overrides = {}) {
  return {geohash: "9q8y", color: "#AA4499", timestamp: SERVER_TIMESTAMP, ...overrides};
}

function permanentMessage() {
  return {geohash: "9q8y", timestamp: SERVER_TIMESTAMP, type: "permanent"};
}

let keyCounter = 0;
const newKey = () => `test-message-${keyCounter++}`;

// A press is one atomic multi-path update: the message plus the counter.
function countedUpdate(statsWrite, messagePath = "messages", body = message(), messageId = newKey()) {
  return {
    [`${messagePath}/${messageId}`]: body,
    "stats/daily": {...statsWrite, messageId, messagePath},
  };
}

function press(statsWrite, messagePath = "messages", body = message()) {
  return request("PATCH", "/", {
    auth: true,
    body: countedUpdate(statsWrite, messagePath, body),
  });
}

const today = utcDayStart(Date.now());
const yesterday = today - DAY_MS;
const resetWrite = {day: today, count: 1};
const incrementWrite = {day: today, count: INCREMENT_ONE};

// --- reads ---
await resetDatabase();
await expectDenied("unauthenticated read of messages",
  request("GET", "/messages"));
await expectAllowed("authenticated read of messages",
  request("GET", "/messages", {auth: true}));
await expectAllowed("authenticated read of stats/daily",
  request("GET", "/stats/daily", {auth: true}));

// --- basic write coupling ---
await expectDenied("unauthenticated press",
  request("PATCH", "/", {body: countedUpdate(resetWrite)}));
await expectDenied("message without the counter in the same update",
  request("PUT", `/messages/${newKey()}`, {auth: true, body: message()}));
await expectAllowed("first press of the day (counter reset to 1)",
  press(resetWrite));
await expectAllowed("second press of the day (increment by 1)",
  press(incrementWrite));

let stats = (await adminGet("/stats/daily")).payload;
assert.equal(stats.day, today, "counter should use today's UTC day");
assert.equal(stats.count, 2, "counter should be 2 after two presses");
assert.equal(stats.messagePath, "messages", "counter should identify the submitted collection");
assert.equal(typeof stats.messageId, "string", "counter should identify the submitted message");

await expectDenied("press with a stale counter day",
  press({day: yesterday, count: INCREMENT_ONE}));
await expectDenied("press incrementing the counter by 2",
  press({day: today, count: {".sv": {"increment": 2}}}));
await expectDenied("press resetting the counter mid-day",
  press(resetWrite));
await expectDenied("message alongside an unrelated write instead of the counter",
  request("PATCH", "/", {auth: true, body: {[`messages/${newKey()}`]: message()}}));

// --- message shape still validated ---
await expectDenied("press with an invalid color",
  press(incrementWrite, "messages", message({color: "#FF0000"})));
await expectDenied("press with a client-supplied timestamp",
  press(incrementWrite, "messages", message({timestamp: Date.now() - 60_000})));
await expectDenied("press with a five-character geohash",
  press(incrementWrite, "messages", message({geohash: "9q8yy"})));
await expectDenied("press with an extra field",
  press(incrementWrite, "messages", message({uid: "abc"})));

// --- permanent messages participate in the same cap ---
await expectAllowed("permanent press with counter increment",
  press(incrementWrite, "permanent_messages", permanentMessage()));
await expectDenied("permanent press without the counter",
  request("PUT", `/permanent_messages/${newKey()}`, {auth: true, body: permanentMessage()}));

// --- the cap itself ---
await adminPut("/stats/daily", {day: today, count: CAP});
await expectDenied("press once the daily cap is reached",
  press(incrementWrite));
await expectDenied("press resetting the counter to dodge the cap",
  press(resetWrite));

// --- day rollover ---
await adminPut("/stats/daily", {day: yesterday, count: CAP});
await expectDenied("increment on a new day without resetting",
  press(incrementWrite));
await expectAllowed("first press of a new day resets a full counter",
  press(resetWrite));

// --- direct counter manipulation ---
await adminPut("/stats/daily", {day: today, count: 5});
await expectDenied("setting the counter to an arbitrary value",
  request("PATCH", "/stats/daily", {auth: true, body: {count: 9999}}));
await expectDenied("resetting today's counter to 1",
  request("PUT", "/stats/daily", {auth: true, body: {day: today, count: 1}}));
await expectDenied("adding an extra field to the counter",
  request("PUT", "/stats/daily", {auth: true, body: {day: today, count: 6, note: "x"}}));
await expectDenied("burning one counter slot without a message",
  request("PUT", "/stats/daily", {
    auth: true,
    body: {day: today, count: INCREMENT_ONE, messageId: newKey(), messagePath: "messages"},
  }));
await expectDenied("deleting the daily counter",
  request("DELETE", "/stats/daily", {auth: true}));

await adminPut("/stats/daily", {day: yesterday, count: 9800});
await expectDenied("carrying yesterday's count into today by rewriting only the day",
  request("PATCH", "/stats/daily", {auth: true, body: {day: today}}));

// --- one counter slot authorizes exactly one correlated message ---
await adminPut("/stats/daily", {day: today, count: 5});
const firstBatchId = newKey();
const secondBatchId = newKey();
await expectDenied("crafted batch cannot share one counter slot across two messages",
  request("PATCH", "/", {
    auth: true,
    body: {
      [`messages/${firstBatchId}`]: message(),
      [`messages/${secondBatchId}`]: message(),
      "stats/daily": {
        ...incrementWrite,
        messageId: firstBatchId,
        messagePath: "messages",
      },
    },
  }));

const sharedId = newKey();
await expectDenied("one counter slot cannot authorize both message collections",
  request("PATCH", "/", {
    auth: true,
    body: {
      [`messages/${sharedId}`]: message(),
      [`permanent_messages/${sharedId}`]: permanentMessage(),
      "stats/daily": {
        ...incrementWrite,
        messageId: sharedId,
        messagePath: "messages",
      },
    },
  }));

const actualId = newKey();
await expectDenied("counter metadata must identify the message being created",
  request("PATCH", "/", {
    auth: true,
    body: {
      [`messages/${actualId}`]: message(),
      "stats/daily": {
        ...incrementWrite,
        messageId: newKey(),
        messagePath: "messages",
      },
    },
  }));

await resetDatabase();

if (failures > 0) {
  console.error(`\n${failures} rule test(s) failed.`);
  process.exit(1);
}
console.log("\nAll rule behavior tests passed.");
