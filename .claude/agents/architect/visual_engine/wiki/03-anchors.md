# Anchors and anchor-relative placement

This document specifies named anchors on placed elements and the
`at $id.anchor` placement form. Status: **implemented** (2026-04-29).
Layout pipeline carries it through stages 1–4 — see "Layout pipeline
updates" below for the precise stage-3 changes.

## What an anchor is

Every placed element has 9 named anchors, derived from its arranged
bounding box (the outer border rect):

```
                          north
                 ┌───────────●───────────┐
                 │                       │
       north-west ●                     ● north-east
                 │                       │
                 │                       │
            west ●        ● center      ● east
                 │                       │
                 │                       │
       south-west ●                     ● south-east
                 │                       │
                 └───────────●───────────┘
                          south
```

Both the `center` dot and label sit on the same row as `west` / `east`
(the vertical mid-line), and horizontally between the side walls — at
`(x + w/2, y + h/2)`.

Names: `north`, `south`, `east`, `west`, `north-east`, `north-west`,
`south-east`, `south-west`, `center`.

These are computed from `arranged = {x, y, w, h}`:

| anchor       | coordinate                       |
|--------------|----------------------------------|
| `north`      | `(x + w/2,     y)`               |
| `south`      | `(x + w/2,     y + h)`           |
| `east`       | `(x + w,       y + h/2)`         |
| `west`       | `(x,           y + h/2)`         |
| `north-east` | `(x + w,       y)`               |
| `north-west` | `(x,           y)`               |
| `south-east` | `(x + w,       y + h)`           |
| `south-west` | `(x,           y + h)`           |
| `center`     | `(x + w/2,     y + h/2)`         |

**Uniformity rule (settled 2026-04-27):** anchors live on the *outer
border rect*, never on per-shape geometry. A circle, a rounded rect,
and a rectangle all expose the same 9 anchors at the same positions
relative to their bbox. No shape-specific exceptions.

## Placement syntax

### Grammar

```
placement   := "at" target
target      := "(" col-num "," row-num ")"          # literal cell coord (ugrid)
             | "$" id                                 # anchor-ref, default anchor=center
             | "$" id "." anchor-name                # anchor-ref at named anchor

anchor-name := "north"   | "south"  | "east"  | "west"
             | "north-east"  | "north-west"
             | "south-east"  | "south-west"
             | "center"

own-anchor  := "[" "anchor" "=" anchor-name "]"     # optional, modifies which
                                                     # point on the placed
                                                     # element lands on the
                                                     # target anchor
```

`at`, `[anchor = …]`, and other element attributes (`[colspan = N]`,
`[stretch = vertical]`, etc.) can appear in any order between the
`$id` and the `{ ... }` body.

### Examples

```
// Centred on a target's anchor (default own-anchor = center)
$x at $a.east                                 // x's center on a's east edge
$x at $a                                       // shorthand: at $a.center

// Edge-to-edge contact (own-anchor selects which point on x)
$x at $a.east  [anchor = west]                 // x's west edge touches a's east edge -> x sits to the right
$x at $a.south [anchor = north]                // x sits below a, centred horizontally

// Corner alignment (the key use case — e.g., place above & flush right)
$x at $a.north-east [anchor = south-east]     // x's bottom-right on a's top-right
$x at $a.north-west [anchor = south-west]     // mirror — flush left
$x at $a.center [anchor = center]              // x covers a (both centres coincide)

// Mixed with other attributes (any order)
$x at $a.east [anchor = west, colspan = 2]
$x [width = 200] at $a.south [anchor = north]
```

### Composition with calc (deferred)

Calc expressions on anchor coords are not yet implemented; the entries
below are the planned syntax once arithmetic over points lands.

```
$x at ($other.east) + (10, 0)            # offset 10px right of the anchor
$x at ($a.east)!.5!($b.west)             # midpoint of two anchors
$x at ($a) -| ($b)                        # orthogonal-meeting point (corner of L)
```

### What `at (col, row)` and `at $id.anchor` are NOT interchangeable

Two distinct syntaxes for two distinct intents. Don't mix them in the
same element:

| form                   | meaning                                          | parent must be |
|------------------------|--------------------------------------------------|----------------|
| `at (col, row)`        | place at the centre of the named cell            | `ugrid(C, R)`  |
| `at $other.anchor`     | place at the named pixel point on `$other`'s bbox | any            |

A `ugrid` parent rejects children that have neither — strict mode. An
`at $other.anchor` child opts out of the parent's flow regardless of
parent layout.

## Semantics — "I get a literal pixel coordinate"

Anchors resolve to a concrete `(px, py)` once the target has been
arranged. `$x at $other.west` places `$x` so that its **center** lands
on that point (default; configurable later via own-anchor — see below).

The element renders at its **own measured size**, not at a parent cell
size. Anchor placement is a per-element opt-out of the parent's flow.

## Why anchors do *not* snap to ugrid cells

It would be possible to make `$x at $a.east` find the nearest ugrid
cell whose center is closest to `$a.east` and place `$x` there. We
explicitly reject that:

