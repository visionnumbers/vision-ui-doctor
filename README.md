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

## Project configuration and offline planning (M2.1)

Project files are local JSON with `schemaVersion: 1`. There is no remote config
loading, JavaScript, shell expansion, environment interpolation or inline login
credential support. Unknown fields and explicit `null` values are rejected.

```powershell
node .\src\cli.js validate --config ".\examples\project.config.json"
node .\src\cli.js plan --config ".\examples\journeys.config.json"
node .\src\cli.js audit --config ".\examples\project.config.json" --viewports mobile --out "reports\config-audit"
```

The examples use illustrative localhost URLs; start your authorized test app and
edit the base URL/routes first. `validate` and `plan` do not start Chrome, contact
the site, read credential variables or write reports. `plan` prints deterministic
JSON to stdout; redirect it locally if needed. A plan describes **planned**, not
attempted or audited, states. Protected declarations and all journey actions are
**schema-only**: M2.1 does not log in, click or execute journeys. Config-based
`audit` fails before any work when the file contains protected routes or journeys,
or when combined with discovery, login or backend options. It does not silently
skip unsupported work. CLI-only audits retain their existing behavior.

Actual version 1 schema (all objects reject extra fields):

| Field | Contract / default |
|---|---|
| `schemaVersion` | Required integer `1` |
| `baseUrl` | Required absolute HTTP(S) application base; `/app` becomes `/app/`; no credentials, query, fragment, backslash or dot segments |
| `routes` | Required nonempty array of `{id, url, access}`; access is `public` or `protected` |
| `journeys` | Optional array of `{id, routeId, steps}`, default `[]`; routeId must exist |
| `steps` | Nonempty array of `{id, action, url?, selector?, timeoutMs?}`; see action rules below |
| `viewports` | Unique names from `small,mobile,tablet,laptop,desktop`; defaults to all five |
| `limits` | Optional object; defaults/hard caps below |
| `waitMs` | Integer 0–10000, default 550 |
| `concurrency` | Integer 1–8, default 1 |
| `screenshots` | Boolean, default true |
| `out` | Nonempty local output directory string, default `reports/ui-audit`; no interpolation |

IDs are explicit stable lowercase slugs starting with a letter, at most 48
characters, using only letters, digits and `-`. Route/journey IDs are unique in
their respective collections; step IDs are unique within a journey. Use opaque,
non-sensitive IDs, not account names or secret values. Canonically equivalent
route URLs are rejected even with different IDs. Reordering entries does not
change their state IDs, but it does change execution-plan order.

`navigate` and `assertUrl` require `url` and forbid `selector`. `click`,
`assertVisible`, `assertHidden` and `waitForVisible` require `selector` and forbid
`url`. An optional step timeout is 250 ms through the configured project timeout.
Selectors are limited to 512 characters and a deliberately conservative CSS
subset: tags, `#id`, `.class`, `[attribute]`, `[attribute=value]` (quoted or simple
unquoted values), descendant and `> + ~` combinators. Pseudo-classes, comma lists,
escapes, comments and browser-specific extensions are unsupported. Validation
does not prove an element exists or that an action is safe to execute later.

| Limit | Default | Hard maximum |
|---|---:|---:|
| `maxRoutes` | 30 | 100 |
| `maxJourneys` | 20 | 20 |
| `maxSteps` (per journey) | 50 | 50 |
| `maxPlannedStates` | 500 | 1000 |
| `timeoutMs` | 10000 | 60000 |

Count limits are positive integers; timeout minimum is 250 ms. Planned states
count `(routes + all journey steps) × viewports`, including assertions. Files
must be regular local JSON files no larger than 1 MiB. Symlinks, pipes and
directories are rejected, with non-blocking/no-follow open flags where supported.
URL/UNC config sources and output destinations are rejected; quote Windows paths
containing spaces. Review local output destinations before auditing an untrusted config.

Precedence is **explicit CLI option > validated config > default**. The original
file must be valid even if overridden. `--url` replaces baseUrl and revalidates all
routes/steps against that scope. `--routes` and `--viewports` replace, not append,
their arrays. CLI route overrides receive deterministic canonical-URL-derived
IDs; journey references must still resolve. Supported scalar overrides are
`--max-routes`, `--timeout-ms`, `--wait-ms`, `--concurrency`, `--out` and
`--screenshots` / `--no-screenshots` (mutually exclusive). Config-file relative URLs resolve against baseUrl, not the
file's directory; output directories remain relative to the current working
directory. CLI comma-separated route syntax is unchanged; use JSON route entries
when query values contain literal commas.

Remote planning/validation is offline. Remote **execution** still requires an
explicit `--allow-remote`; config cannot grant it. Neither `allowRemote` nor
login/profile/endpoint fields are accepted in version 1. `--no-fail` keeps its
legacy findings-only semantics and never suppresses invalid config/runtime errors.

Routes and navigation/assertion URLs must be same-origin and within the application
base path. Meaningful queries, repeated values and SPA `#/` / `#!/` routes are
preserved using the existing normalizer; ordinary section anchors and tracking
keys are discarded. Ambiguous encoded path separators/dots are rejected. URLs
in query **values** remain data, not navigation targets. Known sensitive query
keys (including token, password, session and signed URL keys) with values are
rejected in config rather than stored. Do not put secrets under arbitrary keys,
in paths, identifiers or selectors: no tool can recognize every secret.

Plan schema version 1 contains `configSchemaVersion`, `status: "planned"`,
`target`, `requiresRemoteConsent`, `limits`, `options` (concurrency, waitMs,
screenshots), `viewports`, sanitized `routes`,
journey action metadata and `states`. State IDs are `route:<id>:<viewport>` or
`journey:<journeyId>:<stepId>:<viewport>`. Plans omit selectors, local output paths,
credentials and timestamps, and are not executable input. URLs use M1 redaction.
Errors identify fixed schema locations/rules without echoing JSON values or
unknown keys. Configured audit runtime errors expose only a safe failure category
and guidance, not raw filesystem/browser exception text. Exit codes remain 0 success/validate/plan, 1 runtime failure,
2 detected findings/page/backend failures, 64 invalid arguments/configuration.

### Audit output files

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

Browser shutdown closes page sockets, requests Chromium's `Browser.close`, and
waits for process and inherited-stream closure before deleting its isolated
temporary profile. Windows force termination is scoped to the owned process tree.
Cleanup stages retain their own five-second budget when navigation times out sooner.
Transient `EBUSY`, `EPERM` and `ENOTEMPTY` removal failures have six bounded retries
(2.1 seconds of total backoff). Exhausted cleanup rejects with the stage, error
code and path type, without printing private paths or contents; a retained profile
is never reported as successful cleanup. Normal Chrome profiles are never targeted.
