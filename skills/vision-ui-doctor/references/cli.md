# Public CLI reference (load as needed)

Run commands from the target application's directory, using the skill helper by
its absolute path. It forwards argument arrays to the bound public CLI, preserving
the current project directory and real exit codes. Quote paths with spaces.

```powershell
node 'ABSOLUTE_SKILL_DIR/scripts/vud.mjs' --check
node 'ABSOLUTE_SKILL_DIR/scripts/vud.mjs' scan --url http://localhost:5173 --out reports/scan-new
```

`scan` uses existing same-origin/base-path anchor discovery (default cap30) and
small/desktop viewports. Use `--routes /,/about` for explicit routes, `--viewports
small,mobile,tablet,desktop` for additional widths, or `--max-routes 3` for a smaller
initial scope. Undiscovered paths and button-driven states remain unknown.

Use an existing reviewed public SPA configuration with `scan --config public-spa.json`.
The minimal schema is:

```json
{"schemaVersion":1,"url":"http://localhost:5173/","viewports":["small","desktop"],"timeoutMs":3000,"scenarios":[{"id":"menu","route":"/","steps":[{"id":"open","click":"#open-menu","purpose":"toggle","visible":["#menu"]}]}]}
```

Only explicitly reviewed toggle/navigation/tab controls are clicked, with visible,
hidden or URL expectations. No arbitrary click exploration or input submission.
Do not combine `scan --config` with URL/route/runtime overrides. Optional `ux`
regions/alignments, `usability:true`, `experience:true` and bounded `stabilizeMs`
reuse the engine's existing strict schema; consult installed CLI `--help` and the
runtime examples for detailed configuration, rather than guessing unsupported fields.

Outputs: scan-status.json, AGENT_HANDOFF.md (<=16KiB), REPORT.md, and
public-run.json only if the engine completes. Screenshots require `--screenshots`
and stay local. Source candidates require explicit `--project-root .`; `--include
src` narrows lookup. Candidates are lexical and may be UNKNOWN, not proven owners.
Use `sources --report ... --issue ID --project-root .` and `snippet --report ...
--issue ID --project-root . --file src/page.css` for selected bounded evidence.
The standalone sources command may write a source-hash cache under project/reports;
scan's integrated source lookup writes no target cache. No browser result cache.

After a separately authorized fix, use the generated handoff's command or:

```powershell
node 'ABSOLUTE_SKILL_DIR/scripts/vud.mjs' verify --report reports/scan-new/public-run.json --issue REAL_ID --out reports/verify-new
# For a declared SPA baseline, use spa-verify instead of verify.
```

Repeat --issue for up to10 IDs. Fresh verification replays the recorded routes or
SPA states; it does not certify undiscovered scope. Use a fresh output directory
every time. Exit0 means requested checks clean,2findings/incomplete/unknown,64bad
input,1runtime/cleanup failure. Never hide a failure or raise timeouts merely to
get green. Browser integration is Chromium-only and heuristic; layout confidence
does not establish design intent or complete accessibility. A retained profile
is evidence, not permission to delete it or kill unrelated processes.
