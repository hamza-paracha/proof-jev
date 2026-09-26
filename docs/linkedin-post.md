# LinkedIn launch draft

My tests passed. The app still saved an order with a quantity of −1.

That’s the small, reproducible demo I built for Proof-Jev — an open-source project using Jev to review code, backed by checks you can actually inspect.

It brings three things into the same workflow:

→ Jev flags risky changes with structured judgments and visible uncertainty.
→ Mutation testing deliberately changes the code to find faults your tests miss.
→ A real browser checks what the app does, including whether data reached storage.

In the demo, the original tests missed all three sampled mutations. After adding boundary and invalid-input assertions, they caught the same three. The repaired app rejected the invalid order, and a separate disk read confirmed it wasn’t saved.

You can reproduce it with `npm run showcase`. The demo replays a real recorded Jev review; the browser, storage checks, and mutation tests run locally each time. No API key needed for the demo.

The result is an offline report with the actual source changes, exact mutation patches, browser traces, and before/after evidence. The tools also work through MCP and a CLI.

It’s an alpha, and the demo uses a seeded bug with a scripted repair. The point is to make “the agent says it works” something you can investigate and test.

Code + instructions: https://github.com/hamza-paracha/proof-jev

I’d love to hear which bugs your green test suites have missed.

---

## Posting notes

Attach a screenshot of the generated `index.html`, showing the real results and the “recorded Jev / live executable checks” label. Keep the no-new-model-calls distinction visible. Avoid claims about general accuracy, enterprise adoption, complete coverage, or autonomous repair.

The new showcase currently lives in [PR #4](https://github.com/hamza-paracha/proof-jev/pull/4). Merge the reviewed PR before posting the default-branch quickstart, or link the branch explicitly while it is pending. Do not imply the default branch includes unmerged work.
