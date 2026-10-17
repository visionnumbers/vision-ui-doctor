# Limited beta: local tarball installation

This is an experimental, opt-in public-site workflow, not stable-release or
security acceptance. No registry publication or automatic target-source edits.
The current artifact retains version 0.2.0; identify a candidate by its supplied
SHA-256/checkpoint, not the version alone. A distinct beta version and distribution
approval are still required before registry release.

## Install a supplied artifact without global changes

Use Node.js 22+ and npm. Keep the installed runtime in a durable tool directory;
do not install it into an audited application's source or move it after binding.
Use a fresh prefix. PowerShell example (replace the tarball path):

```powershell
$prefix = 'D:\Tools\vision-ui-doctor-beta'
$tarball = 'D:\Downloads\vision-ui-doctor-0.2.0.tgz'
npm.cmd install --prefix $prefix --global=false --ignore-scripts --offline --no-audit --no-fund --no-package-lock --save=false $tarball
$runtime = Join-Path $prefix 'node_modules/vision-ui-doctor'
$vud = Join-Path $runtime 'src/public-cli.js'
$installer = Join-Path $runtime 'src/cli.js'
node $vud --version
node $vud --help
node $installer install --list
```

No npm runtime dependencies are declared; no Node/Chrome download or install hook
is needed. Chrome/Chromium must be installed separately for later audits. On
macOS/Linux, use `npm` instead of `npm.cmd` and adapt paths; that tarball installation
has not been validated on those platforms in this packaging check.

From the actual application's directory, install the project skill and check it:

```powershell
node $installer install --agent codex --scope project --project-root .
node '.agents/skills/vision-ui-doctor/scripts/vud.mjs' --check
# Start your own public dev server before a real scan:
node $vud scan --url http://localhost:5173 --out reports/scan-new
```

Other host IDs: `claude-code`, `gemini-cli`, `antigravity`, `cursor`. Project roots
and host-specific destinations are in the [agent installation guide](agent-installation.md).
The helper path above applies to shared `.agents` hosts; Claude uses `.claude`.
Do not install user/global skills unless that scope is explicitly desired.
Find the skill in the host's skills/customizations UI; refresh/reopen if necessary.
Filesystem installation alone does not prove activation.

Existing installations are not silently updated. Back up privately, obtain update
approval, then use the guide's ownership-verified uninstall/reinstall procedure.
Locally edited bundles block removal/replacement. Retain the runtime at its bound
absolute path; reinstall/rebind on relocation. Never distribute runtime.json,
ownership manifests, profiles or reports from your local installation.

## Executable boundaries

- `vision-ui-doctor-public` maps to `src/public-cli.js`: use this public workflow
  for scan and the original seven public commands.
- `vision-ui-doctor` maps to `src/cli.js`: use it for install/uninstall. It retains
  legacy audit/login/endpoint options for compatibility; those are not part of
  this public beta approval. Do not use them to bypass the skill's public guard.
- In the tested Windows path containing `&`, npm's generated `.cmd` shim failed
  to resolve the runtime before reaching the CLI. The generated `.ps1` shim was
  blocked by the machine's script execution policy. Quoted `node $vud` and
  `node $installer` commands worked. No shim patch, policy change or bypass was
  applied. Wrapper portability is not accepted; use direct Node for this beta.

## Verified versus unverified

| Environment/host | Evidence boundary |
| --- | --- |
| Windows, Node 24.20.0, npm 11.9.0 | Offline local tarball installation, direct Node executable/version/help, installer, project skill binding/ownership and idempotency checked. No browser run in packaging validation. |
| Node 22/other Node versions, Linux, macOS | Declared minimum is 22; current tarball installation/runtime unverified. Historical Linux engine CI predates this package and is not current acceptance. |
| Antigravity IDE | User-reported live DX3 scan, approved fixes, three original IDs resolved-for-this-check, fresh responsive 4/4 states with zero new findings and seven app test suites passing. Not independently rerun here; host version not recorded. |
| Codex | Project installation/runtime and discovery entry previously observed; live DX3 fix behavior and this packed artifact's host activation not verified. |
| Claude Code, Gemini CLI, Cursor | Adapter/filesystem fixture checks only; live discovery, consent and fix behavior unverified. |
| Remote/cloud agents | Local absolute runtime is not automatically available; unsupported without separately validated provisioning. |

## Beta limitations and safe use

Historical SPA runs included incomplete states (33/36 measured); navigation/CDP
and Windows lifecycle/stream-cleanup failures remain known. The successful 4/4
responsive check does not resolve those historical reliability limitations.
Undiscovered routes and undeclared interactive states remain unknown. Probable
and needs-review findings require corroboration; no complete UX/WCAG certification.

Read scan-status.json and AGENT_HANDOFF.md first. Zero actionable defects means
stop without source edits, not a whole-site pass. Follow SCAN -> TRIAGE -> USER
APPROVAL -> minimal FIX -> fresh VERIFY. Missing findings in skipped/failed/partial
states cannot prove resolution. Report scoped outcomes and new sibling/responsive
findings. Cleanup failures remain fatal; preserve evidence and do not loop or
increase deadlines just to get green. Keep reports local and Git-ignored.

Recommendation: controlled beta with consenting developers using direct Node,
known public targets and explicit fix approval. Not ready for unrestricted
cross-platform executable distribution or a stable/registry release.
