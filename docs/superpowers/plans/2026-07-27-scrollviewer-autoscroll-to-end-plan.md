# ScrollViewer AutoScrollToEnd Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky `AutoScrollToEnd` opt-in to Mural's `ScrollViewer` that keeps the latest content visible while the user is parked at the bottom, and turn it on for the Plexus agent chat.

**Architecture:** A new boolean DP on `ScrollViewer`. Inside the arrange pass (`ArrangeTemplateParts`, right after the content presenter is arranged and the extent is fresh), snap `VerticalOffset` to the bottom only when the content grew AND the viewport was already at the bottom. Two private fields carry the sticky state across arranges. Plexus opts in with one markup attribute; Mural is republished and reconsumed.

**Tech Stack:** TypeScript, Node.js `node:test` runner (`tsx`), Mural `.mu` compiler, Verdaccio local registry, electron-vite (Plexus).

## Global Constraints

- Default `AutoScrollToEnd = false` — zero behavior change for every existing `ScrollViewer`. (verbatim: "Opt-in, zero default impact.")
- Sticky, not always-snap: auto-scroll only when the viewport is within `EPS` (≈1px) of the bottom.
- VM-agnostic: react to content height only, never to transcript view-model shapes.
- Every test file lives in a `tests/` subfolder next to the code it exercises (Mural + Plexus convention).
- Enums over string-literal unions (not triggered here; do not introduce string-literal union types).
- Run Mural tests with the project runner: `npx tsx --conditions=development --test <file>` from `Mural/`.
- Commit after each task. Author `Eugene Napryaglo <evgen.napryaglo@gmail.com>`; end commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **`Mural/src/framework/surfaces/scroll-viewer.ts`** (modify) — add the `AutoScrollToEnd` DP + accessors, two private sticky-state fields, and the snap block inside `ArrangeTemplateParts`.
- **`Mural/src/framework/tests/scroll-viewer.test.ts`** (modify) — a new `describe` block covering snap / sticky-release / sticky-resume / default-off.
- **`Mural/package.json`** (modify) — patch version bump for the republish.
- **`Plexus/src/renderer/src/modules/agent-chat/agent-chat.resources.mu`** (modify) — add `AutoScrollToEnd = true` to the transcript ScrollViewer.
- **`Plexus/package.json`** (modify) — bump `@pragmatic-lab/mural` to the new version.

---

## Task 1: `ScrollViewer.AutoScrollToEnd` (Mural)

**Files:**
- Modify: `Mural/src/framework/surfaces/scroll-viewer.ts`
- Test: `Mural/src/framework/tests/scroll-viewer.test.ts`

**Interfaces:**
- Consumes: existing `ScrollViewer` members — `get ExtentHeight()`, `get ScrollableHeight()`, `VerticalOffset` (DP), and `ArrangeTemplateParts(finalSize)` which arranges `this._scp` via `this._scp?.Arrange(new Rect(0, 0, contentW, contentH));`.
- Produces: `AutoScrollToEnd: boolean` DP (default `false`) on `ScrollViewer`.

- [ ] **Step 1: Write the failing tests**

Append this block to the end of `Mural/src/framework/tests/scroll-viewer.test.ts` (the file already imports `Element`, `Rect`, `Size`, `ScrollViewer`, `initTestApp`, and `assert`):

