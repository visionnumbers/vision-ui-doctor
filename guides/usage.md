# Vision UI Doctor

## Quick local developer scan

Start your app, then run from this checkout:

```powershell
node src/public-cli.js scan --url http://localhost:5173 --out reports/scan
```

From another project, invoke this checkout's `src/public-cli.js` by absolute path.
`scan` follows existing same-origin/base-path anchor discovery (default cap 30)
and the public workflow's `small,desktop` viewport defaults. Use `--routes /,/about`
for an explicit scope without automatic discovery; `--discover` explicitly combines
discovery with those routes. Button-driven states are unknown unless you supply
an existing public SPA configuration via `scan --config public-spa.json`.
SPA configuration cannot be combined with URL/route/runtime overrides.

The new local outputs are `REPORT.md`, `AGENT_HANDOFF.md` (at most 16 KiB), and
`scan-status.json`, plus a compatible `public-run.json` when the engine completes.
The Markdown report lists all planned route/state/viewport results, actual
validated document URLs, conservative assessment counts, top uncertain root
groups, fixes to inspect, local screenshot links and incomplete coverage. Status
JSON retains full root-group membership. The agent handoff selects up to ten
stable issues and five root groups, with measured numeric evidence, uncertainty,
source status and PowerShell verification commands. Omitted findings are explicit;
the full run remains local. An anchor crawl never establishes full-site coverage.

`--screenshots` opts into local images. `--project-root "C:\Projects\my-app"`
explicitly opts into bounded lexical candidates for selected issues; optional
`--include src` narrows lookup. Source lookup writes no cache into the target.
Without source consent the handoff says `NOT_REQUESTED`. No application files are
edited, no source/screenshots uploaded, and no Git operations are performed.

Use a fresh output directory. Exit codes stay 0 (configured checks clean),
2 (findings/incomplete discovered or configured coverage), 64 (invalid input),
1 (runtime/cleanup/artifact failure). Discovery errors do not become clean
coverage; failed discovery/browser/cleanup writes sanitized failure Markdown and
status where the output remains writable, without inventing a completed run.
Reports cap human Markdown at 512 KiB and the handoff at 16 KiB. Original `audit`,
`spa-audit`, `packet`, `sources`, `snippet`, `verify`, `spa-verify` remain available
with unchanged output contracts. `scan` does not replace their packet formats.

## Contextual UI diagnostics (opt-in)

`ux.experience: true` adds bounded prose-fragmentation, usable-content-space,
toolbar-wrapping, text/badge-collision and mobile-header-impact candidates to the
public SPA workflow. These are measured **probable/needs-review** symptoms, not
confirmed design defects. Existing findings and CLI commands are preserved.
See [triggers, exclusions, confidence and sampling limits](../examples/experience-checks.md).
Packets retain the existing size bounds, source handoff and uncertain root groups.
Known Windows cleanup failures remain a separate beta limitation.

## Diagnostic accuracy + usability batch

The public SPA engine now has optional bounded text clipping/contrast, form-label/
error, keyboard-semantic, hidden-tab-stop, crowded-target and fixed/sticky-control
checks. Existing visibility/scroll analysis is axis-aware; animation observation
precedes geometry detection. Intentional editor presentation retains original IDs
as reviewable diagnostics rather than masquerading as a confirmed defect or pass.

Set `ux.usability: true` in your reviewed public SPA config. Optional
`ux.stabilizeMs` (250–15000 ms within the shared run deadline) observes legitimate
transitions without changing application CSS. See [triggers, counterexamples,
confidence definitions and explicit unsupported checks](../examples/diagnostic-checks.md).

```powershell
node examples/serve-public-diagnostics.mjs
# In another terminal from this checkout:
node src/public-cli.js spa-audit --config examples/public-diagnostics.json --out reports/diagnostics-before
node src/public-cli.js packet --report reports/diagnostics-before/public-run.json
# After your authorized external fix:
node src/public-cli.js spa-verify --report reports/diagnostics-before/public-run.json --issue ISSUE_ID --out reports/diagnostics-after
```

Packets stay bounded/provider-neutral, include both raw/grouped counts and
confirmed/probable/needs-review/unsupported assessments, and retain existing
source candidates, snippets, metadata caching and fresh browser verification.
The core never patches an audited app. This is not full visual/UX understanding,
secure isolation or comprehensive accessibility certification.

## Advanced UI/UX evidence increment (experimental, local public apps)

This increment adds **measured responsive container failures, configured sibling
region overlap, explicit alignment expectations and shared-ancestor root-cause
candidates** to the existing public SPA workflow. It does not measure overall
design quality. A clean run means only that the configured checks found no issue.
No Python Academy or other application source is required or modified.

