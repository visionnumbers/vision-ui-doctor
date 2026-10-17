# Diagnostic accuracy and bounded usability checks

Use the public SPA workflow with `ux.usability: true`. All observations use the
existing owned CDP browser, with no AI provider, source patcher or authentication.
This is LOCAL_TRUSTED public scanning, not secure confinement or full WCAG/UX certification.

```json
"ux": {
  "regions": [{"selector":"#panel"}],
  "alignments": [],
  "usability": true,
  "stabilizeMs": 4000
}
```

Keep existing reviewed scenarios/selectors. No arbitrary controls are clicked.
The optional observation budget is 250–15000 ms, added explicitly to that state's
existing budget; the shared 60-second run deadline still applies. Without this
option, stabilization stays within the existing state budget. Finite transitions
are observed, never disabled, shortened or patched. Three equal geometry samples
over at least 160 ms and no active scoped geometry/visibility animation are needed.
Endless motion, missed deadlines and missing/ambiguous configured elements remain
incomplete/unknown. A later asynchronous change can still occur after this window.

## Implemented triggers and counterexamples

| Family | Triggering evidence | Valid/intentional counterexample | Assessment |
|---|---|---|---|
| Text clipping | Own scroll dimensions exceed hidden/clip box; no ellipsis/clamp | Explicit ellipsis/clamp; native scrolling | Probable |
| Contrast | Visible painted text, parsed opaque sRGB foreground/background, below size-specific ratio | Passing ratio; disabled UI; complex/transparent/gradient or offscreen paint is unsupported | Confirmed model result, not whole-page compliance |
| Form labels | Enabled control lacks non-empty resolved label/ARIA relationship and native title/image-alt fallback | Associated label, valid ARIA reference or native fallback; disabled control | Confirmed relationship result, not full accessible-name-tree verification |
| Form error | aria-invalid=true with no resolved error description | Valid error description | Needs review; announcements not tested |
| Keyboard semantics | Button-like control not sequentially focusable | Native button; managed roving tab/menu group | Probable; no keyboard activation/traversal proof |
| Hidden tab stop | Rendered, enabled focusable control in a visually collapsed/transparent subtree | Disabled/inert/display:none/visibility:hidden or tabindex=-1 | Probable; actual tab traversal unsupported |
| Crowded targets | Sub-24px target with another target center within 24px | Inline link or sufficiently separated small target | Probable; not complete WCAG target-size evaluation |
| Fixed/sticky conflict | An unrelated fixed/sticky layer receives a control's center hit | Reachable control | Probable; intentional modal layering needs review |
| Layout/scroll | Existing geometry plus nearest-first axis-aware clip/scroll chain | Inner scrollport contains the content before an outer clip | Probable geometry defect; declared interaction failure is confirmed |

Text contrast uses 4.5:1 for ordinary text, 3:1 for large text (24 CSS px, or about
18.67 px bold), without rounding the value before comparison. See
[W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
The crowding heuristic is deliberately narrower than the complete
[W3C target-size criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Visibility uses computed inherited visibility: an explicitly visible child of a
visibility:hidden parent remains eligible. Zero opacity/display:none/collapsed
clipping chains are excluded from visual defects, while hidden keyboard stops
are checked separately. aria-hidden alone does not prove visual hiding.

A generic paired textarea highlight mirror/number gutter can legitimately clip
its presentation. Structural geometry and noninteractive constraints classify
that observation as `intentional-candidate`, **not a proven pass**. Original
CONTENT_CLIPPED IDs and evidence remain in diagnostics. Scroll synchronization
is unsupported. Interactive descendants are never exempted by this classification.
An ordinary scroll ancestor never masks an inner clip or overflow on another axis.

## Reports and bounded coverage

Run files preserve raw counts, unique issue IDs, duplicate observation counts,
intentional diagnostics, full root-candidate membership and per-state coverage.
Packets retain legacy confidence and add `assessment`: confirmed, probable,
needs-review or unsupported. Root causes remain uncertain candidates even when
their underlying measurements are confirmed. Ranking uses impact/confidence and
affected states, with category-diverse representatives before repeated findings.

Defaults remain 10 issues / 16 KiB, 3 lexical source candidates/issue and opt-in
snippets (3 files, 40 lines/file, 8 KiB). No whole-repository reading or browser-result
cache. Source metadata caching remains content-based. Full artifacts stay local;
screenshots require independent opt-in and are never sent to an AI provider.

Limits: 4000 visited DOM nodes, 300 retained usability elements, 40 new issues and
30 new intentional text observations/state. Limit exhaustion is explicit partial
coverage, not a clean result. Unsupported contrast is counted, not passed.
Fresh verification replays all configured states/viewports and will not resolve
a finding from a failed/partial state, missing element or changed detector contract.

Still unsupported: real keyboard traversal/focus appearance, compositor/pixel
contrast, dynamic scroll-trap execution, automatic typography or repeated-component
design-intent analysis, and complete visual/usability understanding. Existing
configured alignment/size expectations and public SPA interactions remain available.

## Disposable demonstration

```powershell
node examples/serve-public-diagnostics.mjs
# Another terminal, same checkout:
node src/public-cli.js spa-audit --config examples/public-diagnostics.json --out reports/diagnostics-before
node src/public-cli.js packet --report reports/diagnostics-before/public-run.json
node src/public-cli.js sources --report reports/diagnostics-before/public-run.json --issue ISSUE_ID --project-root "C:\Projects\my-app"
# After an external authorized fix:
node src/public-cli.js spa-verify --report reports/diagnostics-before/public-run.json --issue ISSUE_ID --out reports/diagnostics-after
```

Use `--chromium PATH` when needed, and a fresh output directory each run. The test
fixture includes both defects and valid counterexamples, including an unchanged
800 ms CSS transition. Automated before/after proof patches only a disposable copy,
never a real audited application. Zero programmed findings is not proof of good UX.