1. **Surprising.** The anchor target's pixel coord almost never
   coincides with a cell center; snapping silently shifts the element
   from where the author asked.
2. **Conflict-prone.** Two anchors near the same cell collide; resolution
   would need invented tie-break rules.
3. **Defeats the syntax's purpose.** The point of writing `at $a.east`
   is to express *I want this exact relationship to that thing*.
   Snapping breaks the contract.
4. **Authors who want grid-aligned placement already have `at (col, row)`.**
   Two syntaxes for two intents — keep them distinct.

## How anchor-placed children compose with parent layouts

- **Children without anchor refs** participate in the parent's flow
  (ugrid cell, stack flow, canvas absolute).
- **Children with anchor refs** are arranged **after** their targets,
  at the resolved pixel coord, sized to their own measured intrinsic
  size. They effectively use canvas semantics scoped to one element.
- **Parent bbox** can spill if anchor-placed children extend beyond
  the parent's measured bounds. Two policies, both reasonable:
  - *Fixed parent*: declared parent dimensions stay; spills are the
    author's responsibility (matches how connectors work in TikZ).
  - *Re-measure*: parent bbox grows to contain anchor-placed children.
  We default to **fixed parent** and revisit if real diagrams hit it.

## Margin and anchor placement

The placed element's `margin` is applied **after** anchor resolution
and pushes the element *away* from the target on the edges that face
the target — i.e. the edges named by the own-anchor. This creates a
visible gap between the placed element and the target instead of a
flush join.

**Rule:** for each compass component in the own-anchor name, the
margin on that side shifts placement in the direction that increases
distance from the target.

| own-anchor    | edges facing target | placement adjustment                       |
|---------------|---------------------|--------------------------------------------|
| `north`       | top                 | `y += margin.top`                          |
| `south`       | bottom              | `y -= margin.bottom`                       |
| `east`        | right               | `x -= margin.right`                        |
| `west`        | left                | `x += margin.left`                         |
| `north-east`  | top + right         | `y += margin.top`, `x -= margin.right`     |
| `north-west`  | top + left          | `y += margin.top`, `x += margin.left`      |
| `south-east`  | bottom + right      | `y -= margin.bottom`, `x -= margin.right`  |
| `south-west`  | bottom + left       | `y -= margin.bottom`, `x += margin.left`   |
| `center`      | (none)              | no shift — center is internal, not an edge |

**Example.** An actor with `margin: 10` (uniform 10 on all sides)
placed `at $azure.north-east [anchor = south-east]`:

```
target_xy   = azure.north-east           # e.g. (774, 96)
own_offset  = (54, 76)                   # actor's south-east relative to its top-left
place_x     = 774 - 54        = 720      # before margin
place_y     = 96  - 76        = 20       # before margin
   - east  -> place_x -= margin.right    -> 720 - 10 = 710
   - south -> place_y -= margin.bottom   -> 20  - 10 = 10
arranged    = (710, 10, 54, 76)
actor.south-east = (764, 86)             # 10px below-left of azure.north-east
```

The actor sits 10px above Azure's top edge and 10px to the left of
Azure's east edge — a clean visual gap rather than a flush corner
join.

**Why "after" not "during":** measure happens before arrange and
doesn't know about the eventual anchor placement. Pushing margin
during measure would distort the parent's measured size in a
direction that anchor-placed children don't actually live in (they're
out-of-flow). Applying margin during the anchor pass keeps measure
clean and confines the geometry shift to the placement step.

**Center is the exception.** When own-anchor is `center` the placed
element has no edge facing the target — its centroid coincides with
the target point. There's no obvious side to push from, so margin is
ignored for `center`-placed elements. If you want a center placement
*offset* by some amount, use calc (deferred) or a corner anchor with
explicit offset.

## Layout pipeline updates

The existing four-stage pipeline (build tree → measure → arrange →
emit) becomes:

```
markup.yaml
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Stage 1: BUILD layout tree                       │
│  — unchanged                                     │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Stage 2: MEASURE — bottom-up                     │
│  — unchanged                                     │
│  — anchor-ref children measure normally;         │
│    measured size used at arrange time            │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Stage 3: ARRANGE — two-phase                     │
│                                                  │
│  3a. Topological sort siblings by anchor deps    │
│      $a at $b.east  ->  $b before $a             │
│      Cycle detection: error                      │
│                                                  │
│  3b. Phase A — arrange flow children             │
│      (no anchor-ref) using parent's layout       │
│      strategy (ugrid / stack / canvas)           │
│                                                  │
│  3c. Phase B — arrange anchor-ref children       │
│      target's bbox now known; compute the        │
│      anchor coord; place child at that coord     │
│      sized to its own measured.w / measured.h    │
│                                                  │
│  Forward refs across siblings -> resolved by 3a. │
│  Forward refs across subtrees -> chained through │
│  topo sort over the whole arrange order.         │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Stage 4: EMIT — unchanged                        │
└──────────────────────────────────────────────────┘
```

