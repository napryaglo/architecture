# ResourceDictionary Notification Primitives — Design

**Date:** 2026-08-04
**Status:** Approved (design), pending implementation plan
**Package:** Mural (`@pragmatic-lab/mural`), consumed by Plexus via Verdaccio

## Problem

Populating a large, **already-merged** `ResourceDictionary` one entry at a
time causes a global style-invalidation storm. Measured against Plexus's
Libraries panel: `LibraryRegistry.discover()` merges the microsoft
library's baked presentation dictionary into `Application.Resources`, then
does 743 individual `Set(classId, template)` calls. A live DevTools trace
attributes **~4–5 s of main-thread time per panel open** to this loop
(8.7 s across two opens), spent almost entirely in style re-resolution —
*not* in reading or eval'ing the 3 MB presentation artifact (that eval is
~130 ms cold, negligible).

### Root cause (verified in source + trace)

- `ResourceDictionary.Set` unconditionally calls `notify()`
  ([resource-dictionary.ts:141](../../../src/runtime/resource-dictionary.ts#L141)).
- `AddMergedDictionary` forwards a merged child's every change to the
  parent's listeners
  ([resource-dictionary.ts:276](../../../src/runtime/resource-dictionary.ts#L276)).
- **Every** `Element` coarse-`Subscribe`s to `Application.Resources` (and
  each ancestor dict); its `onChange` re-resolves implicit style
  (`TryFindResource(this.constructor)`) and theme style
  (`TryFindResource(DefaultStyleKey)`) — both **Function-keyed** lookups
  ([element.ts:452-486](../../../src/visual-engine/element.ts#L452-L486)).

So each **string-keyed** `Set` into the merged presentation dict wakes
every live element to re-resolve a style that a string key can never
affect. Cost ≈ `Sets × liveElements × resolveWalk`.

Note: string-key changes are *not* globally irrelevant — `DynamicResource`
bindings and canvas-by-key template lookups DO depend on them
([element.ts:238-241](../../../src/visual-engine/element.ts#L238-L241)
refreshes both styles and dynamic resources). The fix must keep waking
`DynamicResource`, only spare **style** resolution.

## Goals

A reusable toolkit — future panels that populate large keyed resource sets
(not just Libraries) pick the primitive that fits. Three composable
primitives:

1. **`Batch(fn)`** — coalesce many mutations into one notification.
2. **`ReplaceMergedDictionary(old, next)`** — atomic wholesale swap of a
   merged sub-dictionary (build detached, swap once).
3. **Style-isolation** (two mechanisms, per approval "build both"):
   - **3a** per-key style subscription — the general engine improvement;
     string-key churn stops triggering full style re-resolution app-wide.
   - **3b** a `StyleParticipating` opt-out flag + a **style notification
     channel** — a marked dictionary never fires style listeners at all
     (while still firing general/`DynamicResource` listeners).

Wiring the Libraries panel onto these is a **separate, later** decision
(this spec builds the primitives; it does not change `LibraryRegistry`).

## Design

### Notification channels (foundation for 3b)

`ResourceDictionary` gains a second listener set. Backward-compatible: the
default `notify()` still fires everything, so existing `Subscribe`
consumers are unchanged.

```ts
// existing — the "general" channel
private readonly listeners = new Set<ResourceChangeListener>();
// new — the "style" channel; only style resolution subscribes here
private readonly styleListeners = new Set<ResourceChangeListener>();

// default: true. A false dict never fires its style channel, and its
// changes forwarded through a merge never fire the parent's style channel.
private _styleParticipating = true;
public get StyleParticipating(): boolean { return this._styleParticipating; }
public set StyleParticipating(v: boolean) { this._styleParticipating = v; }

public SubscribeStyle(listener: ResourceChangeListener): () => void {
    this.styleListeners.add(listener);
    return () => { this.styleListeners.delete(listener); };
}
```

All fan-out routes through one core. `signal(styleRelevant)` records the
*source's* style-relevance; `fanOut` does the actual firing, gating the
style channel on both the source relevance and this dict's own flag. The
existing private `notify()` is replaced by `signal(true)` at every mutation
site (`Set` / `Delete` / `Clear` / `AddMergedDictionary` /
`RemoveMergedDictionary`).

```ts
// Called by every local mutation with styleRelevant = true. Called by the
// merge forwarder with styleRelevant = the child's StyleParticipating flag.
private signal(styleRelevant: boolean): void {
    if (this._batchDepth > 0) {                 // coalesced — see Batch
        this._pendingGeneral = true;
        if (styleRelevant) this._pendingStyle = true;
        return;
    }
    this.fanOut(true, styleRelevant);
}

private fanOut(general: boolean, styleRelevant: boolean): void {
    if (general) for (const l of [...this.listeners]) l();
    // Style fires only when the source was style-relevant AND this dict
    // itself participates in styling.
    if (styleRelevant && this._styleParticipating)
        for (const l of [...this.styleListeners]) l();
}
```

The merge forwarder consults the **child's** flag, so a non-participating
child's changes never reach the parent's style channel:

```ts
// in AddMergedDictionary, replacing the current forward subscription.
// dict.Subscribe registers on the child's GENERAL channel (always fires),
// so the forwarder runs for every child change; it passes the child's
// participation as the parent's style-relevance.
this.mergedSubscriptions.push(
    dict.Subscribe(() => this.signal(dict.StyleParticipating)));
```

The flag is read live in the closure — toggling `StyleParticipating` after
merge takes effect on the next change with no re-subscribe.

### Primitive 1 — `Batch(fn)`

Suspend fan-out for the duration of `fn`; fire once afterward iff any
mutation occurred. Depth-counted (nesting-safe) and exception-safe (the
trailing fan-out runs in `finally`). While suspended, `signal` (above)
records `_pendingGeneral` / `_pendingStyle` instead of firing, so the
trailing fan-out replays exactly the channels that were touched — a batch
of only non-participating-child forwards fires general-only; a batch that
includes any style-relevant mutation fires both.

```ts
private _batchDepth = 0;
private _pendingGeneral = false;
private _pendingStyle = false;

public Batch(fn: () => void): void {
    this._batchDepth++;
    try { fn(); }
    finally {
        this._batchDepth--;
        if (this._batchDepth === 0 && (this._pendingGeneral || this._pendingStyle)) {
            const g = this._pendingGeneral, s = this._pendingStyle;
            this._pendingGeneral = this._pendingStyle = false;
            this.fanOut(g, s);
        }
    }
}
```

A merged child notifying the parent mid-batch is coalesced too — the
forwarder calls `this.signal(...)`, which respects the parent's batch depth.

Result: `dict.Batch(() => { for (const [k,v] of entries) dict.Set(k,v) })`
fires exactly one notification.

### Primitive 2 — `ReplaceMergedDictionary(old, next)`

Atomic wholesale swap for panels that *rebuild* their resource set. Build
`next` detached (its `Set`s notify nobody — no subscribers until merged),
then swap it for `old` inside a `Batch` so the removal + addition collapse
to one parent notification.

```ts
// old may be undefined (first population). Returns nothing.
public ReplaceMergedDictionary(
    old: ResourceDictionary | undefined, next: ResourceDictionary): void {
    this.Batch(() => {
        if (old !== undefined) this.RemoveMergedDictionary(old);
        this.AddMergedDictionary(next);
    });
}
```

### Primitive 3a — per-key style subscription in `Element`

`Element.subscribe_styles` ([element.ts:452](../../../src/visual-engine/element.ts#L452))
switches its **direct style subscriptions** (the ancestor-dict + app-dict
loops at lines 473 and 484) from coarse `Subscribe(onChange)` to per-key,
style-channel subscriptions, so a change whose keys don't alter the
resolved style is a cheap no-op instead of a full re-resolve:

```ts
// implicit style is keyed by the instance's own type (stable per instance)
sub.push(r.SubscribeStyleKey(this.constructor, () => this.resolve_implicit_style()));
// theme style is keyed by DefaultStyleKey, which may be undefined and may
// change; subscribe only when defined, and re-wire on DefaultStyleKey change
const dsk = this.DefaultStyleKey;
if (dsk !== undefined)
    sub.push(r.SubscribeStyleKey(dsk, () => this.resolve_theme_style()));
```

`SubscribeStyleKey(key, listener)` = `SubscribeKey` semantics (seed
`Resolve(key)`, fire only when the resolved value changes by `===`) built
on the **style** channel:

```ts
public SubscribeStyleKey(key: ResourceKey, listener: ResourceChangeListener): () => void {
    let last = this.Resolve(key);
    return this.SubscribeStyle(() => {
        const next = this.Resolve(key);
        if (next === last) return;
        last = next; listener();
    });
}
```

Both keys are stable for the element's lifetime by the time
`subscribe_styles` runs: `this.constructor` is fixed, and `DefaultStyleKey`
is a metadata-set **read-only** DP resolved before `AttachLogical` (the old
coarse code likewise never reacted to a bare `DefaultStyleKey` change — only
to a resource-dict change that happened to coincide). Capturing both keys at
subscribe time is therefore sound; `_refresh_styles_subtree` re-runs
`subscribe_styles` on tree moves. This spec adds no `DefaultStyleKey`-change
plumbing.

Element's **own `Resources`** subscription
([element.ts:238](../../../src/visual-engine/element.ts#L238)) is left on
coarse `Subscribe` — it fires only when *that element's own* dictionary
mutates (author action, not app-resource churn) and also drives
`_refresh_dynamic_resources_subtree`, which legitimately needs every
change. It is not on the hot path and stays general-channel.

### Primitive 3b — `StyleParticipating` opt-out

Already defined by the channel foundation above. A consumer marks a
keyed-only dictionary (e.g. a presentation/template dict) as
`dict.StyleParticipating = false`; when merged into `Application.Resources`,
its changes fire the app dict's general channel (so `DynamicResource` and
canvas-by-key lookups stay correct) but never its style channel (so no
element does any style work for it) — regardless of whether the elements
use 3a or legacy coarse style subscription.

## Interaction of the primitives

For a rebuild-heavy panel like Libraries, the endpoint (wired later) is
`ReplaceMergedDictionary` (#2) of a detached, `StyleParticipating = false`
(#3b) presentation dict: 743 Sets notify nobody (detached), the swap is one
general-channel notification, and that notification does zero element style
work. #1 stands alone for panels that must mutate a live merged dict in
place. #3a is the app-wide safety net that de-risks *any* remaining
string-key churn on participating dictionaries. The primitives are
independent; a consumer uses one, two, or all three.

## Testing

Mural unit tests (each asserts via a `Subscribe` / `SubscribeStyle` spy
that counts fan-outs), all under `tests/` subfolders:

- **Batch:** N `Set`s in a `Batch` → 1 general + 1 style fan-out; no
  mutation → 0; nested `Batch` → 1; throwing `fn` still fires the trailing
  notify once and propagates the error.
- **ReplaceMergedDictionary:** old removed + next added → single parent
  notification; resolutions reflect `next`, not `old`; `old = undefined`
  path adds cleanly.
- **Channels / StyleParticipating:** `SubscribeStyle` fires on a normal
  `Set`; a `StyleParticipating = false` dict's `Set` fires general but not
  style; the same, forwarded through a merge into a participating parent,
  fires the parent's general but not style channel; toggling the flag after
  merge takes effect live.
- **SubscribeStyleKey:** fires only when the resolved value for the key
  changes; an unrelated string-key `Set` on the same dict does not fire it;
  a merged `Set` that newly exposes/hides the key flips it.
- **Element 3a integration:** a string-keyed `Application.Resources` change
  does not trigger `resolve_implicit_style` / `resolve_theme_style`
  (spy/counter on a test Element); a real implicit-style change (a `Style`
  Set under the element's `this.constructor` key) still re-resolves.

## Out of scope

- Wiring `LibraryRegistry` / any Plexus panel onto these primitives —
  decided separately after the primitives land and publish.
- Changing `Element.Resources` (line 238) subtree-refresh subscription.
- Any change to `SubscribeKey`'s existing general-channel behavior.

## Rollout

Mural: implement + test → `npm run build` green → publish to Verdaccio
(bump minor) → Plexus bumps the `@pragmatic-lab/mural` floor. No Plexus
behavior change in this spec; the Libraries wiring is a follow-up.
