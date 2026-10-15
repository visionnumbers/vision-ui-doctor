---
name: vision-ui-doctor
description: Audit and repair responsive web UI issues using deterministic Chromium evidence, minimal code edits and targeted verification. Use for overflow, mobile menus, clipped modals, touch targets, labels and layout regressions.
---
# Vision UI Doctor

Run the CLI before spending tokens reasoning about screenshots:

1. In the working repository, start the project's development server yourself using its documented command. Ask before executing unknown installation scripts or affecting production.
2. Run `vision-ui-doctor audit --url http://localhost:5173 --routes /,/dashboard --out reports/ui-audit` (or `node /path/to/vision-ui-doctor/src/cli.js ...`). Start with 2-3 important routes and 2 viewports to minimize time and browser output.
3. Read **only** `reports/ui-audit/agent-findings.json` initially. Inspect `report.html` or screenshots only when a finding requires visual context. Never dump screenshots into model context automatically.
4. Identify the source responsible for each finding by searching the smallest relevant component. Propose a minimal patch, preserving application behavior.
5. Apply changes **only** in a user-authorized source checkout, then rerun exactly the same audit and existing tests. Compare evidence before and after. Do not call a repair successful unless the relevant finding disappears and regression checks pass.
6. If markup is dynamically loaded, requires authentication, or a false positive is suspected, explicitly state what was not verified.

Limits: the current scanner is Chromium-only and heuristic; it does not auto-edit code, inspect contrast, or guarantee accessibility. Route discovery remains anchor-based, and login submission does not prove authentication. Never claim otherwise. Audit remote systems only when authorized (`--allow-remote`).

## v0.2 support
Use `--discover` and `--max-routes 20` for same-origin link discovery; add known SPA/admin routes via `--routes`. Read `AGENT_REPORT.md` first and then relevant JSON findings. For login, configure selectors and use environment credentials from a dedicated test account. The tool cannot bypass MFA and cannot prove successful login. Optional `--endpoints path/to/endpoints.json` checks public endpoint status only. Never claim a fix unless relevant tests pass; no built-in auto-fix.
