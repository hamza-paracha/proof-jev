# Green tests. Bad order.

A reproducible example of why a passing test suite is only part of the evidence. The same small application connects all three parts of Proof-Jev: structured Jev review, real browser verification, and diff-aware mutation testing.

## Run it

From a checkout, with Node.js 22+ and Git installed:

```sh
npm ci
npx playwright install chromium
npm run showcase
```

On Linux, use `npx playwright install --with-deps chromium`. No API key is needed. The command prints the path to an offline `index.html` and a machine-readable `showcase.json`. Open the HTML file in your browser. No report server, account, or remote assets are required.

## What actually runs

1. **Seed a known regression.** The runner copies the [order application](../examples/order-guard/) into a disposable Git repository, removes its quantity-validation guard, and installs a weak test for quantity `2`. That test passes.
2. **Replay a real Jev review.** A checked-in response from `jev-1.13.0` flags missing validation for this exact before/after source pair. The evaluation verifies the suite fingerprint, questions, and response structure. It is recorded evidence; there is no new model request.
3. **Reproduce the bug in Chromium.** Enter `−1`, submit the order, expect HTTP 400 and no persisted order. The buggy server returns 201. An independent read of the underlying data file confirms `{ "order": { "quantity": -1 } }`.
4. **Restore the known guard.** This is a disclosed scripted repair, not model-generated code. The weak tests still pass with all three sampled mutations: removing the guard, changing the boundary, and changing the logical operator.
5. **Strengthen the assertions.** Add valid-boundary and invalid-input tests, including checking that invalid data never reaches the write function. The same three mutations are now detected. The mutation engine repeats each failing mutant in a fresh copy.
6. **Rerun the identical browser workflow.** The repaired server returns 400, the workflow passes, and an independent disk read confirms `{ "order": null }`.

The command exits successfully only if those outcomes hold, both mutation runs compare identical mutation IDs, and the repaired source remains unchanged. It cleans up the fixture and server processes and retains reports and exact patches. CI runs it on Node 22 and 24 without provider credentials.

## Expected results

| Evidence | Before | After |
| --- | --- | --- |
| Ordinary example test | Passes despite the bug | Passes |
| Browser workflow | Fails: HTTP 201 instead of 400 | Passes: HTTP 400, no persisted order |
| Independent disk read | Invalid quantity `−1` saved | No order saved |
| Sampled mutations surviving tests | 3 of 3 with weak tests | 0 of the same 3 with stronger tests |
| New model calls | 0 | 0 |

The offline report links the recorded judgment, source pair, baseline output, browser traces, disk snapshots, mutation reports, and exact patches. The review, browser, and mutation tools also generate their own `report.html` during normal use.

## What this establishes

This synthetic example demonstrates how the three evidence sources complement one another. Jev identifies an advisory concern; executable checks expose the behavior and whether the tests detect the sampled faults. It does not establish general review accuracy, complete test coverage, autonomous repair, or production readiness.

For fresh Jev review of your changes, configure the provider and persistent budget in the [structured review guide](structured-review.md). For an agent-driven persistence repair through an installed MCP runtime, see the separate [validation record](validation.md#source-level-reproduce--fix--verify).
