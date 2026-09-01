# Arch-node label text styling — design

## Problem

Selecting an architecture node and driving the Format Shape **Text** page
(font family / size / colour / bold / italic / underline / strikethrough /
paragraph alignment) does nothing to the node's label.

**Root cause.** The Text page drives `FormatMirror` (mural), whose character
and paragraph channels seed from and broadcast to `leaf.Text` — a
`ShapeText`, a geometric shape's built-in caption. An arch node deliberately
does **not** render through its Figure's `ShapeText` (left blank — see
`arch-node-vm.ts` "editable text is its TITLE ($Label), NOT the container
Figure's ShapeText"). Its visible label is `PART_Title`, a `TextBlock` bound
to `$Label` in the Plexus `ArchNodeVM` DataTemplate, with **hardcoded**
`Style = @BodySmall, Foreground = @OnSurface` and no per-node font state.

So the Text controls write into a blank/absent `ShapeText` the label never
renders from. This is the same shape as the Fill/Stroke gap that
`FormatMirror._paintTargets()` already closed for the **Style** page (routing
a content VM's paint to its container Figure) — but the **text channel never
got the equivalent redirect**, and the VM has no font DPs to redirect *to*.

## Approach

Mirror the `_paintTargets` precedent for text. Three moving parts:

1. **Mural — a text-style target contract + redirect.** Define
   `ITextStyleTarget` in the diagram module: the exact surface `FormatMirror`
   already calls on `ShapeText` — `ApplyFontFamily/ApplyFontSize/
   ApplyForeground/ApplyBold/ApplyItalic/ApplyUnderline/ApplyStrikethrough/
   ApplyParagraphAlignment` plus the `Current*` readers used for seeding.
   `ShapeText` already satisfies it (documentation-only `implements`).
   Add `FormatMirror._textTargetOf(leaf)`: return `leaf.Text` when present,
   else a duck-typed `leaf.TextStyle` (an `ITextStyleTarget` the content VM
   exposes), else `undefined`. Route every text/character seed and broadcast
   (`_broadcast`, `_seedCharFormat`, `_broadcastTextAlignment`,
   `_reseedTextFormat`, `BumpFontSize`) through `_textTargetOf` instead of
   `.Text` directly.
   Edit-caret plumbing (`_rewireEditListeners`, `AddEditSelectionChanged`)
   stays `ShapeText`-only — an arch label is a single derived string with no
   rich caret; its `ITextStyleTarget` applies at block level.

2. **Plexus — per-node font DPs on `ArchNodeVM` + a `TextStyle` adapter.**
   Add block-level DPs: `LabelFontFamily` (string), `LabelFontSize` (number),
   `LabelForeground` (Brush|undefined), `LabelBold/LabelItalic/LabelUnderline/
   LabelStrikethrough` (bool), `LabelTextAlignment` (TextAlignment). Expose
   `get TextStyle(): ITextStyleTarget` — a small adapter whose `Apply*` set the
   DPs and whose `Current*` read the **effective** value (the DP, or the
   inherited default). `PART_Title` binds these DPs (`FontSize = $$LabelFontSize`,
   `FontWeight`/`FontStyle`/`TextDecorations` from the booleans,
   `TextAlignment = $$LabelTextAlignment`, `Foreground` per the colour rule
   below), replacing the hardcoded `@BodySmall`/`@OnSurface` where overridden.

3. **Plexus — persistence.** `arch-node-serializer.ts` writes/reads a `labelStyle`
   block in the node's `.diagram` visual (only non-default fields), so styling
   survives reload — same precedent as the per-shape lock/anchor DPs. Label
   *text* stays derived from the entity; only presentation persists.

### Defaults & theme adaptivity (the one subtlety)

Today the label is `@BodySmall` + theme-adaptive `@OnSurface`, so it must look
identical until the user overrides something.

- **Family / size**: DP defaults equal `@BodySmall`'s values; the adapter's
  `Current*` returns those when unset so the Text page shows the real
  starting point.
- **Colour**: `LabelForeground` defaults to `undefined` meaning "inherit".
  `PART_Title.Foreground` binds `$$LabelForeground` with a
  `when ($LabelForeground = undefined) { PART_Title.Foreground = @OnSurface }`
  fallback, preserving light/dark adaptivity until the user picks a colour.
  The adapter's `CurrentForeground()` resolves the effective brush (the DP or
  the OnSurface default) so seeding and round-tripping are correct.
- **Bold/italic/underline/strikethrough/alignment**: default false / Center
  (the tile is centred today).

## Rejected alternative

Make the arch label literally *be* the Figure's `ShapeText` (so `FormatMirror`
styles it unchanged). Rejected: it fights the deliberate icon+label tile
design and its inline `$Label` editor, wiki menu, wrap/measurement handling —
a large rewrite of arch presentation to avoid a focused redirect.

## Testing

- **Mural**: `FormatMirror` routes a character/paragraph edit to a content
  VM's `TextStyle` (a fake `ITextStyleTarget` leaf), and seeds the toolbar
  DPs from it. `ShapeText` path unchanged (regression).
- **Plexus**: `ArchNodeVM` DPs + `TextStyle` adapter get/set; serializer
  round-trips a styled label (and omits defaults); `PART_Title` binds the DPs
  (template-render test).
- **e2e** (optional, one spec): select an arch node → Text page → change
  size/colour/bold → `PART_Title` reflects it and it survives reload.

## Cross-repo / release

Mural gains `ITextStyleTarget` + the `FormatMirror` redirect → **republish**
`@pragmatic-tech-ai/mural` (minor bump) to Verdaccio; Plexus bumps its dep and
adds the VM DPs / template / serializer. Both `main`, committed on request.
