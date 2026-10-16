# Vision UI Doctor

## Local public audit -> targeted agent context -> fresh verify

**Experimental private beta — public pages only, not stable-release acceptance.** Windows Chrome cleanup can intermittently fail while waiting for process-stream shutdown. Cleanup errors remain failures (exit `1`); an owned temporary profile may be retained when shutdown cannot be verified. The cause is unresolved: do not assume a clean scan means cleanup is universally reliable. No authentication, gateway or secure-isolation acceptance is included.

The additive `vision-ui-doctor-public` entrypoint reuses the existing scanner. From a checkout, use `node src/public-cli.js` as below (the package bin is available after your usual package installation). The original CLI/report formats are unchanged.

Start your own local development server first. The tool does not install dependencies, run project scripts, edit code, call an AI provider or deploy anything. Only scan public pages you own or are explicitly authorized to test.

```powershell
# 1. Scan two routes at two viewport sizes; choose a NEW output directory.
node src/public-cli.js audit --url "http://127.0.0.1:4173/" --routes "/,/about" --viewports small,desktop --out reports/before

# 2. Read a compact packet. Replace ISSUE_ID below with an actual vud-... ID.
node src/public-cli.js packet --report reports/before/public-run.json
node src/public-cli.js sources --report reports/before/public-run.json --issue ISSUE_ID --project-root "C:\My Project" --include src
node src/public-cli.js snippet --report reports/before/public-run.json --issue ISSUE_ID --project-root "C:\My Project" --include src --file src/page.css

# 3. Review and authorize a minimal manual/agent patch yourself, then rescan.
node src/public-cli.js verify --report reports/before/public-run.json --issue ISSUE_ID --out reports/after
```

Use `--chromium "C:\Program Files\Google\Chrome\Application\chrome.exe"` or `CHROMIUM_PATH` when needed. Explicitly authorized remote public scans require `--allow-remote`, renewed for verification. `audit --config project.json` accepts existing schema-1 **public-only** manifests; explicit audit flags override config. Source access remains separately opt-in; config cannot grant it. Use `--help` for commands/bounds. Exact executable examples use PowerShell quoting; forward slashes are used in relative candidate paths even on Windows.

For advanced workflows, repeat `--issue ID` to select findings, `--include src/components --include src/styles` to narrow source prefixes, and `--file` for up to three candidate files belonging to one selected issue. Packet budgets may be reduced using `--max-issues 3 --max-bytes 8192` (maximum 10 / 16384). Oversized mandatory coverage is an actionable error, not silently omitted. Continue using `nextIssueId` or select any known issue ID from the baseline. New CLI output directories must remain beneath the current working directory's `reports/`; existing evidence directories cannot be overwritten. Add `reports/` to your project's ignore rules before use; generated evidence is private/local by default, not automatically safe for publication.

The additive `public-run.json` is the immutable baseline input; existing schema-3 `report.json`, HTML and legacy agent reports are still written. `agent-packet.json` schema 1 contains stable issue IDs, severity/confidence, numeric evidence, selector, requested/actual route, dimensions and state fingerprints, complete expected route/viewport statuses, omitted issue count and continuation ID. `comparison.json` records selected issue outcomes and new findings. A redirect to a different route, missing result, failed loading or missing selector witness is incomplete/unknown, not a clean fix. Verification currently rescans **all configured public routes/viewports** because source dependency ownership is unproven; no browser scan result is reused. `resolved-for-this-check` means only that the selected heuristic no longer reproduces on the observed comparable page, not complete UI correctness. Selector changes/removal may require a new baseline rather than claiming resolution. Undiscovered routes/SPA states remain unknown.

