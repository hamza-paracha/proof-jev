// Called with untrusted JSON. Reject invalid quantities before writing.
export function order(body, db) {
  if (!Number.isInteger(body.quantity) || body.quantity < 1) throw new RangeError("quantity");
  return db.insert({ quantity: body.quantity });
}
