# Material 3 Tokens — Reference Catalogue

Pulled from `material3/` (Google's official DSP export for the
Material 3 baseline theme). Eight token families:

1. [Reference palette](#1-reference-palette) — 80 raw colour stops
2. [System color (light)](#2-system-color--light-scheme) — 30 semantic roles
3. [System color (dark)](#3-system-color--dark-scheme) — same roles, dark mapping
4. [Shape](#4-shape) — corner radii
5. [State layers](#5-state-layers) — interaction overlay opacities
6. [Elevation](#6-elevation) — shadow z-levels
7. [Motion](#7-motion) — durations + easing curves
8. [Typography](#8-typography) — typescale + typefaces + weights

Token naming follows the official scheme — `md.<tier>.<group>.<name>`
where `<tier>` is `ref` (raw values) or `sys` (semantic roles). The CSS
custom-property form swaps `.` for `-`: `md.sys.color.primary` →
`--md-sys-color-primary`.

Source files (under `material3/css/`): `palette.css`, `theme/light.css`,
`theme/dark.css`, `shape.css`, `state.css`, `elevation.css`,
`motion.css`, `typography.css`.

µ-mural's `src/resources/material/` bundle is a curated subset of these —
see `material.mu`'s `tokens { … }` catalogue for the tokens currently
exposed at runtime.

---

## 1. Reference palette

Raw tonal palettes — 13 stops per family, from 0 (pure black) through
100 (pure white). The system-color roles below pick one stop per family
per scheme. Values are sRGB with an opaque alpha (`ff`).

### 1.1 Primary

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.palette.primary0`   | `#000000ff` | Primary 0 — pure black |
| `md.ref.palette.primary10`  | `#21005dff` | Primary 10 |
| `md.ref.palette.primary20`  | `#381e72ff` | Primary 20 |
| `md.ref.palette.primary30`  | `#4f378bff` | Primary 30 — Dark scheme container |
| `md.ref.palette.primary40`  | `#6750a4ff` | Primary 40 — Light scheme primary |
| `md.ref.palette.primary50`  | `#7f67beff` | Primary 50 |
| `md.ref.palette.primary60`  | `#9a82dbff` | Primary 60 |
| `md.ref.palette.primary70`  | `#b69df8ff` | Primary 70 |
| `md.ref.palette.primary80`  | `#d0bcffff` | Primary 80 — Dark scheme primary |
| `md.ref.palette.primary90`  | `#eaddffff` | Primary 90 — Light scheme container |
| `md.ref.palette.primary95`  | `#f6edffff` | Primary 95 |
| `md.ref.palette.primary99`  | `#fffbfeff` | Primary 99 |
| `md.ref.palette.primary100` | `#ffffffff` | Primary 100 — pure white |

### 1.2 Secondary

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.palette.secondary0`   | `#000000ff` | Secondary 0 |
| `md.ref.palette.secondary10`  | `#1d192bff` | Secondary 10 |
| `md.ref.palette.secondary20`  | `#332d41ff` | Secondary 20 |
| `md.ref.palette.secondary30`  | `#4a4458ff` | Secondary 30 — Dark scheme container |
| `md.ref.palette.secondary40`  | `#625b71ff` | Secondary 40 — Light scheme secondary |
| `md.ref.palette.secondary50`  | `#7a7289ff` | Secondary 50 |
| `md.ref.palette.secondary60`  | `#958da5ff` | Secondary 60 |
| `md.ref.palette.secondary70`  | `#b0a7c0ff` | Secondary 70 |
| `md.ref.palette.secondary80`  | `#ccc2dcff` | Secondary 80 — Dark scheme secondary |
| `md.ref.palette.secondary90`  | `#e8def8ff` | Secondary 90 — Light scheme container |
| `md.ref.palette.secondary95`  | `#f6edffff` | Secondary 95 |
| `md.ref.palette.secondary99`  | `#fffbfeff` | Secondary 99 |
| `md.ref.palette.secondary100` | `#ffffffff` | Secondary 100 |

### 1.3 Tertiary

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.palette.tertiary0`   | `#000000ff` | Tertiary 0 |
| `md.ref.palette.tertiary10`  | `#31111dff` | Tertiary 10 |
| `md.ref.palette.tertiary20`  | `#492532ff` | Tertiary 20 |
| `md.ref.palette.tertiary30`  | `#633b48ff` | Tertiary 30 — Dark scheme container |
| `md.ref.palette.tertiary40`  | `#7d5260ff` | Tertiary 40 — Light scheme tertiary |
| `md.ref.palette.tertiary50`  | `#986977ff` | Tertiary 50 |
| `md.ref.palette.tertiary60`  | `#b58392ff` | Tertiary 60 |
| `md.ref.palette.tertiary70`  | `#d29dacff` | Tertiary 70 |
| `md.ref.palette.tertiary80`  | `#efb8c8ff` | Tertiary 80 — Dark scheme tertiary |
| `md.ref.palette.tertiary90`  | `#ffd8e4ff` | Tertiary 90 — Light scheme container |
| `md.ref.palette.tertiary95`  | `#ffecf1ff` | Tertiary 95 |
| `md.ref.palette.tertiary99`  | `#fffbfaff` | Tertiary 99 |
| `md.ref.palette.tertiary100` | `#ffffffff` | Tertiary 100 |

### 1.4 Neutral

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.palette.neutral0`   | `#000000ff` | Neutral 0 — Shadow |
| `md.ref.palette.neutral10`  | `#1c1b1fff` | Neutral 10 — Dark scheme surface / background / on-* |
| `md.ref.palette.neutral20`  | `#313033ff` | Neutral 20 — Light scheme inverse-surface |
| `md.ref.palette.neutral30`  | `#484649ff` | Neutral 30 |
| `md.ref.palette.neutral40`  | `#605d62ff` | Neutral 40 |
| `md.ref.palette.neutral50`  | `#787579ff` | Neutral 50 |
| `md.ref.palette.neutral60`  | `#939094ff` | Neutral 60 — Dark scheme outline |
| `md.ref.palette.neutral70`  | `#aeaaaeff` | Neutral 70 |
| `md.ref.palette.neutral80`  | `#c9c5caff` | Neutral 80 |
| `md.ref.palette.neutral90`  | `#e6e1e5ff` | Neutral 90 — Dark scheme on-* / inverse-surface |
| `md.ref.palette.neutral95`  | `#f4eff4ff` | Neutral 95 — Light scheme inverse-on-surface |
| `md.ref.palette.neutral99`  | `#fffbfeff` | Neutral 99 — Light scheme surface / background |
| `md.ref.palette.neutral100` | `#ffffffff` | Neutral 100 |

### 1.5 Neutral Variant

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.palette.neutral-variant0`   | `#000000ff` | Neutral Variant 0 |
| `md.ref.palette.neutral-variant10`  | `#1d1a22ff` | Neutral Variant 10 |
| `md.ref.palette.neutral-variant20`  | `#322f37ff` | Neutral Variant 20 |
| `md.ref.palette.neutral-variant30`  | `#49454fff` | Neutral Variant 30 — Light on-surface-variant / Dark surface-variant |
| `md.ref.palette.neutral-variant40`  | `#605d66ff` | Neutral Variant 40 |
| `md.ref.palette.neutral-variant50`  | `#79747eff` | Neutral Variant 50 — Light outline |
| `md.ref.palette.neutral-variant60`  | `#938f99ff` | Neutral Variant 60 |
| `md.ref.palette.neutral-variant70`  | `#aea9b4ff` | Neutral Variant 70 |
| `md.ref.palette.neutral-variant80`  | `#cac4d0ff` | Neutral Variant 80 — Dark on-surface-variant |
| `md.ref.palette.neutral-variant90`  | `#e7e0ecff` | Neutral Variant 90 — Light surface-variant |
| `md.ref.palette.neutral-variant95`  | `#f5eefaff` | Neutral Variant 95 |
| `md.ref.palette.neutral-variant99`  | `#fffbfeff` | Neutral Variant 99 |
| `md.ref.palette.neutral-variant100` | `#ffffffff` | Neutral Variant 100 |

### 1.6 Error

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.palette.error0`   | `#000000ff` | Error 0 |
| `md.ref.palette.error10`  | `#410e0bff` | Error 10 — Light scheme on-error-container |
| `md.ref.palette.error20`  | `#601410ff` | Error 20 — Dark scheme on-error |
| `md.ref.palette.error30`  | `#8c1d18ff` | Error 30 — Dark scheme error-container |
| `md.ref.palette.error40`  | `#b3261eff` | Error 40 — Light scheme error |
| `md.ref.palette.error50`  | `#dc362eff` | Error 50 |
| `md.ref.palette.error60`  | `#e46962ff` | Error 60 |
| `md.ref.palette.error70`  | `#ec928eff` | Error 70 |
| `md.ref.palette.error80`  | `#f2b8b5ff` | Error 80 — Dark scheme error / on-error-container |
| `md.ref.palette.error90`  | `#f9dedcff` | Error 90 — Light scheme error-container |
| `md.ref.palette.error95`  | `#fceeeeff` | Error 95 |
| `md.ref.palette.error99`  | `#fffbf9ff` | Error 99 |
| `md.ref.palette.error100` | `#ffffffff` | Error 100 — Light scheme on-error |

### 1.7 Constants

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.palette.black` | `#000000ff` | Pure black |
| `md.ref.palette.white` | `#ffffffff` | Pure white |

---

## 2. System color — Light scheme

Semantic roles for the M3 light scheme. The "Value" column shows the
reference-palette stop the role resolves to, plus the literal sRGB.

| Role | Reference | Value | Description |
| --- | --- | --- | --- |
| `md.sys.color.primary`                  | `primary40`               | `#6750a4` | Brand primary. Foreground actions, FAB. |
| `md.sys.color.on-primary`               | `primary100`              | `#ffffff` | Text / icon over `primary`. |
| `md.sys.color.primary-container`        | `primary90`               | `#eaddff` | Subtle brand surfaces (filled tonal buttons, chips). |
| `md.sys.color.on-primary-container`     | `primary10`               | `#21005d` | Text / icon over `primary-container`. |
| `md.sys.color.secondary`                | `secondary40`             | `#625b71` | Secondary actions, navigation tints. |
| `md.sys.color.on-secondary`             | `secondary100`            | `#ffffff` | Text / icon over `secondary`. |
| `md.sys.color.secondary-container`      | `secondary90`             | `#e8def8` | Selected chip / nav-rail backgrounds. |
| `md.sys.color.on-secondary-container`   | `secondary10`             | `#1d192b` | Text / icon over `secondary-container`. |
| `md.sys.color.tertiary`                 | `tertiary40`              | `#7d5260` | Complementary accent. |
| `md.sys.color.on-tertiary`              | `tertiary100`             | `#ffffff` | Text / icon over `tertiary`. |
| `md.sys.color.tertiary-container`       | `tertiary90`              | `#ffd8e4` | Tertiary container surfaces. |
| `md.sys.color.on-tertiary-container`    | `tertiary10`              | `#31111d` | Text / icon over `tertiary-container`. |
| `md.sys.color.error`                    | `error40`                 | `#b3261e` | Error text / icon. |
| `md.sys.color.on-error`                 | `error100`                | `#ffffff` | Text / icon over `error`. |
| `md.sys.color.error-container`          | `error90`                 | `#f9dedc` | Filled error chrome (banners, snackbars). |
| `md.sys.color.on-error-container`       | `error10`                 | `#410e0b` | Text / icon over `error-container`. |
| `md.sys.color.background`               | `neutral99`               | `#fffbfe` | App background. |
| `md.sys.color.on-background`            | `neutral10`               | `#1c1b1f` | Text / icon over `background`. |
| `md.sys.color.surface`                  | `neutral99`               | `#fffbfe` | Default container surface (cards, sheets). |
| `md.sys.color.on-surface`               | `neutral10`               | `#1c1b1f` | Primary text / icon over `surface`. |
| `md.sys.color.surface-variant`          | `neutral-variant90`       | `#e7e0ec` | Subtle surface variant (rails, divider beds). |
| `md.sys.color.on-surface-variant`       | `neutral-variant30`       | `#49454f` | Lower-emphasis text over `surface` / `surface-variant`. |
| `md.sys.color.outline`                  | `neutral-variant50`       | `#79747e` | 1-DP outlines, dividers. |
| `md.sys.color.shadow`                   | `neutral0`                | `#000000` | Drop-shadow tint. |
| `md.sys.color.inverse-surface`          | `neutral20`               | `#313033` | Snackbar / inverted overlay surface. |
| `md.sys.color.inverse-on-surface`       | `neutral95`               | `#f4eff4` | Text / icon over `inverse-surface`. |
| `md.sys.color.inverse-primary`          | `primary80`               | `#d0bcff` | Brand tint inside inverse-surface chrome. |
| `md.sys.color.surface-tint`             | → `primary`               | `#6750a4` | Elevation tint applied to `surface` at higher z-levels. |
| `md.sys.color.surface-tint-color`       | → `primary`               | `#6750a4` | Alias of `surface-tint` (legacy DSP slot). |

---

## 3. System color — Dark scheme

Same semantic roles, dark-mode mapping.

| Role | Reference | Value | Description |
| --- | --- | --- | --- |
| `md.sys.color.primary`                  | `primary80`               | `#d0bcff` | Brand primary (lighter so it carries on dark). |
| `md.sys.color.on-primary`               | `primary20`               | `#381e72` | Text / icon over `primary`. |
| `md.sys.color.primary-container`        | `primary30`               | `#4f378b` | Tonal brand surfaces. |
| `md.sys.color.on-primary-container`     | `primary90`               | `#eaddff` | Text / icon over `primary-container`. |
| `md.sys.color.secondary`                | `secondary80`             | `#ccc2dc` | Secondary actions. |
| `md.sys.color.on-secondary`             | `secondary20`             | `#332d41` | Text / icon over `secondary`. |
| `md.sys.color.secondary-container`      | `secondary30`             | `#4a4458` | Selected chip / nav-rail backgrounds. |
| `md.sys.color.on-secondary-container`   | `secondary90`             | `#e8def8` | Text / icon over `secondary-container`. |
| `md.sys.color.tertiary`                 | `tertiary80`              | `#efb8c8` | Complementary accent. |
| `md.sys.color.on-tertiary`              | `tertiary20`              | `#492532` | Text / icon over `tertiary`. |
| `md.sys.color.tertiary-container`       | `tertiary30`              | `#633b48` | Tertiary container surfaces. |
| `md.sys.color.on-tertiary-container`    | `tertiary90`              | `#ffd8e4` | Text / icon over `tertiary-container`. |
| `md.sys.color.error`                    | `error80`                 | `#f2b8b5` | Error text / icon. |
| `md.sys.color.on-error`                 | `error20`                 | `#601410` | Text / icon over `error`. |
| `md.sys.color.error-container`          | `error30`                 | `#8c1d18` | Filled error chrome. |
| `md.sys.color.on-error-container`       | `error80`                 | `#f2b8b5` | Text / icon over `error-container`. |
| `md.sys.color.background`               | `neutral10`               | `#1c1b1f` | App background. |
| `md.sys.color.on-background`            | `neutral90`               | `#e6e1e5` | Text / icon over `background`. |
| `md.sys.color.surface`                  | `neutral10`               | `#1c1b1f` | Default container surface. |
| `md.sys.color.on-surface`               | `neutral90`               | `#e6e1e5` | Primary text / icon over `surface`. |
| `md.sys.color.surface-variant`          | `neutral-variant30`       | `#49454f` | Subtle surface variant. |
| `md.sys.color.on-surface-variant`       | `neutral-variant80`       | `#cac4d0` | Lower-emphasis text over `surface` / `surface-variant`. |
| `md.sys.color.outline`                  | `neutral60`               | `#939094` | 1-DP outlines, dividers. |
| `md.sys.color.shadow`                   | `neutral0`                | `#000000` | Drop-shadow tint (same value as light). |
| `md.sys.color.inverse-surface`          | `neutral90`               | `#e6e1e5` | Inverted overlay surface (now light). |
| `md.sys.color.inverse-on-surface`       | `neutral20`               | `#313033` | Text / icon over `inverse-surface`. |
| `md.sys.color.inverse-primary`          | `primary40`               | `#6750a4` | Brand tint inside inverse-surface chrome. |
| `md.sys.color.surface-tint`             | → `primary`               | `#d0bcff` | Elevation tint at higher z-levels. |
| `md.sys.color.surface-tint-color`       | → `primary`               | `#d0bcff` | Alias of `surface-tint` (legacy DSP slot). |

---

## 4. Shape

Corner-radius tokens. Most sizes are uniform across all four corners
(`default-size`); a handful (`*-top`, `*-end`) round only two corners
for connected-bar / sheet / FAB shapes.

| Token | Value | Description |
| --- | --- | --- |
| `md.sys.shape.corner.none.default-size`           | `0px`  | No rounding. |
| `md.sys.shape.corner.extra-small.default-size`    | `4px`  | Extra small uniform. |
| `md.sys.shape.corner.extra-small-top.top-left`    | `4px`  | Extra small — top-left only. |
| `md.sys.shape.corner.extra-small-top.top-right`   | `4px`  | Extra small — top-right only. |
| `md.sys.shape.corner.small.default-size`          | `8px`  | Small uniform — chips, dense surfaces. |
| `md.sys.shape.corner.medium.default-size`         | `12px` | Medium uniform — cards. |
| `md.sys.shape.corner.large.default-size`          | `16px` | Large uniform — sheets, navigation panels. |
| `md.sys.shape.corner.large-top.top-left`          | `16px` | Large — top-left only (sheets dragged up from bottom). |
| `md.sys.shape.corner.large-top.top-right`         | `16px` | Large — top-right only. |
| `md.sys.shape.corner.large-end.top-right`         | `16px` | Large — top-right only (end-aligned, RTL-aware). |
| `md.sys.shape.corner.large-end.bottom-right`      | `16px` | Large — bottom-right only. |
| `md.sys.shape.corner.extra-large.default-size`    | `28px` | Extra large uniform — dialogs. |
| `md.sys.shape.corner.extra-large-top.top-left`    | `28px` | Extra large — top-left only. |
| `md.sys.shape.corner.extra-large-top.top-right`   | `28px` | Extra large — top-right only. |
| `md.sys.shape.corner.full`                        | family `3px` | Fully rounded (pill / FAB). Family marker — radius is clamped at runtime to `min(W,H)/2`. |
| `md.sys.shape.small`                              | → `corner.small.default-size`  = `8px`  | Alias. |
| `md.sys.shape.medium`                             | → `corner.medium.default-size` = `12px` | Alias. |
| `md.sys.shape.large`                              | → `corner.large.default-size`  = `16px` | Alias. |

---

## 5. State layers

Opacities for the M3 "state layer" — a translucent overlay painted
on top of an interactive surface to indicate hover / focus / press /
drag. The overlay's colour is typically `on-surface` (or a role-
specific equivalent); only the alpha lives here.

| Token | Value | Description |
| --- | --- | --- |
| `md.sys.state.hover-state-layer-opacity`   | `0.08` | Hover overlay alpha (8%). |
| `md.sys.state.focus-state-layer-opacity`   | `0.12` | Focus overlay alpha (12%). |
| `md.sys.state.pressed-state-layer-opacity` | `0.12` | Pressed overlay alpha (12%). |
| `md.sys.state.dragged-state-layer-opacity` | `0.16` | Dragged overlay alpha (16%). |

(JSON values store full float precision: `0.08 ≈ 0.07999999821186066`,
`0.12 ≈ 0.11999999731779099`, `0.16 ≈ 0.1599999964237213`.)

---

## 6. Elevation

Z-levels mapped to a single dp value. The CSS template uses the value
as a `box-shadow` blur-radius proxy — the M3 spec actually layers two
shadows per level, but the DSP exports the simplified value here.

| Token | Value | Description |
| --- | --- | --- |
| `md.sys.elevation.level0` | `0px`  | Resting / flat. |
| `md.sys.elevation.level1` | `1px`  | +1 — text buttons, search bars. |
| `md.sys.elevation.level2` | `3px`  | +2 — cards, raised popups. |
| `md.sys.elevation.level3` | `6px`  | +3 — FAB, app bars. |
| `md.sys.elevation.level4` | `8px`  | +4 — navigation drawers. |
| `md.sys.elevation.level5` | `12px` | +5 — dialogs, modal sheets. |
| `md.sys.elevation.surface-tint-color` | → `md.sys.color.primary` | Tint composited on `surface` at level > 0. |

---

## 7. Motion

### 7.1 Durations

| Token | Value | Description |
| --- | --- | --- |
| `md.sys.motion.duration-50`   | `50ms`   | Micro — chip taps. |
| `md.sys.motion.duration-100`  | `100ms`  | Quick fade. |
| `md.sys.motion.duration-150`  | `150ms`  | Snackbar appear. |
| `md.sys.motion.duration-200`  | `200ms`  | Standard fade-in. |
| `md.sys.motion.duration-250`  | `250ms`  | Standard transitions. |
| `md.sys.motion.duration-300`  | `300ms`  | Container transform (short axis). |
| `md.sys.motion.duration-350`  | `350ms`  | Container transform (long axis). |
| `md.sys.motion.duration-400`  | `400ms`  | Hero transition (short). |
| `md.sys.motion.duration-450`  | `450ms`  | Hero transition (medium). |
| `md.sys.motion.duration-500`  | `500ms`  | Hero transition (long). |
| `md.sys.motion.duration-550`  | `550ms`  | Extra-long transitions. |
| `md.sys.motion.duration-600`  | `600ms`  | Extra-long transitions. |
| `md.sys.motion.duration-700`  | `700ms`  | Extra-long transitions. |
| `md.sys.motion.duration-800`  | `800ms`  | Extra-long transitions. |
| `md.sys.motion.duration-900`  | `900ms`  | Extra-long transitions. |
| `md.sys.motion.duration-1000` | `1000ms` | Extra-long transitions. |

### 7.2 Easing

Each easing is exported as four control points `(x0, y0, x1, y1)` for a
cubic Bézier. Approximated values shown — full float precision lives in
the CSS / JSON exports.

| Token | Bézier `(x0, y0, x1, y1)` | Description |
| --- | --- | --- |
| `md.sys.motion.easing.linear`                  | `(0, 0, 1, 1)`         | Linear (constant velocity). |
| `md.sys.motion.easing.standard`                | `(0.2, 0, 0, 1)`       | Standard — in-and-out, default for most transitions. |
| `md.sys.motion.easing.standard-accelerate`     | `(0.3, 0, 1, 1)`       | Standard accelerate — element leaving the screen. |
| `md.sys.motion.easing.standard-decelerate`     | `(0, 0, 0, 1)`         | Standard decelerate — element entering the screen. |
| `md.sys.motion.easing.emphasized`              | `(0.2, 0, 0, 1)`       | Emphasized — large container transforms. |
| `md.sys.motion.easing.emphasized-accelerate`   | `(0.3, 0, 0.8, 0.15)`  | Emphasized accelerate — element leaving with emphasis. |
| `md.sys.motion.easing.emphasized-decelerate`   | `(0.05, 0.7, 0.1, 1)`  | Emphasized decelerate — element entering with emphasis. |
| `md.sys.motion.path.standard-path` | `1` (family marker) | Standard motion path family marker (not a numeric value). |

---

## 8. Typography

### 8.1 Typescale

15 roles in 5 families × 3 sizes. Each role declares font, weight,
size, line-height, tracking (letter-spacing), font-style,
text-decoration, text-transform — only the meaningful values are
listed below.

| Role | Font | Weight | Size | Line height | Tracking | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `display-large`    | brand | regular (400) | `57px` | `64px` | `-0.25px` | Largest hero text. |
| `display-medium`   | brand | regular (400) | `45px` | `52px` | `0px`     | Medium hero text. |
| `display-small`    | brand | regular (400) | `36px` | `44px` | `0px`     | Small hero text. |
| `headline-large`   | brand | regular (400) | `32px` | `40px` | `0px`     | Top-of-page section heading. |
| `headline-medium`  | brand | regular (400) | `28px` | `36px` | `0px`     | Mid-page section heading. |
| `headline-small`   | brand | regular (400) | `24px` | `32px` | `0px`     | Sub-section heading. |
| `title-large`      | brand | regular (400) | `22px` | `28px` | `0px`     | Card title, dialog title. |
| `title-medium`     | plain | medium (500)  | `16px` | `24px` | `0.15px`  | List subheader, app-bar title. |
| `title-small`      | plain | medium (500)  | `14px` | `20px` | `0.1px`   | Compact title. |
| `body-large`       | plain | regular (400) | `16px` | `24px` | `0.5px`   | Default body copy. |
| `body-medium`      | plain | regular (400) | `14px` | `20px` | `0.25px`  | Secondary body copy. |
| `body-small`       | plain | regular (400) | `12px` | `16px` | `0.4px`   | Captions, helper text. |
| `label-large`      | plain | medium (500)  | `14px` | `20px` | `0.1px`   | Button label, tab label. |
| `label-medium`     | plain | medium (500)  | `12px` | `16px` | `0.5px`   | Smaller button / chip label. CSS exports `text-transform: 1` family marker (uppercase emphasis). |
| `label-small`      | plain | medium (500)  | `11px` | `16px` | `0.5px`   | Smallest label. |

Token slots per role: `md.sys.typescale.<role>-font`,
`-weight`, `-size`, `-line-height`, `-tracking`, `-font-style`,
`-text-decoration`, `-text-transform`. Unused slots are exported as
`unset`.

### 8.2 Typefaces (reference)

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.typeface.brand` | `Roboto` | Brand typeface — display / headline / title-large. |
| `md.ref.typeface.plain` | `Roboto` | Plain typeface — title-medium / smaller, body, label. |

### 8.3 Weights (reference)

| Token | Value | Description |
| --- | --- | --- |
| `md.ref.typeface.weight.regular` | `400` | Regular body weight. |
| `md.ref.typeface.weight.medium`  | `500` | Medium emphasis. |
| `md.ref.typeface.weight.bold`    | `700` | Bold emphasis. |