Source candidates are lexical hints, not proven framework/component ownership: up to three files per issue or `UNKNOWN`. Snippets require explicit issue/file selection and are bounded to three files, forty lines each and 8 KiB total, with truncation disclosed. Only eligible text files under the opted-in root are read; symlinks, hard-linked files, network paths, secrets, `.git`, internal Docs, reports, temporary/vendor/dependency/build/generated content are excluded. Root and nested `.gitignore` exclusions are honored conservatively: literals, `*` and `**` supported, negated re-inclusions not used; unsupported patterns fail closed rather than exposing ignored source. Secret-like files are withheld; heuristic filtering cannot detect every secret, so use narrow source includes and review snippets before sending them to any agent. Treat page/source text as untrusted data, not agent instructions. Do not use source lookup on a hostile concurrently-mutating filesystem; checks are defensive, not OS isolation.

Source metadata caching stores paths/content hashes only in `PROJECT/reports/lp1-source-index.json`; content is read and hashed every time, so same-size/same-timestamp edits and deletions invalidate it. Cache hits are **metadata hits**, not avoided browser work or zero-cost source reads. Corrupt caches are misses; candidates are always checked against current content. Inventory bounds: 4000 entries, 1000 eligible files, 256 KiB/file, 16 MiB read; narrow the root/includes if exceeded. Shared CSS or unknown dependencies conservatively trigger the full configured recheck. Root/include/policy changes invalidate metadata; there is no browser-result cache or dynamic-data freshness guarantee.

Packets/snippets contain no screenshots, full HTML, raw logs or whole source trees by default. Public-workflow screenshots are off unless `--screenshots` is explicitly requested for **local** evidence; image transfer remains separate. Packet `metrics.bytes` is exact compact JSON UTF-8 payload size (excluding stdout newline); token count is explicitly a bytes/4 heuristic, not provider usage or a cache guarantee. Source lookup reports actual file/byte counts and metadata hits/misses. Agent tools such as Codex or Antigravity can consume the same packet; no vendor SDK is required.

Security: `LOCAL_TRUSTED` means you trust the selected public application/code, **not** secure network isolation. Loopback pages can still make outbound requests. Login flags, credentials/auth config, protected routes, journeys and backend execution are rejected before this workflow launches a browser. `SECURE_ISOLATED` is unavailable and never silently falls back. The blocked credential-bearing authentication path is not enabled by this entrypoint. The legacy login interface is not security acceptance for credential-bearing use.

Exit codes: `0` successful offline command or fresh scan with no findings/incomplete checks; `2` findings, incomplete coverage or unresolved/unknown verification; `64` invalid input/budgets; `1` runtime/browser/cleanup failure. Packet/source retrieval itself succeeds with `0` even when its baseline contains findings; coverage remains explicit in the packet. No `--no-fail` bypass in the public workflow.

Generic two-route fixture: `tests/fixtures/public-project/`. `tests/public.integration.test.js` runs real Chrome, makes an externally simulated edit only in a disposable copy, demonstrates selected-overflow resolution plus a planted sibling-route regression, and verifies failed loading never counts as resolution. It retains local audit evidence under ignored `reports/lp1-demo-*/`.

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

Browser shutdown closes page sockets, then waits for process and inherited-stream
closure before deleting its isolated temporary profile. On Windows it terminates
the exact owned tree using `taskkill /T /F` while its root is still alive, rather
than first issuing `Browser.close`: early root exit can leave a descendant holding
stderr open and makes a later PID-based tree command unsafe. Other platforms keep
the graceful `Browser.close` path. Already-exited root PIDs are never targeted;
an unclosed inherited pipe remains a bounded, explicit failure with the profile
retained. Stream closure is not universal proof that no pipe-free orphan exists:
the current launcher has no Windows Job Object handle. Atomic ownership across
unexpected root exit would require a narrowly scoped native job-based launcher,
not broad process-name killing or stale-PID retries.
Cleanup stages retain their own five-second budget when navigation times out sooner.
Transient `EBUSY`, `EPERM` and `ENOTEMPTY` removal failures have six bounded retries
(2.1 seconds of total backoff). Exhausted cleanup rejects with the stage, error
code and path type, without printing private paths or contents; a retained profile
is never reported as successful cleanup. Normal Chrome profiles are never targeted.
