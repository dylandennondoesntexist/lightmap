import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const rules = JSON.parse(await readFile("database.rules.json", "utf8")).rules;

test("the database denies reads and writes by default", () => {
  assert.equal(rules[".read"], false);
  assert.equal(rules[".write"], false);
});

test("map records are create-only for authenticated clients", () => {
  for (const path of ["messages", "permanent_messages"]) {
    const record = rules[path]["$messageId"];
    assert.equal(record[".write"], "auth != null && !data.exists()");
    assert.match(record.geohash[".validate"], /\{4\}\$/);
    assert.equal(record["$other"][".validate"], false);
  }
});

test("every map record write must match the shared daily counter metadata", () => {
  for (const path of ["messages", "permanent_messages"]) {
    const validate = rules[path]["$messageId"][".validate"];
    assert.match(validate, /stats\/daily\/count/);
    assert.match(validate, /stats\/daily\/day/);
    assert.match(validate, /stats\/daily\/messageId/);
    assert.match(validate, /stats\/daily\/messagePath/);
  }
});

test("the daily counter is non-deletable and validates its correlation fields", () => {
  const daily = rules.stats.daily;
  assert.equal(daily[".read"], "auth != null");
  assert.equal(daily[".write"], "auth != null && newData.exists()");
  assert.match(daily[".validate"], /messageId/);
  assert.match(daily[".validate"], /messagePath/);
  assert.match(daily[".validate"], /!root\.child/);
  assert.match(daily.day[".validate"], /now - \(now % 86400000\)/);
  assert.match(daily.count[".validate"], /newData\.val\(\) == data\.val\(\) \+ 1/);
  assert.match(daily.messagePath[".validate"], /permanent_messages/);
  assert.equal(daily["$other"][".validate"], false);
});

test("the rules cap matches the client cap constant", async () => {
  const countValidate = rules.stats.daily.count[".validate"];
  const ruleCap = Number(countValidate.match(/newData\.val\(\) <= (\d+)/)[1]);
  const mainJs = await readFile("public/main.js", "utf8");
  const clientCap = Number(mainJs.match(/DAILY_GLOBAL_CAP: (\d+)/)[1]);

  assert.equal(ruleCap, clientCap, "database.rules.json and main.js disagree on the daily cap");
  assert.ok(Number.isInteger(ruleCap) && ruleCap > 0);
});
