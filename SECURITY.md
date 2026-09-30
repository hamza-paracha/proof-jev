# Security policy

Use [GitHub private vulnerability reporting](https://github.com/hamza-paracha/proof-jev/security/advisories/new) for vulnerabilities. Include the affected version, a minimal reproduction, and its impact. Keep credentials and private source out of reports.

Relevant issues include escaping the configured repository or mutation workspace, exposing credentials in evidence, bypassing model budgets, and reporting incomplete execution as successful verification.

Proof-Jev runs configured commands from trusted repositories in disposable copies. Those copies isolate edits but do not provide an operating-system sandbox. Code review sends the authorized diff context to its configured provider. Reports remain local and can contain source and test output. See [execution boundaries](docs/code-verification.md#boundaries) and [review configuration](docs/structured-review.md).

This project is maintained on a best-effort basis. Fixes target the latest main branch and alpha release. Bugs found in a target repository belong to that repository's maintainers.
