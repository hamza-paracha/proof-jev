# Contributing to Proof-Jev

Use Node.js 22+, npm, and Git. The code product's checks need no browser or provider credentials:

```sh
npm ci
npm run typecheck
npm test
npm run verify:change-demo
npm run verify:install
npm run plugin:build
npm run verify:plugin
```

Diff analysis and mutation execution live in `src/change/`; structured review lives in `src/review/`. The code-only CLI, MCP server, and setup checks are in `src/verify/`. Tests exercise the real MCP transport and disposable repositories. Paid provider calls must remain outside the default suite and CI.

Run the clean-package and plugin checks when changing packaging, dependencies, CLI, or MCP behavior. Both distributions must expose eight code tools and function without Playwright installed. Keep source-location evidence, explicit execution configuration, persistent model budgets, cancellation, and mutation baseline handling intact.

The source tree contains only the code product. New workflows should target source code and tests.

For a reproducible check against real historical production changes, run `npm run verify:repository` from a full checkout. It writes source hashes, exact mutation patches, and test outcomes under `out/repository-validation/current/`. Investigate survivors against the requirements; do not add assertions merely to force a perfect score.

Bug reports should include the version, OS, Node version, minimal repository changes, expected outcome, and actual evidence. Redact source or command output before sharing. See [SECURITY.md](SECURITY.md) for private vulnerability reports.
