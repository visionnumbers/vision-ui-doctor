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
- Follow SCAN -> TRIAGE -> USER APPROVAL -> FIX -> VERIFY. Read the [fix-and-verify procedure](references/cli.md), section "Agent-guided fix and verify", before proposing edits. If there are no actionable defects, stop without application changes; report measured coverage and incomplete states, not a full-site pass. A navigation/CDP timeout is not a CSS defect.
- Propose selected stable issue IDs, supporting evidence, smallest relevant files and verification scope. Modify target source ONLY after explicit user authorization covering those fixes; an audit, installation or request to explain findings alone is not approval. Preserve behavior/accessibility and existing user changes; no whole-component rewrites or unrelated cleanup.
- After an approved patch, use fresh `verify` or `spa-verify` and affected sibling-state/responsive checks. Compare stable IDs and report resolved-for-this-check, persisting, newly observed and unverified separately. Missing elements, skipped/partial states or detector drift do not prove a fix. Respect the agreed test budget; stop on uncertain failures instead of looping.
- This skill operates on trusted PUBLIC development sites only. No credentials, protected flows, authentication/gateway work, automated commits, pushes, deployment or publication. Remote audits need explicit authorization and renewed `--allow-remote` for verification. Local scanning is not network isolation.
