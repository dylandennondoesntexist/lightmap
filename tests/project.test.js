import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

test("Firebase Hosting publishes only the public directory", async () => {
  const firebase = JSON.parse(await readFile("firebase.json", "utf8"));

  assert.equal(firebase.hosting.public, "public");
  assert.equal(firebase.database.rules, "database.rules.json");
});

test("the public entry point references pinned external assets", async () => {
  const html = await readFile("public/index.html", "utf8");

  assert.match(html, /d3@7\.9\.0/);
  assert.match(html, /topojson-client@3\.1\.0/);
  assert.doesNotMatch(html, /user-scalable=no/);
});

test("the config template includes the optional App Check hook", async () => {
  const template = await readFile("public/config.template.js", "utf8");

  assert.match(template, /export const appCheckSiteKey/);
});

test("the CSP permits every external origin the client contacts", async () => {
  const firebase = JSON.parse(await readFile("firebase.json", "utf8"));
  const csp = firebase.hosting.headers[0].headers
    .find((header) => header.key === "Content-Security-Policy").value;
  const directives = csp.split(";").map((directive) => directive.trim());
  const connectSrc = directives.find((directive) => directive.startsWith("connect-src"));
  const scriptSrc = directives.find((directive) => directive.startsWith("script-src"));

  // The world atlas is fetched (not script-loaded) from jsDelivr, so it needs
  // connect-src as well; a miss here blanks the whole map.
  assert.match(connectSrc, /https:\/\/cdn\.jsdelivr\.net/);
  assert.match(connectSrc, /wss:\/\/\*\.firebaseio\.com/);
  assert.match(connectSrc, /https:\/\/\*\.googleapis\.com/);
  assert.match(scriptSrc, /https:\/\/cdn\.jsdelivr\.net/);
  assert.match(scriptSrc, /https:\/\/www\.gstatic\.com/);
});
