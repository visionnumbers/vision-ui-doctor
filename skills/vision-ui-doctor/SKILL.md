---
name: vision-ui-doctor
description: Audit public website UI and UX with Vision UI Doctor, explain prioritized evidence, and help with explicitly authorized targeted fixes and fresh verification. Use for responsive layouts, public SPA controls, typography, content space, clipping, labels and visual interaction problems.
license: MIT
---

# Vision UI Doctor

Use the existing local scanner; do not substitute a screenshot-only opinion or invent coverage.

- Resolve this skill's own directory from the host's skill context. Run `node "<skill-dir>/scripts/vud.mjs" --check` first. Installation binds an existing scanner runtime; it does not install Node or Chrome. If unavailable, report the actionable error instead of installing software automatically.
- In the target project, use its documented public dev server. Run the helper with `scan --url http://localhost:5173 --out reports/scan-NEW`. Read [CLI reference](references/cli.md) only for routes, declared SPA states, optional diagnostics/screenshots or verification details.
- Read `scan-status.json` and compact `AGENT_HANDOFF.md` first. Explain the important measured problems and uncertainty to the user; do not require them to read lengthy reports. Open selected local evidence only when necessary.
- Confirmed means a detector model/relationship result, not overall design correctness. Probable needs reproduction; needs-review requires intent/visual judgment; unsupported is not a pass. Check incomplete coverage and fatal browser/cleanup failures before judging results. Undiscovered routes and unconfigured interactions remain unknown.
- Root groups and source candidates are unproven hints. Use selected IDs and bounded source lookup, with explicit project-root consent, then read only the relevant component/snippet. Never send whole source trees or screenshots to an external service.
- Recommend the smallest evidence-supported correction. Modify target source ONLY when the user explicitly authorizes that modification; an audit or skill installation alone is not permission to patch.
- After an authorized patch, run fresh `verify` or `spa-verify` against the baseline IDs and relevant project tests. Report persistent, scoped-resolved or unknown outcomes honestly. Missing elements, failed/partial states or detector drift do not prove a fix. Respect any requested test budget; stop on uncertain failures instead of looping.
- This skill operates on trusted PUBLIC development sites only. No credentials, protected flows, authentication/gateway work, automated commits, pushes, deployment or publication. Remote audits need explicit authorization and renewed `--allow-remote` for verification. Local scanning is not network isolation.
