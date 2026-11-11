import { test } from "node:test";
import assert from "node:assert/strict";
import { quantizeControl } from "./control-number.ts";
test("offset LUT grid retains factory 17 and all declared steps", () => {
  for (const n of [9, 13, 17, 21, 25, 29, 33]) assert.equal(quantizeControl(n, 9, 33, 4), n);
  assert.equal(quantizeControl(18, 9, 33, 4), 17);
});
test("signed exposure, fractional grain and limits keep exact precision", () => {
  assert.equal(quantizeControl(-1.25, -3, 3, 0.25), -1.25);
  assert.equal(quantizeControl(0.995, 0, 0.995, 0.005), 0.995);
  assert.equal(quantizeControl(0.301, 0, 1, 0.005), 0.3);
  assert.equal(quantizeControl(-20, -3, 3, 0.25), -3);
  assert.equal(quantizeControl(20, -3, 3, 0.25), 3);
  assert.equal(quantizeControl(0.000003, 0.000001, 0.000009, 0.000002), 0.000003);
});
