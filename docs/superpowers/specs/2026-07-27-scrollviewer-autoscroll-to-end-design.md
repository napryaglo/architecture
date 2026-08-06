# ScrollViewer AutoScrollToEnd Design

**Goal:** Keep the latest content visible in a growing/streaming `ScrollViewer`
(the Plexus agent chat) by auto-scrolling to the bottom — but only while the
user is already parked at the bottom (sticky), so scrolling up to read history
is never interrupted.

**Status:** ✅ Finished (Design approved 2026-07-27)

## Background

The Plexus agent chat renders its transcript as a `ScrollViewer` wrapping an
`ItemsControl` over an `ObservableCollection`
([agent-chat.resources.mu:40-42](../../../../Plexus/src/renderer/src/modules/agent-chat/agent-chat.resources.mu)).
Today it never auto-scrolls, so a streaming response or a new message can land
below the fold.

The transcript grows two different ways:

- **New items** — `Transcript.Add(...)` (user message, tool card, a fresh
  assistant bubble) fires `CollectionChanged`.
- **Growth within the last item** — the assistant streams tokens into
  `AssistantMessage.Document`, and a tool's `Output`/`Status` fill in later.
  These mutate the item's DPs and make the content **taller**, but do **not**
  fire `CollectionChanged`.

So watching the collection alone misses streaming growth. And a behavior that
scrolls on `CollectionChanged` fires *before* Mural measures/arranges the new
content, so `ScrollableHeight` is stale and it lands short. Mural exposes no
`LayoutUpdated`/observable-extent hook to defer against.

Both problems disappear if the logic lives **inside `ScrollViewer`**, where the
fresh content extent is known during the arrange pass, and both growth kinds
reduce to the same thing: the content got taller and arrange re-ran.

## Design principles (locked during brainstorming)

- **Sticky, not always-snap.** Auto-scroll to the latest only when the viewport
  is already at (or within `EPS` of) the bottom. If the user scrolled up, leave
  their position alone until they scroll back down.
- **VM-agnostic.** The mechanism reacts to content height, never to specific
  transcript view-model shapes. A new streaming item type needs no wiring.
- **Opt-in, zero default impact.** A new boolean DP defaulting to `false`; every
  existing `ScrollViewer` is unaffected.

## Component: `ScrollViewer.AutoScrollToEnd`

**File:** `Mural/src/framework/surfaces/scroll-viewer.ts`

### New DP

```ts
public static readonly AutoScrollToEndKey = Model.RegisterProperty<boolean>(
    ScrollViewer, 'AutoScrollToEnd', false, MetaData.Arrange);

public get AutoScrollToEnd(): boolean { return this.get_property_value(ScrollViewer.AutoScrollToEndKey); }
public set AutoScrollToEnd(v: boolean) { this.set_property_value(ScrollViewer.AutoScrollToEndKey, v); }
```

`MetaData.Arrange` so toggling it re-arranges.

### Sticky state (private fields)

```ts
private _lastAutoScrollExtent = 0;   // ExtentHeight seen at the previous arrange
private _wasAtEnd            = true; // viewport parked at the bottom before this growth
```

`_wasAtEnd` starts `true` so the first content load lands at the bottom (the
chat opens scrolled to the newest message).

### Hook: `ArrangeTemplateParts`

`ArrangeTemplateParts(finalSize)` already arranges the SCP at the line
`this._scp?.Arrange(new Rect(0, 0, contentW, contentH));`
(scroll-viewer.ts:408). Immediately **after** that call — where `ExtentHeight` /
`ScrollableHeight` are current — insert the auto-scroll step, then let the
existing scrollbar-sync block run (it reads `effectiveVerticalOffset()`, which
reflects the updated offset).

```ts
// After `this._scp?.Arrange(new Rect(0, 0, contentW, contentH));`
if (this.AutoScrollToEnd)
{
    const AUTO_SCROLL_EPS = 1;
    const extent = this.ExtentHeight;
    const grew   = extent > this._lastAutoScrollExtent;
    if (grew && this._wasAtEnd)
    {
        // Snap to the (fresh) bottom and re-arrange the SCP so the offset lands
        // THIS frame — the SCP reads the host's clamped offsets in its arrange.
        this.VerticalOffset = this.ScrollableHeight;
        this._scp?.Arrange(new Rect(0, 0, contentW, contentH));
    }
    this._lastAutoScrollExtent = extent;
    this._wasAtEnd = this.VerticalOffset >= this.ScrollableHeight - AUTO_SCROLL_EPS;
}
```

### Why the sticky rule is correct

- `VerticalOffset` is an arrange-invalidating DP. A user wheel / scrollbar drag
  re-runs `ArrangeTemplateParts` with **no** growth, so the snap branch is
  skipped and the final line sets `_wasAtEnd = false` (they are no longer at the
  bottom). Subsequent streaming growth therefore does **not** yank them down.
- When the user scrolls back to the bottom, the next arrange sets
  `_wasAtEnd = true`, and stickiness resumes.
- `grew` guards against snapping on arranges that are not content growth (e.g. a
  viewport resize), so only new/streamed content triggers a snap.
- `EPS ≈ 1px` tolerates fractional heights from text layout.

This handles new transcript items and token-by-token growth of the last message
identically — both just make the content taller and re-trigger arrange.

## Consumption (Plexus)

**File:** `Plexus/src/renderer/src/modules/agent-chat/agent-chat.resources.mu`

Add the opt-in attribute to the transcript ScrollViewer (line 40):

```
ScrollViewer [ HorizontalScrollEnabled = false, AutoScrollToEnd = true ] {
    ItemsControl [ ItemsSource = $Transcript, ItemsPanel = @VerticalStackPanel ]
}
```

`AutoScrollToEnd` is a plain boolean DP resolved by name at runtime — no
compiler symbol-table change (it is not an enum). Recompile with
`npm run compile:mu`.

Because Plexus now reads a new Mural DP: bump + publish `@pragmatic-lab/mural`
to the local Verdaccio registry, then bump the `@pragmatic-lab/mural` version in
Plexus to consume it.

## Testing

**Mural** — `Mural/src/framework/surfaces/tests/scroll-viewer.test.ts` (extend
the existing sized-child / arrange harness; the suite already drives measure +
arrange with a content child of known height):

- `AutoScrollToEnd=true`, content extent grows, arrange → `VerticalOffset === ScrollableHeight` (snaps to bottom).
- Scroll up (`VerticalOffset = 0`, arrange), then grow content, arrange →
  `VerticalOffset` unchanged (sticky released — no yank).
- Scroll back to the bottom, grow content, arrange → snaps to bottom again
  (stickiness resumes).
- `AutoScrollToEnd=false` (default), grow content, arrange → `VerticalOffset`
  stays `0` (regression guard: no behavior change for existing ScrollViewers).

**Plexus** — no unit test for the one-attribute markup change; verified by the
`.mu` compiling and a manual `npm run dev` eyeball of the chat streaming to the
bottom, including the scroll-up-to-read case.

## Out of scope

- A "jump to latest" affordance / button when the user is scrolled up (YAGNI;
  the sticky rule already keeps their position — can add later if wanted).
- Horizontal auto-scroll (chat only grows vertically).
- Smooth/animated auto-scroll (the existing `SmoothScroll` DP already tweens
  `VerticalOffset` writes, so setting the offset here inherits animation when
  the consumer opts into `SmoothScroll` — no extra work).
