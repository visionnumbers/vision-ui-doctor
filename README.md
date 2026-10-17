# Vision UI Doctor

## Public beta: 0.2.0-beta.1

Local public website UI/UX audits and an Agent Skills installer for Codex, Claude
Code, Gemini CLI, Antigravity IDE and Cursor. Experimental; browser cleanup and
incomplete coverage remain known limitations. Feedback and minimal reproductions
are welcome through GitHub bug reports and feature requests. Not a stable release.

## Quick start

Use Node.js 22+ and an independently installed Chrome/Chromium. After this beta
has been published, install it without a global npm installation (Windows
PowerShell; use a fresh durable prefix):

```powershell
$prefix = 'D:\Tools\vision-ui-doctor-beta'
npm.cmd install --prefix $prefix --global=false --ignore-scripts --no-audit --no-fund --no-package-lock --save=false vision-ui-doctor@0.2.0-beta.1
$runtime = Join-Path $prefix 'node_modules/vision-ui-doctor'
$vud = Join-Path $runtime 'src/public-cli.js'
$installer = Join-Path $runtime 'src/cli.js'
node $vud --version
# Start your public app's dev server, then run from its directory:
node $vud scan --url http://localhost:5173 --out reports/scan
```

The agent reads `scan-status.json` and compact `AGENT_HANDOFF.md` first, then
explains the important evidence. Reports/images stay local. Additional routes and
SPA states need explicit scope; a clean result does not certify the whole site.

## Install the agent skill

From your application directory, using the installed runtime above (interactive):

```powershell
node $installer install
```

If this local package is already installed/linked on PATH, use
`vision-ui-doctor install`. The skill installer itself performs no registry
download or global install. It binds this existing scanner, not Node/Chrome.
Windows Direct-Node invocation is the verified workaround for generated wrapper
limitations. Do not bypass PowerShell execution policy. Source checkout users can
instead define $vud and $installer as absolute src/public-cli.js and src/cli.js paths.

| Agent | Explicit install example (after defining $installer) | Confirm discovery |
| --- | --- | --- |
| Codex | `node $installer install --agent codex --scope project` | `/skills` or `$vision-ui-doctor` |
| Claude Code | `node $installer install --agent claude-code --scope project` | `/vision-ui-doctor` |
| Gemini CLI | `node $installer install --agent gemini-cli --scope user` | `/skills reload`, `/skills list` |
| Antigravity IDE | `node $installer install --agent antigravity --scope user` | Customizations in agent side panel |
| Cursor | `node $installer install --agent cursor --scope project` | Customize > Skills |

Project means the invoking directory (or `--project-root PATH`); user/global means
the OS user home. Multiple selection: `--agent codex,gemini-cli,cursor`.
Inspect with `install --list` or `install --status --scope project`; remove owned
files with `uninstall --agent codex --scope project`. Collisions/modified files are
preserved. Actual host/version discovery must still be confirmed.

Then ask your agent: **“Audit my website UI, explain the important problems and
help fix them.”** The skill invokes the existing public scanner. Application
edits require explicit authorization and fresh verification; nothing is committed,
uploaded or deployed automatically.

[Installer destinations, official sources and safety](guides/agent-installation.md) ·
[Beta installation and platform evidence](guides/beta-installation.md) ·
[Beta release notes](guides/release-notes-v0.2.0-beta.1.md) ·
[Detailed CLI/diagnostic guide (preserved DX1 documentation)](guides/usage.md) ·
[Canonical skill](skills/vision-ui-doctor/SKILL.md) · [License](LICENSE)

## Known issues

- Browser navigation/CDP and Windows lifecycle/stream-cleanup timeouts can fail
  runs. Cleanup failures remain fatal; no retry-until-green promise.
- SPA scans can be incomplete. Skipped/failed states and undiscovered routes are
  unknown, not clean; historical runs measured 33/36 configured states.
- npm-generated Windows .cmd shims can fail in paths containing `&`; .ps1 shims
  may be blocked by execution policy. Use the quoted Direct-Node commands above.
- Current Linux/macOS packaging and live compatibility with every agent host are
  unverified. Antigravity success is user-reported, not universal certification.

No authentication/gateway support in the skill. Probable/needs-review findings
require corroboration. This beta is not complete UX/WCAG or security acceptance.
See the installation guide for precise evidence and safe update boundaries.
