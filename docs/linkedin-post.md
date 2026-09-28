# LinkedIn draft

I've been building Proof-Jev because I keep wanting a better answer than “done, tests pass” when a coding agent finishes something.

It’s a plugin that uses Jev to review a change, then gives the agent tools to dig into it: try the app in a browser, check what actually got saved, and deliberately break small parts of the code to see whether the tests notice.

That last part is my favourite. A test can pass without checking the thing you care about.

I put together a small order app to show it. The tests were green, but it still saved an order with a quantity of -1. The original tests missed all three changes we tried. After adding checks for invalid inputs and boundaries, they caught the same three.

You can run that example yourself with `npm run showcase`. It uses a recorded Jev review so you don’t need an API key; the browser and test runs happen on your machine. The bug is planted and the repair is scripted, so this is a demo of the checks, not a claim that it fixes everything automatically.

Still early, but it’s working, open source, and something I want to use on my own projects.

https://github.com/hamza-paracha/proof-jev

---

Posting note: use a screenshot of the actual report. The showcase and plugin updates are in PR #4 until merged; link that branch if posting before merge.
