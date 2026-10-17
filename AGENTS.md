# Standard development workspace

Use this permanent `develop/ui-doctor` worktree for ongoing public-audit work.
Read `DEVELOPMENT.md` and local ignored `Docs/Rules.md`, `Docs/Tasks.md`,
`Docs/Memory.md` before changes. Do not create a worktree for each feature.

Preserve the original dirty authentication checkout and existing review
worktrees, evidence and retained profiles. Do not reset, delete or overwrite
them. Authentication/gateway experiments are outside the public workflow.
The public CLI is `src/public-cli.js`; use its absolute path from audited
projects as documented. The legacy skill/CLI may mention login; that does
not authorize credentials or bypass the public-only guard.

Read compact agent packets first. Retrieve only selected source candidates
and bounded snippets with explicit project-root consent. Never edit an audited
application without separate authorization; fixes require fresh browser checks.
Do not report failed/skipped states as resolved or claim network isolation.

Keep Docs, reports, secrets, profiles and experiments out of Git. Commit, push,
PR and merge operations require explicit user authorization. Do not suppress
cleanup failures or delete historical evidence to make tests pass.
