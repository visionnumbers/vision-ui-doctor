---
name: Bug report
about: Report a reproducible public-beta failure or diagnostic problem
title: "[Bug] "
labels: ""
assignees: ""
---

## Expected versus actual behavior

Describe the failure or suspected false positive/negative. An incomplete state
is not a clean state; a probable finding is not proof of a visual defect.

## Minimal reproduction

Provide a small public/disposable fixture or steps we can reproduce. Include the
sanitized command, exit code, version, OS, Node/npm/browser versions and agent
host/version if relevant. On Windows, state whether you used Direct-Node or a shim.

## Coverage and evidence

List configured/completed/failed/skipped states, viewport, stable issue IDs and
the relevant sanitized handoff excerpt or error category. Say whether a fresh
verification was performed. Include only a cropped, redacted screenshot if useful.

## Privacy check

- [ ] No credentials, tokens, cookies, private source, personal data or sensitive URLs.
- [ ] No retained browser profile, runtime.json, ownership manifest or full private report.
- [ ] Reproduction is a public target I own/am authorized to test, or a disposable fixture.

Do not post secrets even in a private-looking issue. Report security-sensitive
details privately to the maintainer before opening a public reproduction.
