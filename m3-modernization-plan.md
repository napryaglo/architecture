# Material 3 Modernization Plan

> ✅ **Status: SHIPPED** — Phases 0-9 complete; Appendix C (Expressive shape library, 35 shapes) complete; Phase 2.5 (SegmentedButton + ButtonGroup + SplitButton) and Phase 3.5 (FabMenu) Tier-1 close-out complete. Open follow-ups tracked in [current-backlog.md § 18](current-backlog.md). **1954 tests passing.**
>
> Locked-in scope decisions (all honoured):
> 1. ~~**All 170 tokens land upfront** before any control rewrite begins.~~ ✅ shipped 195 tokens upfront in Phase 1.
> 2. ~~**In-place** evolution of the existing `Material` theme bundle (no parallel `MaterialBaseline` fork).~~ ✅ in-place throughout.
> 3. ~~**Control order = M3 emphasis order**: Buttons → FAB → Card → App bars → Navigation → Lists → Inputs → Misc.~~ ✅ order respected; Phase 2.5 (Segmented/ButtonGroup/Split) and Phase 3.5 (FabMenu) slotted as add-ons.

Reference catalogue: [material3-tokens.md](material3-tokens.md). Source
of truth: <https://m3.material.io/components>.

---

## ~~Phase 0 — Runtime prep~~ ✅ SHIPPED