```ts
// A content element whose height can grow between arranges, to exercise
// AutoScrollToEnd's content-growth trigger.
class Growable extends Element
{
    public h: number;
    constructor(h: number) { super(); this.h = h; }
    protected override MeasureOverride(_a: Size): Size { return new Size(50, this.h); }
    public grow(dh: number): void { this.h += dh; this.InvalidateMeasure(); }
}

describe('ScrollViewer — AutoScrollToEnd (sticky)', () => {
    beforeEach(() => { initTestApp(); });

    function layout(sv: ScrollViewer): void {
        sv.Measure(new Size(100, 100));
        sv.Arrange(new Rect(0, 0, 100, 100));
    }

    test('snaps to the bottom when content grows and the viewport is at the end', () => {
        const sv = new ScrollViewer();
        sv.AutoScrollToEnd = true;
        const c = new Growable(300);
        sv.Content = c;
        layout(sv);
        // First content lands at the bottom (initial _wasAtEnd = true).
        assert.ok(sv.ScrollableHeight > 0);
        assert.equal(sv.VerticalOffset, sv.ScrollableHeight);

        c.grow(200);
        layout(sv);
        assert.equal(sv.VerticalOffset, sv.ScrollableHeight);
    });

    test('does NOT snap after the user scrolls up (sticky released)', () => {
        const sv = new ScrollViewer();
        sv.AutoScrollToEnd = true;
        const c = new Growable(300);
        sv.Content = c;
        layout(sv);

        sv.VerticalOffset = 0;   // user scrolls up
        layout(sv);              // recomputes _wasAtEnd = false
        c.grow(200);
        layout(sv);
        assert.equal(sv.VerticalOffset, 0, 'stayed put — no yank');
    });

    test('resumes snapping once the user scrolls back to the bottom', () => {
        const sv = new ScrollViewer();
        sv.AutoScrollToEnd = true;
        const c = new Growable(300);
        sv.Content = c;
        layout(sv);

        sv.VerticalOffset = 0;
        layout(sv);
        sv.ScrollToBottom();     // back to the end
        layout(sv);
        c.grow(200);
        layout(sv);
        assert.equal(sv.VerticalOffset, sv.ScrollableHeight);
    });

    test('default (AutoScrollToEnd=false) never auto-scrolls', () => {
        const sv = new ScrollViewer();
        const c = new Growable(300);
        sv.Content = c;
        layout(sv);
        assert.equal(sv.VerticalOffset, 0);
        c.grow(200);
        layout(sv);
        assert.equal(sv.VerticalOffset, 0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --conditions=development --test src/framework/tests/scroll-viewer.test.ts`
Expected: FAIL — `sv.AutoScrollToEnd` is not a property (setter undefined), and the snapping assertions fail.

- [ ] **Step 3a: Add the DP**

In `Mural/src/framework/surfaces/scroll-viewer.ts`, add the DP right after the `IsAutoHideScrollBarsKey` declaration:

```ts
    public static readonly IsAutoHideScrollBarsKey = Model.RegisterProperty<boolean>(
        ScrollViewer, 'IsAutoHideScrollBars', false, MetaData.None);

    // Opt-in "keep the latest content visible". When true, an arrange pass whose
    // content grew snaps VerticalOffset to the bottom — but only while the
    // viewport was already parked at the bottom (sticky). Scrolling up releases
    // it; scrolling back to the bottom resumes it. Default false → no effect on
    // existing ScrollViewers. MetaData.Arrange so toggling it re-arranges.
    public static readonly AutoScrollToEndKey = Model.RegisterProperty<boolean>(
        ScrollViewer, 'AutoScrollToEnd', false, MetaData.Arrange);
```

- [ ] **Step 3b: Add accessors + sticky-state fields**

Add the accessors and the two private fields right after the `VerticalOffset` get/set pair:

```ts
    public get VerticalOffset(): number { return this.get_property_value(ScrollViewer.VerticalOffsetKey); }
    public set VerticalOffset(value: number) { this.set_property_value(ScrollViewer.VerticalOffsetKey, value); }

    public get AutoScrollToEnd(): boolean { return this.get_property_value(ScrollViewer.AutoScrollToEndKey); }
    public set AutoScrollToEnd(v: boolean) { this.set_property_value(ScrollViewer.AutoScrollToEndKey, v); }

    // Sticky auto-scroll state (only read/written when AutoScrollToEnd is true).
    // _wasAtEnd starts true so the first content load lands at the bottom.
    private _lastAutoScrollExtent = 0;
    private _wasAtEnd            = true;
```

- [ ] **Step 3c: Add the snap block in `ArrangeTemplateParts`**

In `ArrangeTemplateParts`, find the content-presenter arrange line and insert the auto-scroll block immediately after it:

```ts
        this._scp?.Arrange(new Rect(0, 0, contentW, contentH));

        // Sticky auto-scroll: after the SCP arrange, ExtentHeight / ScrollableHeight
        // are current. Snap to the bottom only when the content grew and the
        // viewport was already at the end; re-arrange the SCP so the offset lands
        // this frame. Then remember whether we're at the end for the next pass.
        if (this.AutoScrollToEnd)
        {
            const AUTO_SCROLL_EPS = 1;
            const extent = this.ExtentHeight;
            if (extent > this._lastAutoScrollExtent && this._wasAtEnd)
            {
                this.VerticalOffset = this.ScrollableHeight;
                this._scp?.Arrange(new Rect(0, 0, contentW, contentH));
            }
            this._lastAutoScrollExtent = extent;
            this._wasAtEnd = this.VerticalOffset >= this.ScrollableHeight - AUTO_SCROLL_EPS;
        }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --conditions=development --test src/framework/tests/scroll-viewer.test.ts`
