# Contextual public UI diagnostics

Add `"experience": true` to the existing `ux` object in a reviewed public SPA
configuration. Existing `regions`, `alignments`, `usability` and `stabilizeMs`
options remain independent. No new command or dependency is required.

```json
"ux": {
  "regions": [{"selector":"#reader"}],
  "alignments": [],
  "experience": true
}
```

Use the existing `spa-audit`, `packet`, `sources`, `snippet` and `spa-verify`
commands. Browser scans and verification stay fresh. Enabling this pass changes
the detector contract to `ux-experience-3`; a comparison against a different
contract remains unknown. Unrequested checks are not claims of coverage.

| Code | Measured symptom | Assessment and intentional exclusions |
| --- | --- | --- |
| `INLINE_PROSE_FRAGMENTATION` | Flex/grid parent has at least 30 direct prose characters and two direct inline semantic tokens occupying at least 60% of its width, on separate rows | Probable; excludes navigation/managed grids, ordinary block prose, and control groups without direct prose |
| `CONTENT_SPACE_STARVATION` | At width <=768px, an overflowing semantic/configured content surface exposes fewer than three computed text lines and less than 22% of viewport height; scroll-height/client-height >=1.5 | Probable; short summaries, ample scrolling readers and ancestor wrappers containing another measured content surface are excluded |
| `EXCESSIVE_CONTROL_WRAPPING` | Compact direct controls in a wrapping row-flex container occupy at least three rows and 13% of viewport height; alternatively an isolated final action row is narrow relative to a >=65%-filled first row | Probable for excessive wrapping, needs-review for an orphan; excludes navigation, grids, column layouts, card-like controls, and explicitly intentional multirow components |
| `TEXT_BADGE_COLLISION` | Text range intersects a narrow sibling's painted hit area by at least 4x4px in a flex/grid row, after clipping text rectangles to overflow boundaries | Probable; normal clipped ellipsis and aria-hidden/presentation decoration excluded; text ranges are not glyph masks |
| `MOBILE_CHROME_DENSITY` | Width <=768px, top header/banner has >=3 control rows and consumes >=14% of viewport height while the largest measured content surface has <=6 visible lines and <35% of viewport height | Needs-review; a tall header with ample content is not considered this symptom; no prescribed number of header rows |

Semantic content candidates include article/document/textbox/textarea/pre,
explicit configured regions, and overflowing text surfaces with paragraphs or
substantial direct text. Visible height means intersection with the viewport and
overflow ancestor scrollports, divided by computed line height. Nested scrolling
ancestors and the scroll ratio are recorded. It is **not** a proof of readable
glyph count, unobscured area, reader importance or user preference. Fixed overlay
occlusion remains a separate existing usability check. Invisible/offscreen
surfaces are not certified clean by this pass.

Author-declared `data-ui-audit-intent="multirow"` excludes a component from the
toolbar/prose layout heuristics; `data-ui-audit-intent="decorative"` excludes its
subtree from this pass. These exclusions do not disable any pre-existing detector.
Use them only for reviewed intent, not to hide actual defects. Native `nav`,
navigation/tablist/grid roles are treated conservatively without such attributes.

Each new finding carries the existing stable state/viewport ID, affected
component, numeric measurements, assessment, recommendation and flex/grid/block
root context. At most one finding per code/component/state is returned; separate
symptoms such as tiny reader and dense header may coexist. Repeated instances
with the same bounded selector are represented once, not counted as distinct
child defects. Selectors remain lexical source hints, not guaranteed unique
element identities. Existing findings are neither replaced nor suppressed.

Observation is bounded to 4,000 visited elements and 80 candidate observations;
components examine at most 24 immediate children, with collision pairs limited to
16 children, eight text nodes and eight range rectangles per text node. Header
control sampling is capped at 40. At most 20 new findings/state are returned.
DOM/candidate exhaustion or omitted findings marks that state incomplete. This
is a sampled heuristic pass, not comprehensive prose/content/toolbar coverage.
No timeouts are increased. Cleanup errors retain their existing fatal behavior.

Root candidates preserve all returned IDs and uncertainty. Compact packets keep
the existing ten-issue/16KiB cap and category/root diversity, add static per-rule
guidance and measured/omitted experience coverage, and contain no page text,
screenshots or large DOM snapshots. Existing selected-source/snippet handoff
works unchanged. Unknown/failed/partial states cannot establish resolution.

The synthetic regression set contains broken/corrected/legitimate cases for all
five families. A successful finite fixture does not establish universal accuracy.
These checks do not prove design intent, overall aesthetics, glyph occlusion,
typographic harmony, arbitrary scroll-trap behavior, actual keyboard traversal,
compositor contrast or full accessibility compliance.
