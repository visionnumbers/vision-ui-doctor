# Vision UI Doctor v0.2.0-beta.1

First public beta of the integrated public-audit developer workflow. These notes
are prepared locally; the release is not published until explicitly approved.

## Included

- `scan` wraps the existing public route/SPA engine with local REPORT.md,
  scan-status.json and a compact AGENT_HANDOFF.md; coverage remains explicit.
- Contextual UI diagnostics, stable issue IDs, root-cause candidates and bounded
  opt-in source handoff. No automatic target-source patching or uploads.
- Universal Agent Skills installer for Codex, Claude Code, Gemini CLI,
  Antigravity IDE and Cursor; ownership-aware collision handling and removal.
- Agent-guided SCAN -> TRIAGE -> USER APPROVAL -> minimal FIX -> fresh VERIFY.
- Existing package executables and original seven public CLI commands preserved.

## Install

After publication, install `vision-ui-doctor@0.2.0-beta.1` (or the moving `@beta`
channel). See [installation and verified Windows Direct-Node usage](beta-installation.md).
Node22+ and separately installed Chrome/Chromium are required for browser audits.

## Evidence and known issues

Prior local offline tarball/runtime/skill checks passed; focused DX3 tests passed
23/23. User-reported Antigravity fixes resolved three selected IDs for their check,
with a fresh responsive4/4run and seven application test suites passing. Those
results are scoped, not independently repeated or generalized to all hosts.

Historical navigation/CDP timeouts, incomplete SPA states and Windows process/
stream cleanup failures remain. Missing findings in skipped/partial states cannot
prove resolution. npm Windows cmd wrappers can fail in ampersand paths; ps1 scripts
may be policy-blocked. Direct Node is the verified Windows workaround, not a
policy bypass. Linux/macOS packaging and live compatibility with every host remain
unverified. Findings may require intent/visual review; no overall UX/WCAG/security
or stable cross-platform certification is claimed.

## Feedback

Use the GitHub bug/feature templates with sanitized commands, versions, exit
codes, coverage and a minimal disposable fixture. Do not attach private reports,
source trees, browser profiles, credentials, runtime bindings or personal data.
No commits, pushes, deployments or publication are authorized by the audit skill.
