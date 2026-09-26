import { test } from "node:test";
import assert from "node:assert/strict";
import { order } from "../src/order.js";
const db = { insert: (value) => value };
test("ordinary order", () =>
  assert.deepEqual(order({ quantity: 2 }, db), { quantity: 2 }));
test("minimum valid quantity", () =>
  assert.deepEqual(order({ quantity: 1 }, db), { quantity: 1 }));
test("invalid quantities are rejected before a write", () => {
  for (const quantity of [-1, 0, 1.5, "2", null, undefined, NaN]) {
    let writes = 0;
    assert.throws(
      () =>
        order(
          { quantity },
          {
            insert: () => {
              writes++;
            },
          },
        ),
      RangeError,
    );
    assert.equal(writes, 0);
  }
});