From this checkout, start the generic disposable fixture in one terminal:

```powershell
node examples/serve-public-ux.mjs
```

From another terminal in the same checkout (optional `--chromium "C:\Program Files\Google\Chrome\Application\chrome.exe"`):

```powershell
node src/public-cli.js spa-audit --config examples/public-ux.json --out reports/ux-before --screenshots
node src/public-cli.js packet --report reports/ux-before/public-run.json
node src/public-cli.js sources --report reports/ux-before/public-run.json --issue ISSUE_ID --project-root "C:\Projects\my-app"
node src/public-cli.js snippet --report reports/ux-before/public-run.json --issue ISSUE_ID --project-root "C:\Projects\my-app" --file src/workspace.css
# After an external, authorized CSS/JS patch:
node src/public-cli.js spa-verify --report reports/ux-before/public-run.json --issue ISSUE_ID --out reports/ux-after --screenshots
```

Repeat `--issue` to verify several selected findings (maximum 10). Choose a fresh
output directory each time. The CLI never patches source or calls an AI provider.
If this checkout is inside `.temp`, source lookup remains excluded there: use
your explicitly opted-in real project root or a disposable copy outside excluded
directories. Browser scans are always fresh; only source-index hash metadata is
cached. Existing source/snippet secret exclusions and byte limits still apply.

Add this optional strict `ux` object to the public SPA schema (full example in
`examples/public-ux.json`):

```json
"ux": {
  "regions": [
    {"selector":"#content","minWidthPx":240},
    {"selector":"#card-a"},
    {"selector":"#card-b"}
  ],
  "alignments": [
    {"id":"toolbar-top","selectors":["#tool-a","#tool-b"],"axis":"top","tolerancePx":4}
  ]
}
```

At most 20 unique regions and 10 alignment expectations (2–8 peers each).
Selectors use the existing single `#id`, `.class`, `[data-testid="name"]` grammar.
Regions must match exactly one element. `minWidthPx` is an **explicit usability
expectation**, 24–2000 CSS px, not a guessed ideal width. Alignment axes are
`left`, `right`, `top`, `bottom`; tolerances are explicit 0–40 px. This also catches
spacing mistakes that move declared peer edges; it is not automatic spacing-token
or typography evaluation. Every configured expectation is applied at each viewport;
split runs/configs when design intent differs at breakpoints.

Configured visible sibling regions are checked for rectangle intersection and an
actual center hit within the shared viewport area. Ancestor/descendant containment
is not reported as sibling overlap. Declare an intentional overlay with a region's
`"allowOverlapWith":["#other-region"]`; declarations must reference known regions.
Overlap findings are **medium-confidence candidates**, not proof of bad intent:
transparent regions, corner shapes or complex compositing still need visual review.
The independent selected-control hit test continues to catch unreachable controls.
Responsive failures use actual flex/grid parent widths; intentionally horizontally
scrollable parents are not treated as broken flex/grid fit. Existing overflow and
clipping detectors are reused, not replaced by another browser or crawler.

Shared paint-visibility checks exclude zero-sized/display:none/inherited-hidden
elements and descendants of zero-opacity/content-visibility:hidden ancestors.
`aria-hidden` alone is not visual hiding. Inert/pointer-events:none controls are
distinguished from paint visibility and remain inaccessible rather than silently
passed. UX geometry is sampled at 60 ms intervals, at most four samples: observed
movement yields an incomplete unstable state, not a confident layout verdict.
This short stability window is not a guarantee that later asynchronous UI changes
or animations cannot occur. Missing/ambiguous UX selectors are partial coverage
and cannot establish selected-issue resolution; intentional hidden checks are
recorded separately. Such partial checks do not stop later declared interactions.

### Reports, groups and local visual evidence

`public-run.json` retains all original issue IDs, per-state geometry, computed
layout context, partial/failed states and full `rootCauseCandidates` membership.
Candidates group by measured clipping/flex/grid ancestor or explicit layout
region; they rank by severity then affected issue count. They are medium-confidence
**candidate-not-proven** explanations, not invented causal certainty. Inspect
the owning CSS before fixing the parent. All child IDs/evidence remain available.

The compact packet defaults to 10 issues / 16 KiB, prioritizing different defect
categories/root regions before repeated occurrences. It includes up to five root
candidates, representative IDs, affected states/viewports, concise numeric evidence,
uncertainty and targeted fix guidance. Omitted issue and affected-state counts are
explicit; full membership remains in the local run. Estimated tokens are only a
bytes/4 heuristic. No raw DOM, page text, full CSS, logs or screenshots are embedded.

