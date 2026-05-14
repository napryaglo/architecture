# TypeScript Cheat Sheet — OOP & Collections (SVG)

## Goal

Produce a standalone SVG cheat sheet covering: classes, interfaces, properties,
loops/cycles, expressions, major collections, and enums. It complements the
existing `typescript-cheatsheet.svg` (which covers functions, classes,
interfaces, loops, expressions) without modifying it.

## Output

- **File:** `typescript-cheatsheet-oop.svg` at repo root.
- **Canvas:** ~1280×1200, `viewBox="0 0 1280 1200"`.
- **Theme:** Catppuccin dark, reused verbatim from `typescript-cheatsheet.svg` —
  same `<style>` block and classes (`.bg .panel .title .badge .code .cmt .h1 .sub`),
  same monospace font stack.
- **Self-contained:** no external assets; opens in a browser or imports into Mural.

## Layout

Two columns of rounded panels (`.panel`, `rx="10"`), matching the existing sheet's
geometry.

- **Left column** (x≈20, width≈600): `Classes`, `Properties & Members`, `Enums`
- **Right column** (x≈640, width≈620): `Interfaces`, `Loops & Cycles`,
  `Collections`, `Expressions`

Each panel: a `.title` heading, a divider `<line>`, and a `.code` text block whose
lines are `<tspan>` elements stepping `dy="19"`. Comments use the `.cmt` class.
Panel heights are sized to their content; vertical positions are chosen so panels
in a column do not overlap.

Header: `.h1` "TypeScript Cheat Sheet — OOP & Collections", `.sub` subtitle listing
the seven sections, a horizontal rule. Footer: `.sub` line matching the existing
sheet's style.

## Section contents

- **Classes** — class declaration, constructor, inheritance (`extends`, `super`,
  `override`), `abstract` class + `implements`, generic class.
- **Properties & Members** — access modifiers (`public`/`private`/`protected`),
  `readonly`, optional `?`, `static`, `get`/`set` accessors, parameter properties,
  definite assignment `!`.
- **Enums** — numeric enum, string enum, `const enum`, reverse mapping note.
- **Interfaces** — members, optional/`readonly` members, method signatures,
  `extends`, index signature, `type` alias with union/intersection.
- **Loops & Cycles** — `for`, `for…of`, `for…in`, `while`, `do…while`,
  `break`/`continue`, `.forEach`/`.map`.
- **Collections** — `Array<T>` / `T[]`, tuple, `ReadonlyArray<T>`, `Map<K,V>`,
  `Set<T>`, `Record<K,V>`, common methods.
- **Expressions** — ternary, optional chaining `?.`, nullish `??`, template
  literals, destructuring (object/array), spread, type assertion, type guards,
  logical/comparison operators.

## Constraints

- All `<`, `>`, `&` in code samples must be XML-escaped (`&lt;`, `&gt;`, `&amp;`).
- Code samples must be valid, idiomatic TypeScript.
- Existing `typescript-cheatsheet.svg` is not touched.

## Success criteria

- File is well-formed XML and renders in a browser with no overlapping panels or
  clipped text.
- All seven requested topics are present and legible.
- Visual style is indistinguishable in theme from the existing cheat sheet.

## Out of scope

- Functions section (already covered by the existing sheet).
- Advanced types (conditional/mapped types, decorators, generics deep-dive).
- Any build tooling or code changes under `src/`.