> Shipped: `LetterSpacing` DP on TextBlock with `Inherits | Render` at [src/basic/text-block.ts:109](src/basic/text-block.ts#L109). `cubicBezier` helper + named curves (Standard / StandardAccelerate / Emphasized / …) at [src/runtime/animation/easing.ts:34-42](src/runtime/animation/easing.ts#L34-L42).

Most token types already exist (`Brush`, `CornerRadius`, `number`,
`string`, `Effect`). Two families need a tiny bit of plumbing before
they can ride through `tokens { … }`:

- **Motion easing** — token value is a 4-tuple `(x0, y0, x1, y1)` for a
  cubic Bézier. Verify `EasingFunction` (already referenced by
  `theme.ts` for `SchemeTransition.easing`) can accept a 4-tuple
  literal or a named-curve identifier. If not, add a tiny helper
  `cubicBezier(x0, y0, x1, y1): EasingFunction` and register it as a
  valid catalog value type.
- **Typography roles** — each typescale slot decomposes into 5 atomic
  tokens (`-font`, `-weight`, `-size`, `-line-height`, `-tracking`).
  No new type — just 75 tokens (15 roles × 5). Confirmed via existing
  TextBlock DPs (`FontFamily`, `FontWeight`, `FontSize`, `LineHeight`,
  plus a new `LetterSpacing` DP if `tracking` is to be honoured).

Deliverables:
- New `LetterSpacing` DP on TextBlock (default 0) — only if we want
  letter-spacing in typography roles. Otherwise drop the `tracking`
  tokens.
- `cubicBezier(...)` helper exported from `runtime/animation/` (only
  if `EasingFunction` doesn't already accept the literal shape).

Verification: existing tests stay green; new DP has a focused unit
test.

---

## ~~Phase 1 — Token rollout (upfront)~~ ✅ SHIPPED

> Shipped: 195 tokens in [src/resources/material/material.mu](src/resources/material/material.mu) (the planned 170 + Phase 7 additions for `@Spacing0..@Spacing8`, list-row heights, `@DisabledContainerOpacity` / `@DisabledContentOpacity`). All 1.1-1.7 sub-sections landed. **Audit gap:** § 18.7 in [current-backlog.md](current-backlog.md) flags that the pre-M3 token audit ("anything in the catalog NOT in M3 either documented or removed") was never verified end-to-end.

All 170 tokens added to the Material bundle in one focused batch.
Catalog entries land in [src/resources/material/material.mu](src/resources/material/material.mu)'s
`tokens { … }` block; light/dark values land in
[light.mu](src/resources/material/light.mu) and
[dark.mu](src/resources/material/dark.mu).

Token names in `material.mu` keep the existing `@CamelCase` convention
(not the `kebab-case` of the CSS file) for compatibility with all
existing consumers — see the existing `@Primary`, `@OnPrimary`, etc.

Each step below is one commit; together they form Phase 1.

### 1.1 Reference palette (80 tokens)

Reference tokens are NOT exposed as `@RefPaletteXxx` aliases in
`material.mu` — they only appear in `light.mu` / `dark.mu` as the
source values for system roles. Skipping per-stop catalog entries
keeps `material.mu`'s public surface focused on semantic roles.

If a control later needs a raw palette stop (e.g. a chart palette
generator), add the stop to the catalog at that point.

### 1.2 System color — 30 roles, light + dark

Token catalog entry per role in `material.mu`'s `tokens { … }`:

```
@Primary               : Brush "Brand primary"
@OnPrimary             : Brush "Text/icon over @Primary"
@PrimaryContainer      : Brush "Tonal brand surfaces"
@OnPrimaryContainer    : Brush
@Secondary             : Brush
@OnSecondary           : Brush
@SecondaryContainer    : Brush
@OnSecondaryContainer  : Brush
@Tertiary              : Brush
@OnTertiary            : Brush
@TertiaryContainer     : Brush
@OnTertiaryContainer   : Brush
@Error                 : Brush
@OnError               : Brush
@ErrorContainer        : Brush
@OnErrorContainer      : Brush
@Background            : Brush
@OnBackground          : Brush
@Surface               : Brush
@OnSurface             : Brush
@SurfaceVariant        : Brush
@OnSurfaceVariant      : Brush
@Outline               : Brush
@Shadow                : Brush
@InverseSurface        : Brush
@InverseOnSurface      : Brush
@InversePrimary        : Brush
@SurfaceTint           : Brush
```

Plus the SurfaceContainer ladder we already use (kept — M3 v2024
addition):
```
@SurfaceContainerLowest, @SurfaceContainerLow, @SurfaceContainer,
@SurfaceContainerHigh, @SurfaceContainerHighest
```

`light.mu` / `dark.mu` populate each via the palette stop mappings
documented in `material3-tokens.md` § 2-3.

**Audit**: cross-check the existing 50-ish tokens against this list.
Anything in the existing catalog that's NOT in M3 either (a) gets a
documented rationale to keep, or (b) gets removed and call sites
migrated.

### 1.3 Shape — 18 corner radii

```
@ShapeNone           : CornerRadius "0dp"
@ShapeExtraSmall     : CornerRadius "4dp"
@ShapeSmall          : CornerRadius "8dp"
@ShapeMedium         : CornerRadius "12dp"
@ShapeLarge          : CornerRadius "16dp"
@ShapeExtraLarge     : CornerRadius "28dp"
@ShapeFull           : CornerRadius "Fully rounded — clamped to min(W,H)/2"
@ShapeExtraSmallTop  : CornerRadius "ES rounding on top corners only"
@ShapeLargeTop       : CornerRadius "Large rounding on top corners only"
@ShapeLargeEnd       : CornerRadius "Large rounding on end (RTL-aware right) corners"
@ShapeExtraLargeTop  : CornerRadius "XL rounding on top corners only"
```

Most aliases (`@ShapeSmall`, `@ShapeMedium`, `@ShapeLarge`) already
exist — verify values match (`8`, `12`, `16`) and add the missing
entries.

### 1.4 State layers — 4 opacities

```
@StateHoverOpacity   : number "0.08"
@StateFocusOpacity   : number "0.12"
@StatePressOpacity   : number "0.12"
@StateDragOpacity    : number "0.16"
```

NOTE: the existing `@StateHoverOverlay` / `@StateFocusOverlay` /
`@StatePressOverlay` brushes are pre-composed
"OnSurface @ opacity" brushes. Keep them for the existing call sites
that use them as Background, but expose the raw opacities here too
for the controls that want to composite OnSurface manually.

### 1.5 Elevation — 6 levels + tint

```
@ElevationLevel0     : Effect "Resting / flat"
@ElevationLevel1     : Effect "+1dp — text buttons, search bars"
@ElevationLevel2     : Effect "+3dp — cards, raised popups"
@ElevationLevel3     : Effect "+6dp — FAB, app bars"
@ElevationLevel4     : Effect "+8dp — navigation drawers"
@ElevationLevel5     : Effect "+12dp — dialogs, modal sheets"
@SurfaceTint         : Brush "Already in § 1.2 — alias here"
```

Existing `@Elevation0` … `@Elevation2` rename to the M3 numbering
where ambiguous; keep aliases for one milestone to ease the
transition.

### 1.6 Motion — 16 durations + 7 easings

```
@MotionDuration50    : number "50ms"
@MotionDuration100   : number "100ms"
… through @MotionDuration1000

@MotionEasingLinear              : EasingFunction "cubic(0,0,1,1)"
@MotionEasingStandard            : EasingFunction "cubic(0.2,0,0,1)"
@MotionEasingStandardAccelerate  : EasingFunction "cubic(0.3,0,1,1)"
@MotionEasingStandardDecelerate  : EasingFunction "cubic(0,0,0,1)"
@MotionEasingEmphasized          : EasingFunction "cubic(0.2,0,0,1)"
@MotionEasingEmphasizedAccelerate: EasingFunction "cubic(0.3,0,0.8,0.15)"
@MotionEasingEmphasizedDecelerate: EasingFunction "cubic(0.05,0.7,0.1,1)"
```

Phase 0 produces the `cubicBezier(...)` helper if `EasingFunction`
doesn't already accept the literal shape.

### 1.7 Typography — 15 roles × 5 atoms + 2 typefaces + 3 weights

Roles: `Display Large/Medium/Small`, `Headline L/M/S`, `Title L/M/S`,
`Body L/M/S`, `Label L/M/S`. Each contributes 5 tokens:

```
@DisplayLargeFont       : string  "Brand typeface"
@DisplayLargeWeight     : number  "400 (regular)"
@DisplayLargeSize       : number  "57"
@DisplayLargeLineHeight : number  "64"
@DisplayLargeTracking   : number  "-0.25 (px letter-spacing)"
… same shape for the other 14 roles …

@TypefaceBrand          : string  "Roboto"
@TypefacePlain          : string  "Roboto"
@TypefaceWeightRegular  : number  "400"
@TypefaceWeightMedium   : number  "500"
@TypefaceWeightBold     : number  "700"
```

(Existing `@FontFamily` becomes an alias for `@TypefacePlain`.)

If we choose NOT to honour `tracking` per the Phase 0 outcome, drop
the `-Tracking` tokens (saves 15 entries; no consumers today).

### 1.8 Phase 1 verification

- `npm run build` clean.
- `npm test` green — all 1734+ existing tests.
- Visual smoke check: open every demo; nothing changed paint-wise
  (Phase 1 adds tokens but no template touches them yet).
- Lint: every token catalog entry has a `description` string.

---

## ~~Phase 2 — Buttons family~~ ✅ SHIPPED

> Shipped: all 5 Common variant chromes (`DefaultFilledButton` / `DefaultElevatedButton` / `DefaultTonalButton` / `DefaultOutlinedButton` / `DefaultTextButton`) + `IconButton` + `IconButtonToggle` × 4 chromes each (Filled / Tonal / Outlined / Standard). **Phase 2.5 add-on shipped post-plan:** SegmentedButton + ButtonGroup + SplitButton (Tier-1 close-out per [current-backlog.md § 18](current-backlog.md)).

M3 spec: <https://m3.material.io/components/buttons/overview>

Current state in [basic.resources.mu](src/resources/basic.resources.mu):
`DefaultFilledButton`, `DefaultElevatedButton`, `DefaultTonalButton`,
`DefaultOutlinedButton`, `DefaultTextButton` — five variants already
exist. Per-variant audit:

### 2.1 Audit + bring up to spec

For each variant template:
- Cross-check resting / hover / focus / press / disabled colours
  against the M3 spec table for that variant.
- Verify the shape token (resting = `@ShapeFull` for all
  Common-button variants).
- Verify the typescale (`@LabelLargeXxx` per M3 spec).
- Verify state-layer opacities use the new `@StateHoverOpacity` etc.
  rather than hard-coded numbers.

Per-variant commits: one per `Filled`, `Elevated`, `Tonal`,
`Outlined`, `Text`.

### 2.2 Icon Button (new)

Currently µ-mural has no `IconButton`. M3 ships 4 variants
(Filled / Tonal / Outlined / Standard).

Deliverables:
- New `IconButton` class in `src/basic/icon-button.ts`, extends
  `Button`, sets `DefaultStyleKey = IconButton`.
- Optional `IconButton.Toggle` variant on top.
- Default templates per variant in `basic.resources.mu`.
- Symbol-table entry.
- Demo: extend `demos/toggle-button` or add a `demos/icon-button` demo.

Acceptance:
- 40dp × 40dp default touch target.
- Resting / hover / focus / press / disabled chromes all distinct in
  both light and dark.
- Switching ThemeSelector flips it live.

### 2.3 Phase 2 verification

- Visual side-by-side: each Common button variant against the M3 spec
  screenshot.
- Tests covering the new `IconButton` DPs and template.
- ToolBarButton / ToolBarToggleButton (which lean on Button) still
  paint correctly after the audit.

---

## ~~Phase 3 — FAB family (new)~~ ✅ SHIPPED

> Shipped: `FloatingActionButton` + `FabSize` enum (Small / Default / Large / Extended) + 4 chrome templates (`DefaultFab` / `DefaultFabSmall` / `DefaultFabLarge` / `DefaultFabExtended`). **Phase 3.5 add-on shipped post-plan:** `FabMenu` (Tier-1 close-out per [current-backlog.md § 18](current-backlog.md)).

M3 spec: <https://m3.material.io/components/floating-action-button/overview>

Currently no FAB control exists. M3 ships 3 sizes (FAB / FAB Small /
FAB Large) plus Extended FAB.

Deliverables:
- New `FloatingActionButton` class in `src/basic/fab.ts` (or
  `src/framework/fab.ts` — TBD based on whether it ships RoutedCommand
  support, which lives on Control).
- Sizes via a `Size` DP (`Small | Default | Large`) similar to
  Button.Variant.
- `Extended` DP that adds a label slot beside the icon.
- Default templates per size in `basic.resources.mu` / `framework.resources.mu`.
- Demo: `demo/demos/fab/`.

Default Style values per M3:
- FAB Small:  40dp, `@ShapeMedium`, `@ElevationLevel3`
- FAB:        56dp, `@ShapeLarge`, `@ElevationLevel3`
- FAB Large:  96dp, `@ShapeExtraLarge`, `@ElevationLevel3`
- Extended:   56dp tall, `@ShapeLarge`, padding for icon + label

Acceptance:
- Hover bumps elevation to Level4, lower elevation slightly on press.
- Container = `@PrimaryContainer`, label/icon = `@OnPrimaryContainer`.

---

## ~~Phase 4 — Cards (new)~~ ✅ SHIPPED

> Shipped: `Card` + `CardVariant` enum (Filled / Elevated / Outlined) + 3 chrome templates (`DefaultFilledCard` / `DefaultElevatedCard` / `DefaultOutlinedCard`).

M3 spec: <https://m3.material.io/components/cards/overview>

Currently a `Border` does the job. M3 Card has 3 variants.

Deliverables:
- New `Card` class in `src/basic/card.ts` extending `ContentControl`.
- `Variant` DP (`Filled | Elevated | Outlined`).
- Default templates in `basic.resources.mu`.
- Demo: `demo/demos/card/`.

M3 values per variant:
- Filled:   `@SurfaceContainerHighest`, no border, `@ShapeMedium`.
- Elevated: `@SurfaceContainerLow`, `@ElevationLevel1`, `@ShapeMedium`.
- Outlined: `@Surface`, `@Outline` 1dp border, `@ShapeMedium`.

State triggers: hover bumps elevation +1; pressed lowers it back to
resting.

---

## ~~Phase 5 — App bars~~ ✅ SHIPPED

> Shipped: `TopAppBar` + `TopAppBarVariant` enum (CenterAligned / Small / Medium / Large) + 4 chrome templates. Option A taken — both `TopAppBar` and `ToolBar` coexist. Scroll-tint + scroll-collapse landed in deviations 1/3, 2/3, 3/3 (commits `b903eb3` / `60f614a` / `3426169`). **Deferred:** Bottom app bar — [current-backlog.md § 18.9](current-backlog.md).

M3 spec: <https://m3.material.io/components/top-app-bar/overview>

Current `ToolBar` is more like an Office/VS-Code action toolbar. M3
"Top app bar" is a distinct construct (navigation icon + title +
action icons, lives at the top of a screen).

Decision needed mid-phase: do we:
- (A) Add a new `TopAppBar` control and keep `ToolBar` as-is for the
  Office-style use case, OR
- (B) Rename `ToolBar` to `TopAppBar` and update the existing demo?

Default to (A) unless renaming would be cleaner — confirm before
committing.

Deliverables (option A):
- New `TopAppBar` class in `src/framework/top-app-bar/top-app-bar.ts`.
- Variants per M3 spec: `CenterAligned | Small | Medium | Large`.
- Default templates in `framework.resources.mu`.
- Use the existing `ThemeSelector` for the right-side action slot in
  the platform demo (already done).
- Demo: convert the platform header from the home-grown DockPanel-of-
  Border to a real `TopAppBar`.

Bottom app bar (M3 also has one): defer unless a demo asks for it.

---

## ~~Phase 6 — Navigation~~ ✅ SHIPPED

> Shipped: `NavigationItem` / `NavigationRail` / `NavigationBar` + 4 templates (`DefaultNavigationItem` / `DefaultNavigationRail` / `DefaultNavigationBar` / `DefaultNavigationRailPanel` / `DefaultNavigationBarPanel`). Drawer audit landed (commit `947537c`). Platform-shell migration to NavigationRail closed (commit `3e7e673`).

M3 spec: <https://m3.material.io/components/navigation-bar/overview>,
<https://m3.material.io/components/navigation-rail/overview>,
<https://m3.material.io/components/navigation-drawer/overview>

Current state:
- `Drawer` exists — audit against M3 Navigation Drawer spec, fix any
  delta.
- `NavigationBar` (mobile-style bottom tabs) — new.
- `NavigationRail` (desktop side rail) — new. The platform demo's
  left-rail TreeView could be rewritten as a NavigationRail.

Sequencing: Drawer audit first, then NavigationRail (replaces the
demo's home-grown left strip), then NavigationBar last (only needed if
we build a mobile-form-factor demo).

---

## ~~Phase 7 — Lists~~ ✅ SHIPPED

> Shipped: M3 list-row anatomy DPs (Leading / SupportingText / Trailing + HasSupportingText / IsThreeLine derived) on `ListBoxItem` / `TreeViewItem` / `ComboBoxItem`. `IsPressed` lifecycle wired on ClickableRow / ClickableBorder. `Selector.SelectedIndex` / `SelectedItem` / `SelectedValue` flipped to `BindsTwoWayByDefault` (WPF parity). State-layer / density / pointer triggers per row template. Disabled state honoured via `Visual.IsEnabled` (added in this phase).

M3 spec: <https://m3.material.io/components/lists/overview>

Current state: `ListBox`, `ListBoxItem`, `TreeView`, `TreeViewItem`,
`ComboBox`, `ComboBoxItem` all exist. Audit each row template against
the M3 list spec.

Deliverables per control:
- `ListBoxItem`, `TreeViewItem`, `ComboBoxItem` row templates updated
  to M3 list row anatomy (leading icon slot, content, supporting text,
  trailing icon slot, 1-line / 2-line / 3-line height variants).
- Per-row Density triggers using `@StateHoverOpacity` instead of hard-
  coded backgrounds.

---

## ~~Phase 8 — Inputs~~ ✅ SHIPPED (except 8.10)

> Shipped: TextBox split into `TextBoxVariant.{Filled, Outlined}` + two templates; `Switch`, `Checkbox`, `RadioButton` (GroupName mutual-exclusion via tree walk), `Chip` + `ChipVariant`, `TabControl` + `TabItem`, `SearchBar`. Slider 2024 thumb redesign landed (8.6 — 4dp primary / 16dp cross-axis / 16dp track; 7 geometry-pinning tests updated). ComboBox audit done. **Deferred:** 8.10 DatePicker / TimePicker — [current-backlog.md § 18.9](current-backlog.md).

M3 spec: <https://m3.material.io/components/text-fields/overview> and
sibling pages.

Current state:
- `TextBox` exists — M3 has `Filled` and `Outlined` variants. Audit
  against spec.
- `Slider` exists — M3 spec has thumb shape changes in 2024, audit.
- `ComboBox` exists.
- `Checkbox`, `RadioButton`, `Switch`, `Chip`, `Search`,
  `DatePicker`, `TimePicker`, `Tabs` are all **new**.

Sequencing:
- 8.1 TextField (Filled + Outlined variants on existing TextBox).
- 8.2 Switch (new).
- 8.3 Checkbox (new — descend from ToggleButton).
- 8.4 RadioButton (new — descend from ToggleButton with a group
  attached property).
- 8.5 Chip (new — Assist / Filter / Input / Suggestion variants).
- 8.6 Slider audit.
- 8.7 ComboBox audit (we already touched Density in this session).
- 8.8 Tabs (new).
- 8.9 SearchBar (new — wraps TextBox with a leading icon slot and a
  trailing clear-button).
- 8.10 DatePicker / TimePicker — defer pending a demo that needs them.

---

## ~~Phase 9 — Misc~~ ✅ SHIPPED + OVER-DELIVERED

> Shipped: `Tooltip` / `Snackbar` / `Dialog` + shared overlay-helpers (`attachTooltip` / `showSnackbar` / `showDialog`), `ProgressIndicator` + `ProgressIndicatorVariant.{Linear, Circular}` (Circular driven by the new `Arc` primitive), `Divider` (promoted to a Control). **Over-delivered** (plan said "defer pending demo needs"): `Badge` + `BadgeVariant.{Dot, Numeric}`, `Banner`, `BottomSheet`. **Gap:** demos missing for the three over-delivered controls — [current-backlog.md § 18.8](current-backlog.md).

M3 spec: dialogs, snackbars, tooltips, progress indicators, badges,
dividers, banners, bottom sheets.

Current state:
- `MenuStrip`, `MenuButton`, `ContextMenu` exist — audit.
- `StatusBar` exists but isn't M3 (M3 has nothing analogous).
- Everything else in this phase is new.

Sequencing pragmatic, not predetermined:
- Tooltip — small, high reuse value.
- Dialog — needed for any demo with confirmation flows.
- Snackbar — pairs with dialog; uses the OverlayLayer plumbing already
  in place for ContextMenu / ComboBox.
- ProgressIndicator (Linear + Circular variants).
- Divider — already exists as Border-driven; verify it follows the M3
  inset spec.
- Badge, Banner, BottomSheet — defer pending demo needs.

---

## Cross-cutting acceptance criteria

Applied to every phase ≥ 2:

1. ~~**Light + dark parity** — both schemes paint correctly without imperative refresh on theme swap.~~ ✅ met (DynamicResource throughout).
2. ~~**Five state pass** — resting / hover / focus / press / disabled are all visually distinct in both schemes.~~ ✅ met — `Visual.IsEnabled` framework shipped at [visual.ts:252](src/runtime/visual.ts) + input gating at [routed-event.ts](src/runtime/input/routed-event.ts) + 9 tests.
3. ~~**Density responsiveness** — Compact / Regular / Comfortable ladder respected where the M3 spec defines it.~~ ✅ met — Density + coarse-pointer triggers now span every interactive / container control after the [backlog § 18.6 → 18.Q](completed-backlog.md) sweep (toggles fixed structurally by growing the CONTROL's Width/Height, ribbon invokers coarse-only, picker + container families, delegating shell / non-interactive surfaces documented-skipped). Genuinely-delegating containers and non-interactive surfaces intentionally carry none.
4. ~~**No hardcoded colours / radii** — every chrome value rides through a token.~~ ✅ met — verified end-to-end (only `#00000000` transparent rest values remain, which are intentional state-layer bases).
5. ~~**Tests** — existing tests stay green; new templates get focused unit coverage (DP defaults, state-trigger fire-order).~~ ✅ met — 1828 baseline → **1954 passing** (+126 from Phase 7+ work, Appendix C, Phase 2.5 / 3.5).
6. ⚠️ **Demo coverage** — every new control gets a demo entry under `demo/demos/<name>/`. **3 missing** (Phase 9 over-deliveries): Badge, Banner, BottomSheet — see [backlog § 18.8](current-backlog.md).
7. ~~**Comment hygiene** — template comments explain the *why* behind non-obvious state-layer choices (see the new ToolBarButton comment for the pattern).~~ ✅ met across spot-checked templates.

---

## ~~Known unknowns~~ ✅ ALL RESOLVED

These get resolved at the phase boundary that surfaces them:

- ~~**Motion plumbing**: do state transitions (hover → pressed) animate
  the colour swap via `SchemeTransition`-style timelines, or snap?~~ ✓ Resolved — implicit per-DP transitions wired (commit `7d96169`) + pluggable builders + brush registration (commit `d382615`). State swaps animate via CSS-`transition`-style engine.
- ~~**Tracking (`letter-spacing`)**: ship as DPs or drop?~~ ✓ Resolved — shipped as `LetterSpacing` DP on TextBlock with `Inherits | Render` ([text-block.ts:109](src/basic/text-block.ts#L109)).
- ~~**TopAppBar vs ToolBar rename**~~ ✓ Resolved — Option A (both coexist) per Phase 5 above.
- ~~**Icon font / SVG icon system**~~ ✓ Resolved — Material Symbols Outlined CDN loaded by [demo/platform/platform.html](demo/platform/platform.html); TextBlock's text rendering picks up the font's ligature substitution so `Text="home"` paints the home glyph.

---

## Appendix A — M3 component catalogue (full)

Pulled from `m3.material.io/sitemap.xml` (filter
`/components/<slug>/overview`). 36 distinct components, status mapped
against the µ-mural inventory as of the date this plan was authored.

The "Phase" column shows where the entry lands in the modernization
schedule above; "—" means the spec page exists but the work is
deferred (no concrete demo demand today).

### Buttons family

| M3 component | Spec | Mural status | Phase |
| --- | --- | --- | --- |
| Buttons (Common) — Filled / Elevated / Tonal / Outlined / Text | [buttons](https://m3.material.io/components/buttons/overview) | ✅ shipped — all 5 variant chromes | ~~2.1~~ |
| Icon buttons — Filled / Tonal / Outlined / Standard | [icon-buttons](https://m3.material.io/components/icon-buttons/overview) | ✅ shipped — `IconButton` + `IconButtonToggle` × 4 chromes each | ~~2.2~~ |
| Segmented buttons — Single-select / Multi-select | [segmented-buttons](https://m3.material.io/components/segmented-buttons/overview) | ✅ shipped — `SegmentedButton` + `SegmentedItem` (Tier-1 close-out) | ~~Phase 2.5~~ |
| Button groups | [button-groups](https://m3.material.io/components/button-groups/overview) | ✅ shipped — `ButtonGroup` with hover-expand on `Panel.ArrangeChild` clock-driven transition (Tier-1 close-out; §18.3) | ~~Phase 2.5~~ |
| Split button — drives a primary action + a dropdown menu | [split-button](https://m3.material.io/components/split-button/overview) | ✅ shipped — `SplitButton` (Tier-1 close-out) | ~~Phase 2.5~~ |
| Floating Action Button (FAB) — Small / Default / Large | [floating-action-button](https://m3.material.io/components/floating-action-button/overview) | ✅ shipped — `FloatingActionButton` + `FabSize` enum | ~~3~~ |
| Extended FAB | [extended-fab](https://m3.material.io/components/extended-fab/overview) | ✅ shipped — `FabSize.Extended` variant | ~~3~~ |
| FAB menu — FAB that reveals secondary actions on tap | [fab-menu](https://m3.material.io/components/fab-menu/overview) | ✅ shipped — `FabMenu` with staggered reveal Storyboard (Tier-1 close-out) | ~~Phase 3.5~~ |

### Containers

| M3 component | Spec | Mural status | Phase |
| --- | --- | --- | --- |
| Cards — Filled / Elevated / Outlined | [cards](https://m3.material.io/components/cards/overview) | ✅ shipped — `Card` + `CardVariant` × 3 chromes | ~~4~~ |
| Carousel | [carousel](https://m3.material.io/components/carousel/overview) | none — deferred ([backlog § 18.9](current-backlog.md)) | — |
| Dialogs — basic / Full-screen | [dialogs](https://m3.material.io/components/dialogs/overview) | ✅ shipped — `Dialog` + `showDialog` overlay-helper | ~~9~~ |
| Bottom sheets — Modal / Standard | [bottom-sheets](https://m3.material.io/components/bottom-sheets/overview) | ✅ shipped (over-delivered) — `BottomSheet` ContentControl; demo missing ([backlog § 18.8](current-backlog.md)) | — |
| Side sheets — Modal / Standard | [side-sheets](https://m3.material.io/components/side-sheets/overview) | none — deferred ([backlog § 18.9](current-backlog.md)); Drawer is closest analog | — |

### App chrome

| M3 component | Spec | Mural status | Phase |
| --- | --- | --- | --- |
| App bars — Top / Bottom (Center-aligned / Small / Medium / Large) | [app-bars](https://m3.material.io/components/app-bars/overview) | ✅ Top shipped — `TopAppBar` + 4 size variants; ✅ Bottom shipped — `BottomAppBar` (Actions row + FAB slot; [backlog § 18.9](current-backlog.md)) | ~~5~~ |
| Toolbars — docking surfaces (M3 2024 page distinct from Top App Bar) | [toolbars](https://m3.material.io/components/toolbars/overview) | ✅ shipped — `ToolBar` audit complete (coexists with `TopAppBar` via Option A) | ~~5~~ |
| Navigation bar — bottom tab bar | [navigation-bar](https://m3.material.io/components/navigation-bar/overview) | ✅ shipped — `NavigationBar` + `NavigationItem` | ~~6~~ |
| Navigation rail — desktop side rail | [navigation-rail](https://m3.material.io/components/navigation-rail/overview) | ✅ shipped — `NavigationRail`; platform shell migrated | ~~6~~ |
| Navigation drawer — Modal / Standard | [navigation-drawer](https://m3.material.io/components/navigation-drawer/overview) | ✅ audit complete — `Drawer` aligned with M3 spec | ~~6~~ |
| Tabs — Primary / Secondary | [tabs](https://m3.material.io/components/tabs/overview) | ✅ shipped — `TabControl` + `TabItem` | ~~8.8~~ |
| Search — SearchBar / SearchView | [search](https://m3.material.io/components/search/overview) | ✅ shipped — `SearchBar` extends TextBox | ~~8.9~~ |

### Selection / inputs

| M3 component | Spec | Mural status | Phase |
| --- | --- | --- | --- |
| Text fields — Filled / Outlined | [text-fields](https://m3.material.io/components/text-fields/overview) | ✅ shipped — `TextBoxVariant.{Filled, Outlined}` + 2 chromes | ~~8.1~~ |
| Switch | [switch](https://m3.material.io/components/switch/overview) | ✅ shipped — `Switch` extends ToggleButton | ~~8.2~~ |
| Checkbox | [checkbox](https://m3.material.io/components/checkbox/overview) | ✅ shipped — `Checkbox` extends ToggleButton | ~~8.3~~ |
| Radio button | [radio-button](https://m3.material.io/components/radio-button/overview) | ✅ shipped — `RadioButton` with GroupName tree-walk exclusion | ~~8.4~~ |
| Chips — Assist / Filter / Input / Suggestion | [chips](https://m3.material.io/components/chips/overview) | ✅ shipped — `Chip` + `ChipVariant` × 4 | ~~8.5~~ |
| Sliders | [sliders](https://m3.material.io/components/sliders/overview) | ✅ audit complete — M3 2024 thumb redesign (4dp primary / 16dp cross-axis / 16dp track) | ~~8.6~~ |
| Date pickers — Modal / Docked | [date-pickers](https://m3.material.io/components/date-pickers/overview) | none — deferred ([backlog § 18.9](current-backlog.md)) | 8.10 (deferred) |
| Time pickers — Modal / Docked | [time-pickers](https://m3.material.io/components/time-pickers/overview) | none — deferred ([backlog § 18.9](current-backlog.md)) | 8.10 (deferred) |

### Surfaces & status

| M3 component | Spec | Mural status | Phase |
| --- | --- | --- | --- |
| Lists — 1-line / 2-line / 3-line | [lists](https://m3.material.io/components/lists/overview) | ✅ shipped — anatomy DPs on ListBoxItem / TreeViewItem / ComboBoxItem | ~~7~~ |
| Menus — Dropdown / Cascading / Context | [menus](https://m3.material.io/components/menus/overview) | ✅ audit complete — `MenuStrip` / `MenuButton` / `MenuItem` / `ContextMenu` | ~~9~~ |
| Tooltips — Plain / Rich | [tooltips](https://m3.material.io/components/tooltips/overview) | ✅ shipped — `Tooltip` + `attachTooltip` overlay-helper | ~~9~~ |
| Snackbar | [snackbar](https://m3.material.io/components/snackbar/overview) | ✅ shipped — `Snackbar` + `showSnackbar` overlay-helper | ~~9~~ |
| Progress indicators — Linear / Circular | [progress-indicators](https://m3.material.io/components/progress-indicators/overview) | ✅ shipped — `ProgressIndicator` + `Linear` / `Circular` variants (Circular uses new `Arc` primitive) | ~~9~~ |
| Loading indicator (M3 2024 — distinct from circular progress) | [loading-indicator](https://m3.material.io/components/loading-indicator/overview) | ✅ shipped — `LoadingIndicator` + `LoadingIndicatorVariant` (ActiveIndicator / Contained); rotating variable-amplitude arc on the shared animation clock ([backlog § 18.9](current-backlog.md)) | ~~5~~ |
| Badges | [badges](https://m3.material.io/components/badges/overview) | ✅ shipped (over-delivered) — `Badge` + `BadgeVariant.{Dot, Numeric}`; demo missing ([backlog § 18.8](current-backlog.md)) | — |
| Divider | [divider](https://m3.material.io/components/divider/overview) | ✅ shipped — `Divider` promoted from Border-driven pattern to a first-class Control | ~~9~~ |

### ~~Catalogue totals~~ ✅ POST-SHIPPING

- **36 M3 components** total, across 5 thematic groups.
- ✅ **33 currently shipping in µ-mural**: Buttons (5 variants) + IconButton (4 chromes) + SegmentedButton + ButtonGroup + SplitButton + FAB + ExtendedFAB + FabMenu + Cards (3 variants) + Dialogs + BottomSheet + TopAppBar + BottomAppBar + Toolbars + NavigationBar + NavigationRail + Drawer + Tabs + Search + TextField (Filled+Outlined) + Switch + Checkbox + RadioButton + Chips (4 variants) + Sliders + Lists + Menus + Tooltips + Snackbar + ProgressIndicator (Linear+Circular) + LoadingIndicator + Badges + Divider.
- **4 still deferred** (build sequenced smallest-first — see [backlog § 18.9](current-backlog.md)): Side sheets, DatePicker, TimePicker, Carousel. (~~Bottom app bar~~, ~~Loading indicator~~ ✅ shipped.)

> Counted as "shipped": 31 of 36 M3 components ship as live controls today; 5 remain plan-explicit deferrals.

---

## ~~Appendix B — Existing-control template audit schedule~~ ⚠️ EFFECTS LANDED, AUDIT TRAIL MISSING

> **Status:** the templates exist and follow the patterns (53+ `Default*` resources, 25 Density + 20 Pointer triggers across templates). The work landed alongside the consuming phase commit, but no commit message records which controls actually passed all 8 checklist items. Tracked as gap [§ 18.6 in current-backlog.md](current-backlog.md).

Every control that already ships chrome (a Style + ControlTemplate in
`basic.resources.mu` / `framework.resources.mu`) gets audited before
its phase's new work begins. Each audit is one focused commit.

### Per-control audit checklist

Apply the same eight checks to every entry below — call out which
ones FAIL in the commit message and what changed:

1. **Tokens only**: no hex literals, no hard-coded radii, no
   hard-coded spacing. Everything rides through `@TokenName`.
2. **State-layer pattern**: opaque-step ladder when the resting
   Background is solid (see [framework.resources.mu](src/resources/framework.resources.mu)
   ToolBarButton fix); translucent OnSurface overlay when the resting
   Background is transparent (see [framework.resources.mu](src/resources/framework.resources.mu)
   DefaultMenuItemRow). No mixing.
3. **Five-state pass**: resting / hover / focus / press / disabled —
   all visually distinct in BOTH light and dark.
4. **Shape**: corner radii use `@ShapeNone` … `@ShapeFull` per the
   M3 spec page for that control category.
5. **Typography**: every TextBlock-bound label binds to a typescale
   role (`@LabelLargeXxx`, `@BodyMediumXxx`, …) not literal sizes.
6. **Density triggers**: `when(Density=Compact)` and
   `when(Density=Comfortable)` cover the M3 density variants.
7. **Coarse-pointer touch target**: `when(Pointer=Coarse)` widens
   padding where the M3 spec calls for a larger touch target.
8. **Live theme swap**: every brush is `DynamicResource`-backed so
   theme/scheme flips repaint without imperative refresh.

### Batch A — Foundational chrome (before Phase 2)

Buttons + their derivatives. Foundation for every clickable surface
elsewhere in the plan.

| # | Control | Where | Notes |
| --- | --- | --- | --- |
| A.1 | `Button` × 5 variants (Filled / Elevated / Tonal / Outlined / Text) | [basic.resources.mu](src/resources/basic.resources.mu) | Already Phase 2.1; audit fills in the checklist. |
| A.2 | `ToggleButton` | none in markup today — base class has no Style | Decide whether ToggleButton gets its own Style or inherits Button's. M3's analog is the Filled/Tonal/Outlined Toggle button variants. |
| A.3 | `ToolBarButton` / `ToolBarToggleButton` | [framework.resources.mu](src/resources/framework.resources.mu) | Verify the recent SurfaceContainer-ladder fix is on-spec for M3 Toolbars + matches Phase 5 work. |
| A.4 | Divider | callers use `Border` with `BorderThickness=(0,0,0,1)`, `@OutlineVariant`. | Either promote to a `Divider` control with insets per M3 spec, or document the pattern + verify all call-sites use it. |

### Batch B — List controls (before Phase 7)

Row templates for the data-list controls. Some are first-class M3
analogs (ListBox), some are µ-mural-only (TreeView, ComboBox row)
but still benefit from the same checklist.

| # | Control | Where | Notes |
| --- | --- | --- | --- |
| B.1 | `ListBox` / `ListBoxItem` row | [basic.resources.mu](src/resources/basic.resources.mu) | Audit row anatomy against [M3 lists](https://m3.material.io/components/lists/overview): leading-icon slot, content, supporting text, trailing slot. |
| B.2 | `TreeView` / `TreeViewItem` row | [basic.resources.mu](src/resources/basic.resources.mu) | No direct M3 analog — apply the lists row anatomy with an extra leading chevron slot. |
| B.3 | `ComboBox` selection box + popup + `ComboBoxItem` | [basic.resources.mu](src/resources/basic.resources.mu) | Density pass already shipped; remaining audit covers popup chrome + typography. Closest M3 analog is Exposed Dropdown Menu in [menus](https://m3.material.io/components/menus/overview). |
| B.4 | `SpinEdit` | [basic.resources.mu](src/resources/basic.resources.mu) | Composes TextBox + two RepeatButtons. Re-audit after B.5 / C.1. |

### Batch C — Inputs (before Phase 8)

| # | Control | Where | Notes |
| --- | --- | --- | --- |
| C.1 | `TextBox` | [basic.resources.mu](src/resources/basic.resources.mu) | Audit one variant first; Phase 8.1 splits into M3 Filled + Outlined variants on top of the cleaned baseline. |
| C.2 | `Slider` | [basic.resources.mu](src/resources/basic.resources.mu) | Audit thumb shape against M3 Sliders 2024 spec (thumb width changes on hover/press); verify IsDragging trigger ladder. |

### Batch D — Overlays + menus (before Phase 9)

Menu chrome composes Submenu / MenuStrip / MenuButton / ContextMenu —
all sharing one `MenuItem` row template via templated `RowTemplate`.
Audit the row template first; the popup hosts trail.

| # | Control | Where | Notes |
| --- | --- | --- | --- |
| D.1 | `MenuItem` row + submenu popup | [framework.resources.mu](src/resources/framework.resources.mu) | Audit against [M3 menus](https://m3.material.io/components/menus/overview): leading-icon, label, trailing-gesture, chevron. Verify state-layer overlay pattern (rows ARE transparent at rest — overlay-on-top is correct). |
| D.2 | `MenuStripItem` top-level row | [framework.resources.mu](src/resources/framework.resources.mu) | Same checklist; verify single-row strip layout matches M3 top-of-screen menu bar pattern. |
| D.3 | `MenuButton` trigger + popup | [framework.resources.mu](src/resources/framework.resources.mu) | Audit trigger chrome (currently inherits the Button SurfaceContainer ladder). Verify popup shadow + ShapeExtraSmall corner. |
| D.4 | `ContextMenu` popup | [framework.resources.mu](src/resources/framework.resources.mu) | Same popup chrome as MenuButton; verify they share the template's `DefaultContextMenuPopup` resource without divergence. |
| D.5 | `Drawer` | bundled-template (older `surface.template.mu` path) | Audit against [M3 navigation-drawer](https://m3.material.io/components/navigation-drawer/overview): Modal vs Standard variant chrome, header padding, list-item slot. Pairs with Phase 6.2 (Navigation drawer audit). |

### Batch E — Standalone (no M3 analog, but still need cleanup)

These have no direct M3 spec page, so the checklist is reduced to
items 1, 2, 3, 6, 8 (tokens / state-layer / five-state / density /
live swap). Shape and typography only get checked against µ-mural's
internal conventions.

| # | Control | Where | Notes |
| --- | --- | --- | --- |
| E.1 | `ToolBar` chrome + overflow popup | [framework.resources.mu](src/resources/framework.resources.mu) | Cross-check against [M3 toolbars](https://m3.material.io/components/toolbars/overview) for the parts that overlap (button chrome, separator). |
| E.2 | `StatusBar` / `StatusBarItem` / `StatusBarSeparator` | [framework.resources.mu](src/resources/framework.resources.mu) | Verify token-only Background + Separator-tinted LineBrush. |
| E.3 | `ScrollBar` / `ScrollViewer` | [basic.resources.mu](src/resources/basic.resources.mu) | Verify the auto-hide IsFaded trick (recent fix) doesn't leak imperative state; confirm thumb hover/press tints follow the SurfaceContainer ladder. |
| E.4 | `Splitter` / `GridSplitter` / `Thumb` | [basic.resources.mu](src/resources/basic.resources.mu) | Track / preview-line chrome. `Thumb` is shared by ScrollBar, Slider, GridSplitter — audit the base last so changes ripple. |

### ~~Schedule summary~~ ⚠️ EFFECTS LANDED, DISCRETE COMMITS MISSING

- ~~**Batch A** — 4 commits — runs **immediately before Phase 2** starts.~~ effects landed in Phase 2 commits.
- ~~**Batch B** — 4 commits — runs **immediately before Phase 7**.~~ effects landed in Phase 7 commits (list-row anatomy, IsPressed lifecycle).
- ~~**Batch C** — 2 commits — runs **immediately before Phase 8**.~~ effects landed in Phase 8 commits (TextBox Filled/Outlined split, Slider 2024 thumb redesign).
- ~~**Batch D** — 5 commits — runs **immediately before Phase 9**.~~ effects landed in Phase 9 commits (overlay helpers cover MenuItem/MenuButton/ContextMenu/Drawer audit shape).
- ~~**Batch E** — 4 commits — fits **anywhere** during Phases 5-9.~~ effects landed alongside the consuming phase (E.4 Thumb redesign + Slider audit in Phase 8.6).

Total: **19 audit commits** *planned* — work landed across the phase commits rather than as discrete per-control audit commits. Each batch's checklist may or may not have been applied uniformly per-control; gap tracked at [backlog § 18.6](current-backlog.md).

### Mural-only controls not in M3

The current roster includes work outside the M3 catalogue that the
plan leaves untouched — these have their own design heritage (mostly
WPF parity) and stay where they are:

- `TreeView` / `TreeViewItem` — WPF parity; closest M3 analog is the
  nested list variant in [lists](https://m3.material.io/components/lists/overview).
- `ComboBox` / `ComboBoxItem` — WPF parity; closest M3 analog is
  Exposed Dropdown Menu under [menus](https://m3.material.io/components/menus/overview).
- `SpinEdit` — numeric stepper; no direct M3 analog.
- `ScrollBar` / `ScrollViewer` — platform chrome, no M3 page.
- `StatusBar` / `StatusBarItem` / `StatusBarSeparator` — Office-shell
  chrome; no M3 analog.
- `PageView` — demo-platform navigation chrome.
- `Diagram` / `DiagramNode` — first-class node-graph surface.
- `Splitter` / `GridSplitter` — WPF parity resize affordances.
- `Thumb` — drag-aware primitive shared by `ScrollBar` / `Slider` /
  `GridSplitter`.
- `ThemeSelector` — the picker built earlier in this session.

---

## ~~Appendix C — M3 Expressive shape library~~ ✅ SHIPPED

> Shipped: all 35 named M3 Expressive shapes across 27 mural classes (parametric consolidation). C.S1 (8 round/architectural), C.S2 (13 cookies/clovers/Slanted), C.S3 (7 radial waves), C.S4 (7 puffy/glyphs/pixel + consolidated demo) — all landed. Total +100 new tests. Plan deviation: shapes build PathGeometry inline in RenderOverride following the Arc precedent rather than each getting a per-shape Geometry subclass; avoided 27 new branches in renderer dispatch.

The Material 3 Expressive shape palette (2025) ships 35 shapes used
for icon containers, FAB silhouettes, avatar masks, badge backdrops,
splash transitions, and marker glyphs. They're closed-path geometries,
typically used as `Clip` or as the silhouette of a `Shape` Visual.

µ-mural already has `Ellipse`, `Rectangle`, `Line` in
[src/basic/shapes/](src/basic/shapes/). The plan: each M3 shape lands
as one `Visual` subclass under the same folder, each with the same
shape contract — `Fill`, `Stroke`, `StrokeThickness` DPs — and a
matching `<ShapeName>Geometry` class in
[src/visual-engine/geometry.ts](src/visual-engine/geometry.ts). Where
M3 ships a parametric family (cookies with N sides, clovers with N
leaves, sunny / burst with N lobes), one parameterized class covers
the family rather than one per stop.

Phase slot: lands as **Phase 4.5** — after Phase 1 tokens are in,
before Phase 4 Cards (which use shape masks for the M3 expressive
card chrome). Most of the work is geometry math; the Visual subclass
shell is mechanical.

### C.1 Round / rectangular base shapes

Closed superellipses or composite arc geometries. Trivial DPs (Fill,
Stroke, StrokeThickness only).

| Shape | M3 name | Implementation notes |
| --- | --- | --- |
| Circle | `Circle` | Already in `Ellipse` — promote or alias. Squircle variant possible via `Superness` DP. |
| Square | `Square` | Squircle (rounded square via superellipse exponent ~4). Existing `Rectangle` covers the strict-square case; add a `SquircleGeometry`. |
| Slanted | `Slanted` | Square with diagonal lean transform. Inherit `Square`; add `LeanAngle` DP. |
| Oval | `Oval` | Already in `Ellipse` with non-equal axes — promote or alias. |
| Pill | `Pill` | Rectangle with full-circle ends (`CornerRadius = min(W,H)/2`). Cover via `Rectangle.RadiusX/Y` or dedicated `PillGeometry`. |
| Diamond | `Diamond` | 4-sided rounded polygon. Reuse `NSidedCookie(sides=4, rotation=45°, cornerRadius=high)`. |
| Pentagon | `Pentagon` | Reuse `NSidedCookie(sides=5)` — the rounded-corner pentagon matches the M3 shape. |
| Gem | `Gem` | Hexagonal flat-top with rounded corners. Reuse `NSidedCookie(sides=6, rotation=0°)`. |

### C.2 Architectural shapes (one-off geometries)

Each has a hand-tuned path. No parametric family.

| Shape | M3 name | Implementation notes |
| --- | --- | --- |
| Arch | `Arch` | Rounded-top rectangle (top corners full-radius, bottom corners square). Direct path. |
| Semicircle | `Semicircle` | Half-ellipse + base line. Direct path. |
| Triangle | `Triangle` | Rounded equilateral triangle. Direct path. |
| Arrow | `Arrow` | Rounded triangle with concave base. Direct path. |
| Fan | `Fan` | Quarter-circle with arc edge. Direct path. |
| Clamshell | `Clamshell` | Hexagon-ish wide-flat shape. Direct path. |

### C.3 Cookies (parametric polygons)

Convex polygons with N rounded sides. Single class `NSidedCookie` /
`CookieGeometry`, parameterized by `Sides` (3–24+) and `CornerRadius`.
Defaults to the M3 named stops. M3 catalogue ships:

| Shape | `Sides` | M3 name |
| --- | --- | --- |
| 4-sided cookie | 4 | `FourSidedCookie` |
| 6-sided cookie | 6 | `SixSidedCookie` |
| 7-sided cookie | 7 | `SevenSidedCookie` |
| 9-sided cookie | 9 | `NineSidedCookie` |
| 12-sided cookie | 12 | `TwelveSidedCookie` |

Authored convenience: one named `Cookie` class with `Sides` DP plus
five thin pass-through aliases (`FourSidedCookie`, `SixSidedCookie`,
…) that just set the DP for ergonomic markup.

### C.4 Sunny / star bursts (parametric radial waves)

Single radial-wave generator: a closed curve whose radius is
`base + amplitude · cos(N · θ + phase)`. Single class `RadialWave` /
`RadialWaveGeometry`, parameterized by `Lobes`, `Amplitude`,
`Sharpness`. Defaults match the M3 named stops:

| Shape | M3 name | Lobes | Amplitude | Sharpness |
| --- | --- | --- | --- | --- |
| Sunny | `Sunny` | 8 | low | smooth |
| Very sunny | `VerySunny` | 8 | high | smooth |
| Burst | `Burst` | 12 | medium | sharp |
| Soft burst | `SoftBurst` | 12 | medium | smooth |
| Boom | `Boom` | 14 | high | sharp |
| Soft boom | `SoftBoom` | 14 | high | smooth |
| Flower | `Flower` | 10 | medium | smooth |

Eight aliases over one `RadialWave` class.

### C.5 Clovers (parametric multi-lobed petals)

Closed curve with `N` deep lobes (concave cusps between). Single class
`Clover` / `CloverGeometry` parameterized by `Leaves` (4 or 8 named in
M3, but supports any even count).

| Shape | M3 name | Leaves |
| --- | --- | --- |
| 4-leaf clover | `FourLeafClover` | 4 |
| 8-leaf clover | `EightLeafClover` | 8 |

### C.6 Puffy / pillow shapes (rounded bumps on a square)

Square with each edge bumped outward by a half-circle. Single class
`Puffy` / `PuffyGeometry` parameterized by `BumpsPerSide` (default 2)
and underlying shape (square vs diamond).

| Shape | M3 name | BumpsPerSide | Base |
| --- | --- | --- | --- |
| Puffy | `Puffy` | 2 | Square |
| Puffy diamond | `PuffyDiamond` | 2 | Diamond (45°-rotated Puffy) |

### C.7 Special / character glyphs (one-off hand-tuned paths)

Iconic shapes — no parameters, just a fixed path.

| Shape | M3 name | Implementation notes |
| --- | --- | --- |
| Ghost-ish | `Ghostish` | Pill with a scalloped bottom edge. Direct path. |
| Bun | `Bun` | Symmetric horizontal squash (two stacked humps). Direct path. |
| Heart | `Heart` | Classic heart silhouette. Direct path — use cubic Béziers. |

### C.8 Pixel-art shapes (rasterized polygons)

Constructed from axis-aligned unit squares — same "stair-step" look as
8-bit sprites. Single class `PixelShape` / `PixelGeometry`,
parameterized by the underlying source shape + a grid resolution.

| Shape | M3 name | Source | Notes |
| --- | --- | --- | --- |
| Pixel circle | `PixelCircle` | Circle | Bresenham-style discretization at the configured grid size. |
| Pixel triangle | `PixelTriangle` | Triangle | Same — DDA-style rasterization. |

### C.9 Totals + roll-up

- **35 M3 shape variants** → **~18 µ-mural classes** after parametric
  consolidation.
- Each class extends `Visual`, owns `Fill` / `Stroke` /
  `StrokeThickness` DPs, plus the family-specific parameter DPs
  documented above.
- Geometry math lives in `src/visual-engine/geometry.ts` alongside
  the existing `EllipseGeometry`, `RectangleGeometry`, `LineGeometry`.
- File layout: each shape (and each parametric family) gets its own
  file in [src/basic/shapes/](src/basic/shapes/) — same pattern as
  the existing `ellipse.ts` / `rectangle.ts` / `line.ts`. Aliases
  (e.g. `FourSidedCookie` over `Cookie`) sit at the bottom of the
  parametric class's file.
- Symbol-table entries: bulk-add to
  [src/compiler/symbol-table.ts](src/compiler/symbol-table.ts) under
  the `@visualisation-sub/mural/basic` path so `.mu` consumers can
  drop them straight in.
- Demo: one consolidated `demo/demos/shapes/` page rendering the
  whole catalogue in the 5×7 grid layout from the M3 reference image.

### ~~C.10 Sequencing~~ ✅ ALL 4 SLOTS SHIPPED

Slots between Phases 4 and 5 of the main plan (after Cards land, since
Cards consume the basic shape contract; before App bars, which don't
depend on shape work). Single phase, ~3-4 focused commits:

1. ~~**C.S1** — Round / rectangular base + architectural shapes (C.1 + C.2). Includes `SquircleGeometry`, `PillGeometry`, and the hand-tuned architectural paths.~~ ✅ shipped — 8 shapes (Squircle, Pill, Arch, Semicircle, Triangle, Arrow, Fan, Clamshell). Deviation: inline PathGeometry per Arc precedent rather than per-shape Geometry subclasses.
2. ~~**C.S2** — Parametric polygon families (C.3 cookies + C.5 clovers).~~ ✅ shipped — 13 shapes (Cookie + 5 N-sided aliases + Diamond / Pentagon / Gem; Clover + FourLeafClover / EightLeafClover; Slanted promoted up from C.1).
3. ~~**C.S3** — Parametric radial-wave family (C.4 sunny/burst/boom/flower).~~ ✅ shipped — 7 shapes (RadialWave + Sunny / VerySunny / Burst / SoftBurst / Boom / SoftBoom / Flower).
4. ~~**C.S4** — Puffy, special-glyph paths, and pixel rasterization (C.6 + C.7 + C.8) plus the consolidated demo.~~ ✅ shipped — 7 shapes (Puffy + PuffyDiamond, Heart, Bun, Ghostish, PixelArt + PixelCircle + PixelTriangle) + consolidated [demo/demos/shapes/](demo/demos/shapes/) page with all 35 cells live.
