# Connector-aware layout (channels in ugrid)

This document specifies how orthogonal connectors reserve cells in
their host `ugrid(C, R)` and how the layout iterates to make room for
them when they would otherwise cross component cells.

Status: **design** — implementation in progress.

## The problem

Currently the pipeline runs in two stages:

1. **Layout** — `ugrid` arranges components into cells the author declared.
2. **Connectors** — drawn AFTER layout, between the now-known component
   bounding boxes.

Stage 2 is geometric: a line is drawn between the endpoints regardless
of what's in between. If the line crosses another component's cell,
the line visually passes *through* that component. Authors have no way
to fix this short of moving components by hand on every layout change.

## What we want

Connectors should participate in layout. When an orthogonal connector
would cross a non-endpoint component, the layout inserts a *channel*
(a free row or column) for the connector to flow through. Components
on the far side of the channel shift their effective cell indices to
make room.

The author's `at (col, row)` declarations are NOT changed — they
describe the logical position. The grid grows under them to fit the
channels.

## Definitions

- **Declared cell**: the `(col, row)` the author wrote for a component.
- **Channel**: a row or column inserted to host a connector path.
  Channels are described by `(axis, position)` where `axis ∈ {row, col}`
  and `position` is a half-integer between two declared rows/cols.
  E.g., a row channel at position `1.5` sits between original rows 1
  and 2.
- **Effective cell**: the declared cell shifted by the number of
  channels inserted before it on each axis. Pixel positions and the
  parent's measured size derive from effective cells.
- **Connector path** (orthogonal): for `-|` (HV), horizontal segment
  along `src.row` from `src.col` to `target.col`, then vertical
  segment along `target.col` from `src.row` to `target.row`. For `|-`
  (VH), vertical first, then horizontal.
- **Path cells** (non-endpoint): the set of cells the connector
  segments pass *through*, excluding the source and target cells
  themselves. Computed in declared-cell coordinates.
- **Conflict**: a path cell that is also occupied by a component
  whose cells overlap (taking colspan/rowspan into account).

## Algorithm

```
MAX_ITERATIONS = 10

iter = 0
channels = []      # accumulating list of inserted channels
while iter < MAX_ITERATIONS:
    arrange(layout_tree, channels)            # places components
                                              # honoring channels
    paths = compute_orthogonal_paths(connectors, components, channels)
    conflicts = find_conflicts(paths, components)
    if not conflicts:
        break
    new_channels = resolve(conflicts)         # insert channels
    if not new_channels:
        # No way to insert — surface error (next section)
        raise LayoutError(conflicts)
    channels.extend(new_channels)
    iter += 1
else:
    raise LayoutError(
        f"connector-aware layout did not converge after {MAX_ITERATIONS} "
        f"iterations. Unresolved conflicts: ...")

draw_connectors_through_channels(paths, channels)
```

## Conflict resolution: where to insert a channel

For each conflicting path cell `(X, Y)` on a horizontal segment at row
`Y`:
- The path runs along row `Y` from `src.col` to `target.col`.
- A component with declared row `Y` sits at `(X, Y)`.
- Insert a row channel at position `Y - 0.5` (just above row `Y`) and
  re-route the segment along the channel instead of along row `Y`.

For a vertical segment at column `X`:
- The path runs along column `X` from `src.row` to `target.row`.
- A component with declared column `X` sits at `(X, Y)`.
- Insert a column channel at `X - 0.5` and re-route the segment along
  the channel.

**Direction choice** (above vs below for rows; left vs right for cols):
prefer the side closer to the connector's endpoint that is NOT in the
conflicting cell's row/col. Tie-broken by lower index.

**Channel sharing**: if a channel already exists at the chosen
position, the new connector reuses it. The channel's pixel width
grows enough to fit all connectors using it (each connector gets its
own track within the channel — typically connector stroke-width plus
a small spacer, multiplied by the count of connectors sharing).

## Cell index shifting