Expected: PASS — the four new tests plus all pre-existing ScrollViewer tests (regression guard).

- [ ] **Step 5: Commit**

```bash
git add src/framework/surfaces/scroll-viewer.ts src/framework/tests/scroll-viewer.test.ts
git commit -m "feat(scroll-viewer): sticky AutoScrollToEnd DP"
```

---

## Task 2: Publish Mural + consume in the Plexus chat

**Files:**
- Modify: `Mural/package.json` (version bump)
- Modify: `Plexus/src/renderer/src/modules/agent-chat/agent-chat.resources.mu`
- Modify: `Plexus/package.json` (mural dependency bump)

**Interfaces:**
- Consumes: `ScrollViewer.AutoScrollToEnd` (Task 1) — read by name in markup as `[ AutoScrollToEnd = true ]`.
- Produces: the agent-chat transcript ScrollViewer opts into sticky auto-scroll.

This task is operational (publish + reinstall + one markup edit); its deliverable is verified by the `.mu` compiling and the renderer building.

- [ ] **Step 1: Bump the Mural version**

In `Mural/package.json`, change `"version": "0.1.42"` to `"version": "0.1.43"`.

- [ ] **Step 2: Publish Mural to the local registry**

From `Mural/`:

```bash
npm publish
```

`prepublishOnly` runs `npm run clean && npm run build` first. Expected: `+ @pragmatic-lab/mural@0.1.43` published to `http://localhost:4873/`.

- [ ] **Step 3: Bump + install the new Mural in Plexus**

In `Plexus/package.json`, change the `@pragmatic-lab/mural` dependency to `"^0.1.43"`. Then from `Plexus/`:

```bash
npm install @pragmatic-lab/mural@0.1.43
```

Expected: `node_modules/@pragmatic-lab/mural` is `0.1.43` (confirm: `node -p "require('@pragmatic-lab/mural/package.json').version"` → `0.1.43`).

- [ ] **Step 4: Turn on auto-scroll in the chat markup**

In `Plexus/src/renderer/src/modules/agent-chat/agent-chat.resources.mu`, change the transcript ScrollViewer line:

```
            // Scrolling transcript fills the rest.
            ScrollViewer [ HorizontalScrollEnabled = false, AutoScrollToEnd = true ] {
                ItemsControl [ ItemsSource = $Transcript, ItemsPanel = @VerticalStackPanel ]
            }
```

- [ ] **Step 5: Compile the .mu and build the renderer**

From `Plexus/`:

```bash
npm run compile:mu
```

Expected: exit 0, no compiler error for `AutoScrollToEnd` (it is a boolean DP resolved by name; no symbol-table entry needed). `agent-chat.resources.mu.js` is regenerated.

- [ ] **Step 6: Manual smoke (not committed)**

From `Plexus/`: `npm run dev`. Send the agent a prompt that streams a long response; confirm the transcript stays pinned to the newest content. Scroll up mid-stream and confirm it stops following; scroll back to the bottom and confirm it resumes.

- [ ] **Step 7: Commit (two repos)**

Mural version bump:

```bash
cd Mural && git add package.json && git commit -m "chore(release): mural 0.1.43 (AutoScrollToEnd)"
```

Plexus consumption:

```bash
cd Plexus && git add package.json package-lock.json src/renderer/src/modules/agent-chat/agent-chat.resources.mu src/renderer/src/modules/agent-chat/agent-chat.resources.mu.js && git commit -m "feat(agent-chat): auto-scroll transcript to the latest message"
```

---

## Final verification

- [ ] Mural ScrollViewer suite green:

```bash
cd Mural && npx tsx --conditions=development --test src/framework/tests/scroll-viewer.test.ts
```
Expected: all PASS, 0 failures.

- [ ] Mural typecheck clean:

```bash
cd Mural && npm run typecheck
```
Expected: exit 0.

- [ ] Plexus `.mu` compiles:

```bash
cd Plexus && npm run compile:mu
```
Expected: exit 0.
