# Vision UI Doctor

**Find website UI problems. Understand the report. Fix what matters.**

[Public beta v0.2.0-beta.1](https://github.com/visionnumbers/vision-ui-doctor/releases/tag/v0.2.0-beta.1) · [npm](https://www.npmjs.com/package/vision-ui-doctor) · [Report a bug](https://github.com/visionnumbers/vision-ui-doctor/issues/new?template=bug_report.md)

Vision UI Doctor is a **local Node.js tool** that checks public website layouts at different screen sizes and generates readable reports. You can use it yourself or install its **Agent Skill** in Codex, Claude Code, Gemini CLI, Antigravity, or Cursor to help an AI coding agent interpret the findings.

**Simple workflow:** Scan → Read → Approve a fix → Scan again.

> **Public beta:** Expect occasional browser timeouts and incomplete coverage. A clean result does **not** mean every page or interaction is bug-free. The tool does not automatically modify your website.

## 🚀 Start here (Windows PowerShell)

**You need:** Node.js **22 or newer**, Chrome or Chromium installed, and a **local public website** you can open in your browser. You do not need to know Git or clone this repository.

### 1. Install Vision UI Doctor

Open **PowerShell** and paste the following commands, one block at a time:

```powershell
$prefix = 'D:\Tools\vision-ui-doctor-beta'
npm.cmd install --prefix $prefix --global=false --ignore-scripts --no-audit --no-fund --no-package-lock --save=false vision-ui-doctor@0.2.0-beta.1
$vud = Join-Path $prefix 'node_modules/vision-ui-doctor/src/public-cli.js'
$installer = Join-Path $prefix 'node_modules/vision-ui-doctor/src/cli.js'
node $vud --version
```

If you see a version number, the CLI is installed. Keep `$vud` and `$installer` in **this same PowerShell window** for the next steps.

### 2. Start your own website

In a **separate terminal**, start your website as you normally do (for example, `npm run dev`). Open it in Chrome and note its URL, such as:

`http://localhost:5173`

That address is **only an example**. Replace it with your own local website URL.

### 3. Run your first scan

Back in the **first PowerShell window**, paste:

```powershell
node $vud scan --url http://localhost:5173 --out reports/scan
```

Change `http://localhost:5173` if your website uses a different port.

A scan can return findings or a nonzero exit code when some states fail. Read the report rather than assuming failure means the website itself is broken.

### 4. Open your results

Your output folder contains:

| File | What it is for |
| --- | --- |
| `REPORT.md` | **Start here.** Human-readable findings and coverage |
| `AGENT_HANDOFF.md` | Compact evidence for a coding agent |
| `scan-status.json` | Machine-readable scan outcome |
| `public-run.json` | Detailed baseline when the scan completes |

To open the beginner-friendly report in Notepad:

```powershell
notepad reports/scan/REPORT.md
```

**Check incomplete/skipped states** before deciding that a problem has been fixed.

## 🤖 Want your AI coding agent to help?

Vision UI Doctor includes an **Agent Skill**. The skill gives your agent instructions to use the already installed scanner, explain findings, ask before editing, and verify approved fixes.

Open a terminal in **your website's project folder**, then install the skill for the agent you use:

| Your coding agent | Run this command (PowerShell) |
| --- | --- |
| **Codex** | `node $installer install --agent codex --scope project` |
| **Claude Code** | `node $installer install --agent claude-code --scope project` |
| **Gemini CLI** | `node $installer install --agent gemini-cli --scope project` |
| **Antigravity** | `node $installer install --agent antigravity --scope project` |
| **Cursor** | `node $installer install --agent cursor --scope project` |

**Important:** If you opened a new PowerShell window, redefine `$installer` using the command in Step 1. Run installation from your website project folder, or pass `--project-root 'D:\path\to\your-app'`. Installing the skill is separate from installing Node.js, Chrome and the scanner.

Then open a **new agent chat** if necessary and say:

> Use Vision UI Doctor to scan my local website, explain the most important UI issues, and suggest small fixes. Ask for my approval before changing files. Verify any approved changes.

Agent availability and skill discovery vary by host. Installation support does not guarantee every agent version has been tested.

[Detailed agent installation guide](guides/agent-installation.md)

## ✅ What can it check?

- Responsive overflow, clipping, alignment and selected UI geometry
- Configured SPA interactions and screen-size-specific states
- Selected usability and contextual experience patterns (some are probable or review-needed)
- Screenshots/evidence when requested, coverage gaps, and compact AI-agent reports

**Not included:** Automatic full-site exploration, logged-in/authenticated auditing, complete visual-design judgment, or guaranteed WCAG compliance. To scan additional pages or interactions, configure routes/SPA scenarios explicitly.

## 🖼️ Visual overview

A designed overview and quick-start illustration are available as optional repository assets. These are **illustrations, not screenshots of a working GUI or real scan results**. The current product is primarily a CLI.

## 🛠️ Need more options?

For custom routes, configured SPA states, source handoff and fresh verification, use:

- [Full usage guide](guides/usage.md)
- [Beta installation / troubleshooting](guides/beta-installation.md)
- [Release notes](guides/release-notes-v0.2.0-beta.1.md)
- [Canonical Agent Skill](skills/vision-ui-doctor/SKILL.md)

### Windows command note

The direct `node $vud` method above is intentional: npm-generated Windows launchers can fail in paths containing `&`, and PowerShell may restrict `.ps1` scripts. No policy bypass is necessary.

## 💬 Help improve Vision UI Doctor

Found a real bug, false positive, or missing feature?

**[Report a bug](https://github.com/visionnumbers/vision-ui-doctor/issues/new?template=bug_report.md)** · **[Request a feature](https://github.com/visionnumbers/vision-ui-doctor/issues/new?template=feature_request.md)** · **[Join the public-beta feedback thread](https://github.com/visionnumbers/vision-ui-doctor/issues/8)**

Please remove tokens, cookies, private page content and other sensitive information from shared logs and screenshots.

## Known beta limitations

- Occasional browser navigation/CDP or process-cleanup failures; scan coverage may be incomplete.
- Unconfigured SPA states and undiscovered routes are not examined.
- Windows npm command shims may fail with special-character paths; use the documented Direct-Node method.
- Linux/macOS and some agent-host combinations are not yet verified.
- Scanner candidates need human review; the tool does not make changes without user approval.

[MIT License](LICENSE)