After channels are inserted, a component's declared `(col, row)` maps
to effective `(col', row')`:

```
col' = col + count(channels where axis=col and position < col)
row' = row + count(channels where axis=row and position < row)
```

Effective grid:
```
effective_cols = C + count(col channels)
effective_rows = R + count(row channels)
```

Channel cells get a fixed channel-width (default: stroke-width × 2 +
sharing-count × spacer). They are NOT cell_w / cell_h; the rest of
the grid uses cell_w / cell_h on the non-channel rows/cols.

This means cells are uniform in size *for components*, while channels
take only the space they need. Pixel x of declared col `n`:

```
x(n) = sum(channel_widths_before_n) + (n - 1 - col_channels_before_n) * cell_w
```

## Error: unresolvable conflicts

If two adjacent components have a connector between them and a third
component sits in the same row/col between them, no channel can be
inserted without separating the involved components further than the
grid allows. Surface as:

```
LayoutError: connector $x -| $y (path in row 3) cannot avoid component $z
at (4, 3). Either move $z out of row 3, or use [no-channel] on the connector.
```

The author's response is either to move the obstacle, or to opt the
connector out of channel reservation via `[no-channel]`.

## Per-connector opt-out

Authors can opt a connector out of channel reservation:

```
$a -| $b [no-channel]
```

Connector still routes orthogonally but without reserving cells. May
visually cross other components — author's responsibility.

## Scope

- **Phase 1 (now)**: ugrid only. Conflict detection + warnings.
- **Phase 2**: ugrid + channel insertion + iteration.
- **Phase 3** (future): extend to other containers (canvas absolute,
  stack flow). Each container needs its own conflict definition and
  channel-insertion semantics. Stack containers don't have explicit
  cells, so the model differs — possibly reserve gutter rows around
  the stack-flow path.

## Connectors that remain "geometric"

These do NOT participate in channel reservation:
- Straight (`--`, `-->`, `<--`, `<-->`) — drawn between endpoint coords;
  if they cross components, that's a layout problem the author solves
  by changing positions or switching to orthogonal.
- Connectors with `[no-channel]` flag.
- Connectors whose endpoints are in different ugrid containers (the
  channel concept is per-container; cross-container paths use plain
  geometry).

## Channels respect colspan / rowspan

A channel position cannot fall inside a cell range owned by a
component. The set of cells *owned* by a component placed at
`(col, row)` with `colspan = cs, rowspan = rs` is:

```
owned_cells = { (col + i, row + j)
                | 0 <= i < cs, 0 <= j < rs }
```

A column-channel at position `X.5` is **invalid** if there exists any
component such that `col <= X < col + cs` for that component (i.e.,
the channel would split the component's column range). Equivalently,
the channel is valid only between cell columns that are *outside* any
component's owned column range.

Same rule for row-channels: a row-channel at position `Y.5` is
invalid if any component has `row <= Y < row + rs`.

**Resolution algorithm consequence.** When picking a channel position
for a conflict at row `Y` (or col `X`), iterate from the chosen side
(typically `Y - 0.5` for "above") outward until a position is found
that doesn't bisect any component:

```
for delta in 1, 2, 3, ...:
    for side in (above, below):
        position = Y - 0.5 if side==above else Y + 0.5  # plus delta-1 shifts
        if no component owns cells crossing this position:
            use position
            stop
if no valid position found within container bounds:
    raise LayoutError
```

This means a channel may end up further from the conflicting cell than
the ideal position when a colspan/rowspan-extending component blocks
the immediate gap.

**Visual rule.** A channel never appears *inside* a component's bbox.
Components always render as one continuous box across their owned
cells. The channel either runs alongside the component (outside its
extent) or, in unresolvable cases, layout fails with an error.

## Open items to revisit during implementation

- Channel sharing tie-breaks when multiple paths could occupy the same
  channel position from different directions.
- Pixel-width formula for shared channels (how does a 5-connector channel
  visually distribute the connectors as parallel tracks).
