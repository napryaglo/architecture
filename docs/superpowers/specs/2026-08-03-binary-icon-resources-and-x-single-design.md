# Binary (PNG) Icon Resources + `x:single` Directive (Design)

**Date:** 2026-08-03
**Status:** ✅ Finished (Approved; pending spec review)
**Repo:** Mural (this is SP1 — the framework foundation). SP2 (Plexus consumers)
is a separate spec, built after this ships.

## Goal

Let mural author icons backed by **raster images (PNG/JPEG/…)**, not just SVG,
by extending the build-time `include` pipeline to emit an `ImageBrush` resource
from an image file. Binary payloads are **singletons** (one shared instance
across every `ResourceDictionary.Clone()`), emitted once as a module-level
`const` **packed into the single compiled `.mu.js`** — never a separate file —
so the base64 is evaluated once and stays out of `Clone()`. Add a general
`x:single` markup directive so an author can mark *any* self-contained resource
as a shared singleton — the mechanism binaries use implicitly.

Consuming the new resource (rendering a PNG icon on a node, a panel, etc.) is
**out of scope** here — that is SP2 in Plexus. This spec delivers only the
framework capability: `include "x.png"` produces a usable, shared `@Key`
`ImageBrush`, and `x:single` produces shared non-binary resources.

## Background — how it works today

- **`include` pipeline** (`src/tooling/include-resolver.ts`). The compiler's
  `include` keyword delegates to a resolver that reads a file and returns
  `{ entries: [{key, valueJs}], imports }`. Today it accepts **only `.svg`**
  (throws otherwise), dispatching `colored` → `svgToIconJs` (an `Icon` drawing)
  or plain → `svgToGeometryJs` (a `Geometry`). Both emit `valueJs` — a JS
  constructor expression — inlined into the dictionary's `Clone()`.
- **Resource-dictionary codegen** (`src/compiler/compiler.ts`,
  `compileResourcesBlock`). A `resources NAME { … }` block compiles to
  `export class NAME extends ResourceDictionary` with a `static Clone()` that
  builds a **fresh** instance every call: for each entry it emits
  `const _incN = <valueJs>; t.Set("Key", _incN);`. So every clone reconstructs
  every resource — correct for mutable/vector resources, wasteful for large
  immutable binaries.
- **Rendering.** The visual engine already rasterises an `ImageBrush` fill:
  `svg-dom-drawing-context.materializeImagePattern` turns it into an SVG
  `<pattern>`+`<image href=dataURI>` (cached by `href::fit`) used as a
  geometry's fill. So a rectangle (`Border` background or `Shape` fill) filled
  with an `ImageBrush` renders the image, fit to its bounds — no `Image`
  element, no new rendering code.
- **`Icon` is vector-only.** `IconDefinition`/`IconShape` hold geometry + a
  `Color`/`CURRENT_COLOR` paint — no raster slot. A PNG therefore cannot flow
  through the `Icon` element; it renders as a brush-filled rectangle instead.
- **`x:` directives.** Resource forms read leading directives via
  `parseLeadingXAttrs()` (`x:key`, `x:root`, …). `include` parses a leading
  `colored` modifier in `parseIncludeForm()`.

## Design

### 1. Raster `include` → `ImageBrush`

Extend `include-resolver.ts` to accept raster extensions:
`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`. For a raster match:

