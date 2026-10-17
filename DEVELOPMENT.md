# Unified local development workspace

This permanent worktree is the standard Vision UI Doctor development checkout.
Branch: `develop/ui-doctor`. Existing temporary review worktrees are preserved;
do not create a new worktree for each feature or use the dirty authentication WIP.

Public CLI: `D:\PARTHA\AGENT SKILL & PLUGIN\vision-ui-doctor-dev\src\public-cli.js`.

## Invoke from any application checkout

Use Node.js 22 or newer and an installed Chromium/Chrome. Open your application
directory in PowerShell and start its own disposable/public development server.
Do not copy this tool into the application or install it globally.

```powershell
$vud = 'D:\PARTHA\AGENT SKILL & PLUGIN\vision-ui-doctor-dev\src\public-cli.js'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node $vud --help
node $vud audit --url http://127.0.0.1:4173 --routes /,/about --viewports small,desktop --chromium $chrome --out reports/before
node $vud packet --report reports/before/public-run.json
node $vud sources --report reports/before/public-run.json --issue ISSUE_ID --project-root .
node $vud snippet --report reports/before/public-run.json --issue ISSUE_ID --project-root . --file src/page.css
# After a separately authorized external patch:
node $vud verify --report reports/before/public-run.json --issue ISSUE_ID --chromium $chrome --out reports/after
node $vud spa-audit --config ui-audit.json --chromium $chrome --screenshots --out reports/spa-before
node $vud spa-verify --report reports/spa-before/public-run.json --issue ISSUE_ID --chromium $chrome --out reports/spa-after
```

Replace ISSUE_ID with an actual packet finding ID. Select the appropriate static
or SPA workflow; each scan output directory must be fresh. Relative config,
report, output and project-root paths resolve from the **calling application
directory**, not the tool checkout. Reports stay beneath that directory's
`reports/`; source metadata caching also uses PROJECT/reports. Exclude that
directory from your application's Git tracking. Source lookup is explicitly
opt-in, lexical and bounded; UNKNOWN is valid. No browser result cache is used.

Copy and adapt only a public example JSON configuration if useful:
`examples/public-spa.json`, `examples/public-ux.json`, or
`examples/public-diagnostics.json`. Controls must be explicitly declared safe;
there is no arbitrary click exploration. Remote audits require explicit consent
again during verification. Local trusted scanning is NOT network isolation.
Authentication, protected routes and executable M2 journeys are rejected by
this public entrypoint. Do not use the legacy CLI's login options.

Exit codes: 0 successful/no findings; 2 findings, incomplete coverage or unknown
verification; 64 invalid input; 1 runtime/cleanup failure. Inspect the exit code
and coverage, not just whether report files exist. Cleanup errors remain fatal.
No automatic source edits, AI API calls, npm publication or MCP integration.

## Integration provenance and maintenance

The branch starts at LP1 commit `38c32788771655209bd91c7f3d30d0fcd584c840`
(parent accepted M2.1 `3620b1b2d3268a6478e2bbed91e50ab42f895c7e`).
Uncommitted cumulative SPA, UX and Diagnostic Accuracy layers were reviewed
and applied in that order, including their tests, fixtures and examples.
All 84 public files matched the final accuracy worktree after EOL normalization
before adding this integration documentation. No authentication WIP was copied.
Package bins and stable foundation files remain unchanged from LP1.

Continue future work here, subject to the user's authorization. Local ignored
`Docs/` contains the copied development context; historic evidence, reports and
retained Chrome profiles remain in their original locations. Old worktrees are
archives, not the default place to start a feature. No integration commit or
publication is implied. The known intermittent Windows stream-cleanup failure
remains a beta limitation even when a focused demonstration passes.

### Exact integrated change inventory against LP1 HEAD

The four modified tracked files are:

```text
README.md
src/detectors/layout.js
src/public-cli.js
src/public-files.js
```

The 29 added, currently untracked public files are:

```text
AGENTS.md
DEVELOPMENT.md
examples/diagnostic-checks.md
examples/public-diagnostics.json
examples/public-spa.json
examples/public-ux.json
examples/serve-public-diagnostics.mjs
examples/serve-public-spa.mjs
examples/serve-public-ux.mjs
src/detectors/usability.js
src/detectors/ux.js
src/detectors/visibility.js
src/spa-workflow.js
src/state-stability.js
tests/diagnostic-accuracy.integration.test.js
tests/diagnostic-accuracy.test.js
tests/fixtures/diagnostic-project/app.js
tests/fixtures/diagnostic-project/index.html
tests/fixtures/diagnostic-project/style.css
tests/fixtures/spa-project/app.js
tests/fixtures/spa-project/index.html
tests/fixtures/spa-project/style.css
tests/fixtures/ux-project/app.js
tests/fixtures/ux-project/index.html
tests/fixtures/ux-project/style.css
tests/spa.integration.test.js
tests/spa.test.js
tests/ux.integration.test.js
tests/ux.test.js
```

LP1's existing 13-file commit is already in branch ancestry, including the
package-bin change, source workflow and original fixtures/tests; it was not
recreated as uncommitted files. No package or foundation edits were needed.
Ignored local Docs and generated validation reports are not public changes.