`--screenshots` opts into viewport PNGs **locally**, default off and independently
renewed for verification. Files use state identity hashes, with selected-element
viewport rectangles attached to findings where measured (otherwise rect:null).
Each image is capped at 8 MiB, all images at 32 MiB/run. Capture/write failure is
incomplete coverage, never silent success. Fresh comparison links selected before/
after viewport images in their respective run directories. There is **no pixel
diff, automatic crop, AI visual understanding or automatic image transfer**.

### Demonstrated scope versus deferred capabilities

The disposable demo has independent mobile flex sizing, overlapping cards,
toolbar misalignment and a close-panel handler bug. It includes opacity-hidden,
visibility-hidden, display-hidden and intentionally scrollable controls. The
test externally patches a temporary copy's CSS/JS and freshly replays every state;
repository fixture bugs remain intentional. No automatic source modification.
The screenshot-enabled example explicitly uses a 5000 ms state budget: a local
3000 ms run exhausted its budget during UX measurement and remained incomplete.
This does not change engine defaults/limits or the browser cleanup deadline;
slow targets can still produce truthful incomplete coverage.

Implemented: configured public sidebar/navigation/tabs, responsive geometry and
explicit min-width/alignment rules, sibling overlap candidates, visibility-chain
accuracy, bounded stability checks, ancestor grouping, local screenshots and
provider-neutral source/verification handoff. Generic modal toggles can use the
same explicit click/visible/hidden schema; modal focus/accessibility is not proven.

Deferred: keyboard traversal/focus visibility/trapping, automatic repeated-component
spacing/typography hierarchy, composited color contrast, comprehensive touch-target
auditing of SPA states, unexpected shift interpretation, vertical scroll-trap
analysis, breakpoint inference, broad header/overlay semantics, visual balance,
pixel diffs and AI visual review. These require separate validated increments,
not dozens of unverified rules. No claim of complete WCAG or application usability.

Normal Chrome sandbox, public consent, same-origin/base-path checks, authAllowed:false,
no secure-isolation claim, blocked M2.2 authentication and fatal cleanup behavior
are unchanged. The intermittent Windows cleanup beta limitation remains; static
or mock success is not lifecycle/security acceptance. No publication is implied.

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

Run `npm test` (in restricted Linux containers, `VISION_UI_NO_SANDBOX=1 npm test` may be required; never disable sandbox on an untrusted host unnecessarily). Canonical skill source ships in `skills/vision-ui-doctor/`; `.agents/skills/vision-ui-doctor/` is an ignored local installation, not repository source. The repository also ships a Claude plugin manifest and a Gemini extension manifest; validate installation against your host's current supported integrations.

CI first runs `node scripts/browser-smoke.js` to verify the browser version,
DevTools access and owned process/profile cleanup. Ubuntu hosted runners restrict
unprivileged user namespaces through AppArmor. The Chrome smoke and test steps
explicitly set `VISION_UI_NO_SANDBOX=1` for repository fixtures on disposable CI
machines. This removes Chromium's sandbox isolation: do not use that setting to
scan untrusted sites or on a shared host with credentials. Normal CLI launches
keep the sandbox enabled. Startup failures report exit/signal and bounded,
sanitized diagnostic categories; raw Chrome stderr is never printed.

MIT license. This is a diagnostic development tool, not a penetration-testing suite or source-code repair guarantee.

## Explicit public SPA interactions (experimental)

Use this additive workflow for **your own or explicitly authorized public dev app**.
It reuses Chromium/CDP and the existing layout detectors; no second crawler, AI
provider, automatic patches or authentication are involved. Existing commands and
report schema 3 remain unchanged. SPA runs have their own `kind: "public-spa"`
schema 1 envelope, not a fabricated static-page success report.

Start the disposable generic HTML/JS fixture in one terminal:

```powershell
node examples/serve-public-spa.mjs
```

In another terminal, run from the repository root (optional `--chromium PATH`,
including a quoted Windows path). Choose a **new** report directory each run:

```powershell
node src/public-cli.js spa-audit --config examples/public-spa.json --out reports/spa-before
node src/public-cli.js packet --report reports/spa-before/public-run.json
node src/public-cli.js sources --report reports/spa-before/public-run.json --issue ISSUE_ID --project-root "C:\Projects\my-app"
node src/public-cli.js snippet --report reports/spa-before/public-run.json --issue ISSUE_ID --project-root "C:\Projects\my-app" --file src/sidebar.css
# Apply your own authorized patch, then replay the actual browser states:
node src/public-cli.js spa-verify --report reports/spa-before/public-run.json --issue ISSUE_ID --out reports/spa-after
```

