import assert from "node:assert/strict";
import {test} from "node:test";
import {decodeGeohash, encodeGeohash} from "../public/geohash.js";

test("encodes known coordinates at four-character precision", () => {
  assert.equal(encodeGeohash(40.7128, -74.006), "dr5r");
  assert.equal(encodeGeohash(0, 0), "s000");
});

test("decoded coordinates remain inside a coarse geohash cell", () => {
  const original = {lat: -33.8688, lng: 151.2093};
  const decoded = decodeGeohash(encodeGeohash(original.lat, original.lng));

  assert.ok(decoded);
  assert.ok(Math.abs(decoded.lat - original.lat) < 0.2);
  assert.ok(Math.abs(decoded.lng - original.lng) < 0.2);
});

test("rejects malformed geohashes and out-of-range coordinates", () => {
  assert.equal(decodeGeohash("abcd"), null);
  assert.equal(decodeGeohash("s0000"), null);
  assert.throws(() => encodeGeohash(91, 0), RangeError);
  assert.throws(() => encodeGeohash(0, 181), RangeError);
});
