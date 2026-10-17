# Vision UI Doctor

Local public website UI/UX audits and an Agent Skills installer for Codex, Claude
Code, Gemini CLI, Antigravity IDE and Cursor. Experimental; browser cleanup and
incomplete coverage remain known limitations.

## Quick start

For a locally supplied beta tarball, use the [beta installation and limitations
guide](guides/beta-installation.md). Windows users should use the quoted direct
Node commands below; generated npm wrappers have environment-specific limitations.

Keep a maintained checkout with Node.js 22+ and Chrome/Chromium. Start your app,
then invoke the public CLI from your application directory:

```powershell
$vud = 'D:\Tools\vision-ui-doctor\src\public-cli.js'
node $vud scan --url http://localhost:5173 --out reports/scan
```

The agent reads `scan-status.json` and compact `AGENT_HANDOFF.md` first, then
explains the important evidence. Reports/images stay local. Additional routes and
SPA states need explicit scope; a clean result does not certify the whole site.

## Install the agent skill

From your application directory, run the source executable (interactive):

```powershell
$installer = 'D:\Tools\vision-ui-doctor\src\cli.js'
node $installer install
```

If this local package is already installed/linked on PATH, use
`vision-ui-doctor install`. No registry download or global install is required or
performed. The skill binds this existing scanner; it does not install Node/Chrome.

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
[Detailed CLI/diagnostic guide (preserved DX1 documentation)](guides/usage.md) ·
[Canonical skill](skills/vision-ui-doctor/SKILL.md) · [License](LICENSE)

No authentication/gateway support in the skill. No npm publication or stable-
release acceptance is implied. Filesystem installer tests do not prove live
compatibility with every agent runtime.