The fixture intentionally covers the mobile Close button and makes the Dashboard
panel too wide. Its `sidebar` scenario opens/closes; `navigation` moves between
`#/home` and `#/dashboard`; `tabs` selects Details and Summary. To try a manual fix,
remove the mobile `#broken-cover` display rule and change the mobile `#wide-panel`
width to `100%`, then run `spa-verify`. The automated demo patches a disposable
copy only, not repository fixtures. For source lookup, choose your real project
root: hard-excluded directories such as `.temp` remain excluded even when they
contain a worktree. Source candidates are lexical hints, not proven ownership.

Minimal configuration (separate from M2.1's **planned-only** journey schema):

```json
{
  "schemaVersion": 1,
  "url": "http://127.0.0.1:4173/",
  "viewports": ["small", "desktop"],
  "timeoutMs": 3000,
  "scenarios": [{
    "id": "sidebar",
    "route": "/#/home",
    "steps": [
      {"id":"open","click":"#open-menu","purpose":"toggle","visible":["#sidebar"]},
      {"id":"close","click":"#close-menu","purpose":"toggle","hidden":["#sidebar"]}
    ]
  }]
}
```

Only the shown fields are accepted. A step's `purpose` is `toggle`, `navigation`
or `tab`; optional `url` asserts an exact canonical same-origin/base-path URL.
Every click requires a visible/hidden/URL expectation. Selectors are single IDs,
classes or `[data-testid="name"]`, with exactly one match for a clicked control.
No arbitrary JS, scripts, forms, input fields, credential config, protected routes,
remote configs or generic M2 journeys. Explicit anchors require a matching `url`
declaration. Configuration never grants remote consent: renew `--allow-remote`
on both audit and verification when applicable.

Bounds: 10 scenarios, 12 clicks/scenario, 100 total viewport states including
each initial state, 40 observed selectors/scenario, 8 selectors/expectation list,
250–5000 ms/state and a 60-second run deadline (existing cleanup has its own
budget). Controls must be visible, enabled, fully on-screen and center-hit-test
reachable. Form/download/destructive-looking controls are rejected, not clicked.
These checks are guardrails, **not proof that a custom handler is harmless**:
review your selected app controls. Code can make requests before a post-click
URL check; this is `LOCAL_TRUSTED`, `authAllowed:false`, `networkIsolation: NONE`,
not secure confinement or a way to enable blocked M2.2 authentication.

`public-run.json` contains bounded selector existence/visibility/rectangles before
and after each click, actual canonical URLs/hashes, post-state layout findings,
and explicit failed/skipped states. No DOM text, HTML or console logs are captured.
A failed interaction stops its scenario; independent scenarios/viewports continue.
Ambiguous assertion selectors fail rather than inspecting only the first match.
The reused layout detector visits at most 4000 elements and returns at most 35
layout findings per state; exceeding the DOM visit budget marks that state
incomplete. It is not an exhaustive detector even below those limits.
Failed loading/CDP/assertions cannot become clean coverage. Layout findings alone
do not mean execution failed. Cleanup errors remain fatal, never ignored.

`agent-packet.json` defaults to 10 issues / 16 KiB, preserving coverage, issue IDs,
state/viewport attribution, confidence and numeric evidence. Duplicate geometry
on the same actual route/element is grouped across states/viewports without
discarding individual IDs. `omitted` is explicit; select IDs with `packet --issue`
to retrieve them. Token counts are estimates, not free context or AI calls.
The existing opt-in source lookup, content-hash metadata cache and snippet limits
(3 files, 40 lines/file, 8 KiB) also work for SPA issues. Browser results are never
cached. Do not place secrets in URLs, identifiers, selectors or public application
source; arbitrary secret detection is not guaranteed.

Fresh verification replays **all configured scenarios/viewports** from their start
URLs. Selected results are `persistent`, `resolved-for-this-check` (successful
state plus same-state element witness), or `unknown`; missing/failed states or
removed selectors are never claimed resolved. New issue IDs identify regressions
elsewhere in that configured scope. This is not an exhaustive SPA/WCAG audit:
no arbitrary exploration, login, shadow-root/iframe controls, keyboard/touch
gestures, animation-stability guarantee or design-intent inference. Normal Chrome
sandbox and the known intermittent Windows stream-cleanup beta limitation remain.
Exit codes: 0 clean command/check; 2 findings/incomplete/unresolved; 64 invalid
input; 1 runtime or cleanup failure. No Linux CI claim for unpushed changes.

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