## Cycle detection

```
$a at $b.east
$b at $a.west
```

This is an error. Detected by topological sort over the anchor edges
during stage 3a; arrange refuses to proceed and reports the cycle with
both ends.

## Own-anchor — REQUIRED when anchors land

By default, the anchor-placed element's **center** lands on the target
anchor. The author must be able to choose a different point on the
placed element so it can hug a target's edge or corner without
straddling it.

**Concrete use case (raised 2026-04-28):**

> "I want `$external-ai-agent` aligned with Azure's right edge but
> sitting above it, not on top of it." The actor's bottom-right
> should touch Azure's top-right; nothing of the actor should
> overlap Azure's frame.

Right form (proposed):

```
$external-ai-agent at $azure.north-east [anchor = south-east]
```

Reading: place actor's `south-east` (own anchor) at Azure's
`north-east` (target anchor). Effect: actor sits above Azure with its
bottom-right corner on Azure's top-right corner — the actor extends
up and to the left of the join point, never overlapping the frame.

**Variants the implementation must support:**

| placement                                        | actor sits...                          |
|--------------------------------------------------|----------------------------------------|
| `at $a.north`                                    | centered on a's top edge midpoint      |
| `at $a.north [anchor = south]`                   | bottom-center on a's top-center -> directly above, centered |
| `at $a.north-east [anchor = south]`              | bottom-center on a's top-right corner  |
| `at $a.north-east [anchor = south-east]`         | bottom-right on a's top-right corner -> above & left, hugging right edge |
| `at $a.north-west [anchor = south-west]`         | mirror — above & right, hugging left edge |
| `at $a.east [anchor = west]`                     | left edge on a's right edge midpoint -> sits to the right of a, vertically centred |

**Naming decision** (tentative, confirm at implementation): the
attribute is `anchor` (the own-anchor on the placed element). It is
**distinct from** `alignment`, which is reserved for ugrid-cell
positioning of an element within its allotted cell. Keep one word per
concept; never reuse `alignment` for anchor-relative placement.

**Default own-anchor:** `center`. The author overrides via
`[anchor = <name>]`.

**Implementation order** (extends step 3 of the plan below): when
arrange-phase B places an anchor-ref child, the placement routine must
take both the target-anchor coord and the own-anchor offset on the
child's measured bbox into account. Place the child so that its
own-anchor point lands on the target-anchor point.

```
target_xy   = compute_anchor(target_node,  target_anchor)
own_offset  = anchor_offset(child.measured, own_anchor)   # offset from child's top-left
child.x     = target_xy.x - own_offset.x
child.y     = target_xy.y - own_offset.y
```

`compute_anchor` is the same primitive (step 1). `anchor_offset` is
trivial arithmetic over `(measured.w, measured.h)` and the named
anchor.

## Connectors share the same primitive

Connectors are out of scope for this version, but the same anchor
vocabulary will be used on both endpoints:

```
$a.east -- $b.west                  # straight
$a.east --> $b.north                # arrowed
$a.east -| $b.north                 # L-shape (corner via -| operator)
```

Building the anchor primitive once unlocks both anchor-relative
placement and connector endpoints with no extra plumbing.

## Implementation plan

Three steps, roughly in order:

1. **Anchor primitive.** A pure function `compute_anchor(node, name) -> (x, y)`
   that reads `node.arranged` and returns the point. Add unit tests
   for the 9 anchor positions on a known bbox.

2. **Parser support for `at $id` and `at $id.anchor`.** Extend `at(...)`
   in the view-syntax parser to also accept `$IDENT` or
   `$IDENT.anchor-name`. AST stores `{kind: 'anchor-ref', target: id,
   anchor: name}` distinct from `{kind: 'cell', col, row}` and
   `{kind: 'pixel', x, y}`. View-compiler propagates the anchor-ref
   onto the layout tree node's `declared`.

3. **Two-phase arrange.** Modify `arrange()` to:
   - At each container, partition children into flow-set and anchor-ref-set.
   - Topologically sort anchor-ref-set by their target dependencies
     (cycle = error).
   - Arrange flow-set with the existing layout strategy.
   - Walk the topo-sorted anchor-ref-set, computing each target's
     anchor coord and placing the child centered on it.

After (3) lands, calc expressions become an additive feature
(arithmetic over `(x, y)` points produced by anchor resolution),
and connectors plug into the same `compute_anchor` function on both
endpoints.

## Open items to revisit during implementation

- Default own-anchor: confirm `center` is the best default vs `north-west`
  (which would make placement read as "place this element with its
  top-left corner at the target anchor" — closer to canvas semantics).
- Anchor coords on ugrid children: do they reflect the cell-stretched
  bounds (current arrange behavior) or the visual icon's intrinsic
  bounds? Probably cell-stretched (matches what authors see), but
  flag for confirmation when first real use case comes up.
- Re-measure parent on spill (fixed-parent vs grow): defaults to fixed;
  if real layouts need grow, add as a per-container flag.
