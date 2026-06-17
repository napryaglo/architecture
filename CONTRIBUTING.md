# Contributing

## Derived code

This repository contains source code derived from third-party projects under
permissive licenses. Each derivation is noted here for license-compliance
purposes; the derived files preserve their original copyright headers and
point at the corresponding license text in this repository.

### Skia pathops (BSD-3-Clause)

[src/visual-engine/geometry/pathops/](src/visual-engine/geometry/pathops/) is
a TypeScript port of Google Skia's `src/pathops/` module. The Skia source is
governed by the BSD-3-Clause license at [LICENSE-skia](LICENSE-skia).

The original Skia source is vendored under
[third_party/skia/](third_party/skia/) so each port commit can be reviewed
against its C++ counterpart and future Skia bugfixes can be back-ported by
reading the diff against the vendored snapshot. Every ported `.ts` file
carries the upstream "Copyright … Google Inc. … BSD-style license that can be
found in the LICENSE-skia file" header verbatim, plus a `Source:` line
naming the upstream `third_party/skia/src/pathops/…` file it derives from.

What the port covers:

  * **Phase 1** — curve-math primitives (point, rect, line, quad, cubic,
    bounds, type predicates).
  * **Phase 5** — intersection core (line-parameters, T-section bisection,
    line × line / quad × line / cubic × line / curve × curve intersection).
  * **Phase 6** — half-edge operation-time graph (OpSpan, OpSegment,
    OpContour, OpAngle, OpCoincidence, winding walker + ray cast).
  * **Phase 7** — boolean-ops dispatcher (`Op` + `Simplify` + edge builder +
    path writer + the `SortContourList` / `HandleCoincidence` pipeline).
  * **§ 19.1.1** — `ArcSegment` → cubic Bezier adapter (not derived from
    Skia; Skia uses rational quadratics / conics, the mural model drops
    them in favor of an SVG-spec § F.6.5 endpoint → center conversion).

Conics, the regression-test corpus, and the SoA hot path are not (yet)
ported. The current-backlog tracks any remaining gaps.

## Commits

Conventional layout — `<area>: short summary` ≤ 70 chars, blank line, body
that explains *why* (constraint / motivation / tradeoff) rather than *what*
(the diff already shows the what). Skia-derived commits cite the upstream
source path in the header of each ported file.