1. Read the file as bytes (`readFileSync`, no encoding).
2. Build a data-URI: `data:<mime>;base64,<bytes.toString('base64')>`, `<mime>`
   from the extension (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
3. Emit the resource value `new ImageBrush(new BitmapImage("<dataURI>"))`,
   importing `ImageBrush` and `BitmapImage` from
   `@pragmatic-tech-ai/mural/visual-engine`.

No size guard — any size embeds. The SVG branch is unchanged. A genuinely
unsupported extension (e.g. `.txt`) still throws the existing clear error.

A raster entry is flagged **binary** so downstream codegen emits it as a
module-level singleton (see §3). `colored` is meaningless for raster and is
ignored (or a warning) when combined.

### 2. `x:single` — a general singleton directive

`x:single` is a boolean markup directive marking a resource as a **module-scope
singleton**: emitted once as a top-level `const`, referenced (not rebuilt) by
every `Clone()`.

- **Block resources** — read in `parseLeadingXAttrs()` alongside `x:key`
  (`ImageBrush x:key="Logo" x:single [ … ]`,
  `SolidColorBrush x:key="Accent" x:single [ … ]`). A resource must be keyed to
  be a singleton; `x:single` without a resolvable key is a compile error.
- **`include`** — a leading modifier in `parseIncludeForm()`, composable with
  `colored`: `include x:single "icons/logo.png" as Logo`.

**Self-contained constraint.** Module-scope hoisting only works when the
resource's emitted JS does not reference per-clone context — no
`DynamicResource(_t, …)`, no templated-parent/`_ctx` binding. Image brushes
with a literal data-URI, solid brushes, geometries, etc. are self-contained.
The compiler **rejects `x:single` on a context-dependent value** with a clear
error naming the offending resource. (Detection: the value emitter already
knows when it produces a context/`DynamicResource` reference; surface that as a
"not hoistable" flag the `x:single` path checks.)

**AST.** `IncludeForm` gains `single: boolean`; resource-form nodes gain a
`single: boolean` derived from the parsed `x:` directives.

### 3. Singletons are module-level consts, packed into the single module

Both binary and `x:single` resources produce a **singleton referenced by
`Clone()`** — a top-level `const` in the dictionary's compiled `.mu.js` module,
constructed once and referenced (never rebuilt) on every clone. **No separate
companion file is emitted.** The compiler already produces one JS module per
`.mu`; singletons live at its top, and the app's bundler packs the whole import
graph into the final single JS anyway.

```js
// top of NAME.mu.js — one const per singleton, evaluated once
import { ImageBrush, BitmapImage } from "@pragmatic-tech-ai/mural/visual-engine";
const _single_Logo   = new ImageBrush(new BitmapImage("data:image/png;base64,…")); // binary ⇒ implicit
const _single_Accent = new SolidColorBrush(Color.FromHex('#ff0000'));              // x:single

export class NAME extends ResourceDictionary {
    // …
    static Clone() {
        const t = new NAME(_gate_NAME);
        // …merges + normal (copy-per-Clone) entries…
        t.Set("Logo",   _single_Logo);    // reference, not `new`
        t.Set("Accent", _single_Accent);  // reference, not `new`
        return t;
    }
}
```

Binaries are singletons **without** the author writing `x:single`; `x:single` is
the explicit marker for everything else. The two are identical at the emit
level — a module-top `const` plus a `Clone()` reference — differing only in that
binary is implicit and its value is a base64 `ImageBrush`.

**Organising assets into their own dictionary = the existing `merge`.** If an
author wants binary assets grouped separately, they declare a normal
`resources Assets { include x:single "…png" as Logo }` and `import`/`merge` it
into the consuming dictionary — no new machinery. `merge` folds entries via
`Assets.Clone().Entries()`; because `Assets`' binaries are module-level
singletons, its `Clone()` hands back **references**, so the merge copies the
shared instances, not fresh copies. The singleton survives the merge, and the
bundler packs `Assets`' module into the same final JS. So "companion
dictionaries" are just ordinary merged dictionaries — never separate files in
the final compilation.

**Codegen changes (`compileResourcesBlock`).**
- The internal resource-entry representation (and `IncludeResolution`) gains,
  per singleton entry, a **module-level declaration** (`const _single_Key = …`)
  and a **`Clone()` reference expression** (`_single_Key`) distinct from today's
  inline `valueJs`.
- `compileResourcesBlock` emits the `const _single_*` declarations at module
  scope (before the class), and a `Clone()` body that uses the reference for
  singleton entries and the existing inline `const _incN = …; t.Set(…)` for
  normal (copy-per-clone) entries.
- No CLI change — output is still one `.mu.js` per `.mu` (plus its existing
  `.d.ts`).

Emission stays **deterministic** (stable key + declaration order) so builds are
reproducible.

### 4. Consumer contract (bridge to SP2)

`@Key` for a raster include resolves to an `ImageBrush`. A PNG icon renders as a
rectangle filled by it — `Border [ Width=…, Height=…, Background=@Key ]` (or a
`Shape` with a `RectangleGeometry` and `Fill=@Key`). Vector icons are unchanged
(`Shape [ Geometry=@Key, Fill=@brush ]`). Selection between the two is by the
source file's extension, decided in SP2's consumers. Raster icons are **not
theme-tinted** (the brush paints real pixels) — inherent and expected for logos.

**Shared-singleton caveat (documented).** Because a binary/`x:single` resource
is one shared instance, per-use visual adjustments (opacity, transform) must be
applied on the **hosting element** (`Border`/`Shape`), never on the shared
brush — mutating the brush affects every use. The engine already dedups the
rendered `<image>` by `href`, so this only tightens the JS/memory side to match.

## Data flow

```
include "logo.png"  ─▶ include-resolver: bytes → base64 data-URI
                     ─▶ ImageBrush(BitmapImage(dataURI))  [binary ⇒ singleton]
compiler codegen    ─▶ NAME.mu.js: top-level const _single_Logo = <brush>
                     ─▶ Clone(): t.Set("Logo", _single_Logo)   // reference, not new
x:single (block)    ─▶ top-level const _single_Key ; Clone(): t.Set(...) reference
merge Assets        ─▶ Assets.Clone().Entries() copies the shared singletons (refs)
bundler             ─▶ every dictionary module packed into one final JS
runtime             ─▶ @Logo == shared ImageBrush ; Border[Background=@Logo] paints PNG
```

## Error handling

- Unsupported include extension (not svg/raster) → existing clear throw.
- No files matched a glob → existing throw.
- `x:single` on a value that needs per-clone context (`DynamicResource`, etc.)
  → compile error naming the resource ("`x:single` resource `<key>` is not
  self-contained: it references dynamic/context resources and cannot be a
  module singleton").
- `x:single` without a resolvable key → compile error.

## Testing

Mural compiler/tooling tests (files in `tests/` subfolders):

- **Resolver:** a `.png` include produces an `ImageBrush(BitmapImage(dataURI))`
  value with the correct mime + base64, and the `ImageBrush`/`BitmapImage`
  imports; a `.txt` include still throws; extension→mime mapping for each
  accepted type.
- **Single-module emit:** a `resources` block with a raster include emits a
  module-level `const _single_<Key> = new ImageBrush(new BitmapImage(…))` and a
  `Clone()` that references it (no inline `new` for that key); output is one
  `.mu.js`, no separate asset file.
- **Singleton identity:** two `Clone()`s of the same dictionary return the
  **same** `ImageBrush` instance for a binary key (referential equality); a
  vector key still returns **distinct** instances per clone.
- **Singleton survives `merge`:** a dictionary that `merge`s another whose
  binary key is a singleton yields the **same** instance as the source
  dictionary's clone (the merge copies the reference, not a new object).
- **`x:single` parse:** parses on a block resource (leading, with `x:key`) and
  on an `include` (leading, composable with `colored`); `IncludeForm.single` /
  resource `single` flags set.
- **`x:single` emit:** a marked self-contained block resource hoists to a
  top-level `const` and `Clone()` references it; two clones share the instance.
- **`x:single` guard:** a marked resource whose value references
  `DynamicResource`/context → compile error; `x:single` without a key → error.
- **Determinism:** compiling the same input twice yields a byte-identical
  output module.

## Ship

Build mural, run the suite, publish to Verdaccio (localhost:4873), bump Plexus's
`@pragmatic-tech-ai/mural` dependency to the new version, and confirm Plexus still
compiles + tests green. Merge to mural `main`.

## Out of scope (SP2 / later)

- Plexus consumers: app-chrome PNG entries, the library runtime loader building
  an `ImageBrush` from bundle bytes, the meta-model presentation generator
  emitting `Border`+`ImageBrush` bodies, and render-by-extension selection.
- A raster-asset size guard (explicitly declined).
- Compositing a vector glyph *over* a PNG (a different feature).

## Decisions (confirmed with user)

- PNG icon = a rectangle filled by an `ImageBrush` — reuse the existing
  Shape/Border + Brush path; no `Image` element, no change to vector `Icon`.
- Raster vs vector chosen **by file extension**.
- Deliver via **extending mural's `include`** (not runtime-only, not a Plexus
  workaround).
- Binary bytes embedded as **base64**; **no size guard**.
- **Any binary/base64 resource is implicitly a singleton** (`Clone()` returns a
  shared reference).
- Add a general **`x:single`** markup directive to mark any self-contained
  resource as a singleton; binaries get it automatically.
- **No separate companion files** in the final compilation — singletons are
  module-level consts packed into the single compiled `.mu.js`; grouping assets
  into their own dictionary uses the existing `import`/`merge`, and the bundler
  packs every module into one final JS.
