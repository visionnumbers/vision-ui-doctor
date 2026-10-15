# Vision UI Doctor

**v0.2.0 experimental — CLI-first website UI auditor, route crawler and read-only backend health checker.**

For **authorized** websites and local development. Supports Windows PowerShell, Linux and macOS with Node.js 22+ and Chrome/Chromium installed. Uses Chrome DevTools Protocol with zero npm runtime dependencies.

## What's implemented

- Same-origin anchor-based internal route discovery (`--discover`), explicit routes and route cap.
- Configurable login form submission using **environment-variable credentials**, sharing Chromium cookies with audit tabs.
- Responsive tests (320, 375, 768, 1280, 1440px), screenshots, HTML and JSON reports.
- A concise `AGENT_REPORT.md` containing findings and agent repair guidance.
- Optional **read-only GET/HEAD** HTTP backend endpoint status and latency checks from a JSON config.
- Page navigation failures reported rather than silently marked clean.
- Compact `agent-findings.json` for token-aware agent workflows.

### Limitations (read before using)

- This does **not** magically inspect every page. Discovery follows normal same-origin `<a href>` links under the target's URL path prefix; SPA states, JavaScript-only navigation, menus, dynamic routes and admin pages require explicit paths or manual browser automation.
- Login submits a form; it **does not prove that authentication succeeded**. Review the report and configure the correct selectors. SSO/MFA/CAPTCHA is not supported. Never ask the agent to bypass it. Some production websites block headless browsers.
- The HTTP endpoint checker is **not authenticated** (browser cookies do not cross into Node fetch), so protected endpoints may correctly return 401/403. Set `expectedStatus` as appropriate. No POST/PUT/DELETE or fuzzing.
- Remote scanning requires `--allow-remote` and explicit authorization. Scan production sites conservatively; consider staging for heavy exploration.
- Backend checks are status/latency only, not code review, business-logic correctness or security testing.
- There is **no automatic source fixing**, MCP server, cross-role session management or full visual diff engine in this release. Coding agents may read the report and edit local source independently.

## Installation

Unzip the repository. From its directory:

```powershell
node .\src\cli.js --help
```

If it's inside a project under `tools/vision-ui-doctor/`, use:

```powershell
node .\tools\vision-ui-doctor\src\cli.js --help
```

## Full authorized site scan

From your project's root directory:

```powershell
node .\tools\vision-ui-doctor\src\cli.js audit --url "https://your-site.example/" --allow-remote --discover --max-routes 25 --viewports small,mobile,tablet,laptop,desktop --chromium "C:\Program Files\Google\Chrome\Application\chrome.exe" --out "reports\ui-audit" --no-fail
```

**The exact URL path is determined by where the live app is served**, not by where its source code lives on disk. No folder path is assumed. If the web app is mounted under a subpath, change `--url` accordingly. `--routes` paths are origin-root-relative, for example `--routes "/,/dashboard,/profile"`.

## Authenticated UI audit (ordinary form login only)

Never paste passwords into agent prompts, CLI arguments, source code, endpoint configs or reports. In PowerShell, enter credentials as secure text inputs and set environment variables for the current terminal session:

```powershell
$env:VISION_UI_USERNAME = Read-Host "Test username"
$secret = Read-Host "Test password" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:VISION_UI_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
```

Note: env variables remain readable to processes running as your local user. Use a dedicated low-privilege test account, not production administrator credentials. In the current shell:

```powershell
node .\tools\vision-ui-doctor\src\cli.js audit --url "https://your-site.example/" --allow-remote --discover --max-routes 20 --login-url "/login" --user-selector 'input[name="email"]' --pass-selector 'input[type="password"]' --submit-selector 'button[type="submit"]' --routes "/dashboard,/profile" --out "reports\ui-auth" --no-fail
```

`/login`, `/dashboard`, `/profile` are **examples**, not verified target paths. Inspect your actual application routes and selectors before running. The tool may remain logged out if login is asynchronous, MFA-required, or selectors/credentials fail.

Clear the variables after use:

```powershell
Remove-Item Env:VISION_UI_USERNAME,Env:VISION_UI_PASSWORD -ErrorAction SilentlyContinue
```

## Backend endpoint status checks

Write a JSON config file locally (edit sample `examples/backend-endpoints.json` for your real endpoints). Entries are `{"path":"/api/health", "expectedStatus":200}` or `{"path":"/api/private", "expectedStatus":401}`. HTTP methods limited to GET/HEAD and paths must share origin.

```powershell
node .\tools\vision-ui-doctor\src\cli.js audit --url "https://your-site.example/" --allow-remote --routes "/" --endpoints ".\tools\vision-ui-doctor\examples\backend-endpoints.json" --out "reports\ui-backend" --no-fail
```

Do not use guessed API URLs on production. The sample endpoint config is illustrative and must be edited first. Never put secret tokens in the path or query string.

## Outputs

- `report.json` full structured findings, backend statuses, crawl errors, navigation failures.
- `report.html` visual table summary (UI findings).
- `agent-findings.json` compact UI data for AI context efficiency.
- `AGENT_REPORT.md` prioritized information for Claude Code / Codex / Gemini CLI / Antigravity.
- `screenshot-*.png` (unless `--no-screenshots`).

## Developer note

Run `npm test` (in restricted Linux containers, `VISION_UI_NO_SANDBOX=1 npm test` may be required; never disable sandbox on an untrusted host unnecessarily). The repository ships `.agents/skills/vision-ui-doctor/SKILL.md`, a Claude plugin manifest and a Gemini extension manifest; validate installation against your host's current supported integrations.

CI first runs `node scripts/browser-smoke.js` to verify the browser version,
DevTools access and owned process/profile cleanup. Ubuntu hosted runners restrict
unprivileged user namespaces through AppArmor. The Chrome smoke and test steps
explicitly set `VISION_UI_NO_SANDBOX=1` for repository fixtures on disposable CI
machines. This removes Chromium's sandbox isolation: do not use that setting to
scan untrusted sites or on a shared host with credentials. Normal CLI launches
keep the sandbox enabled. Startup failures report exit/signal and bounded,
sanitized diagnostic categories; raw Chrome stderr is never printed.

MIT license. This is a diagnostic development tool, not a penetration-testing suite or source-code repair guarantee.
