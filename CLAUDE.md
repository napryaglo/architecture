# CLAUDE.md

## Workflow rules

- **Do not use the `superpowers` skills** (brainstorming, writing-plans,
  executing-plans, TDD, etc.). No spec docs, no plan files, no design-approval
  gates. Just do the work directly.

## Architecture rules

- **List-based controls descend from `ItemsControl`.** Any new control whose
  purpose is to render a collection of items (ListBox, ComboBox, TreeView,
  TabControl, DataGrid, ItemsRepeater, Menu, BreadcrumbBar, …) must extend
  `ItemsControl` rather than rolling its own item materialization. Subclass
  overrides — `GetContainerForItemOverride`, `PrepareContainerForItemOverride`,
  `ClearContainerForItemOverride` — are the seams for control-specific
  container types (ListBoxItem, TabItem, …) and behavior (selection, press,
  drag handles, etc.). `ItemContainerStyle` + `ItemTemplate(Selector)` +
  `AlternationIndex` + `HasItems` + `ItemsSource`/`CollectionView` are all
  inherited for free. Existing controls that predate this rule
  (`ListBox`, `TreeView`, `ComboBox`) are grandfathered but should be
  consolidated onto `ItemsControl` opportunistically. Deviate only when the
  user explicitly asks for a from-scratch implementation; otherwise this is
  the default.

## MVVM rules

A "VM" is any file whose role is to expose data and commands to a view —
in this repo, that's typically `*-vm.mjs` files under `demo/demos/`. These
rules govern those files. They do NOT apply to framework code, control
implementations, or behaviors.

- **VMs MUST NOT reach into the view tree.** No `view.FindName(...)`,
  no `visualChildren[N]`, no `ItemsControl.Generator.ContainerFromItem`,
  no `templatedParent` walks. *Why:* every such reach hardcodes the
  template's structure into the VM; any markup rename becomes a VM
  change. *How to apply:* if the VM needs to react to view state, the
  view publishes it via a binding source or a routed event the VM
  subscribes to from outside the tree (e.g. a Command on the VM).

- **VMs MUST NOT import view-layer modules.** Permitted runtime
  imports: `@visualisation-sub/mural/runtime` (DPs, bindings, ICommand,
  ObservableCollection, primitives, routed event TYPES). Forbidden:
  `Controls`, `visual-engine`, any host target. No `Border`, `Canvas`,
  `Line`, `SolidColorBrush`, `Color` references in VM code. *Why:* the
  moment a VM types view objects, swapping the template or the host
  backend requires VM edits. *How to apply:* if `instanceof Border`
  feels necessary, the logic belongs in a Behavior or Control. If
  brushes/colors need to drive bindings, the VM exposes them as
  opaque strings/values and a ValueConverter on the view side
  materializes them.

- **View-observable state lives on DPs, never on closure variables or
  plain fields.** `let selectedNode = null` inside `OnViewMounted` is
  a bug — it must be `SelectedNode` on the VM via `RegisterProperty`.
  Same for mode flags (`isBusy`, `isDragging`), current selection,
  hover state, current page, current tool. *Why:* plain locals are
  unbindable, unobservable, and invisible to future view consumers
  (inspector panes, command-availability bindings). *How to apply:*
  if you write `let X` or `this.X =` and a view might want to read or
  react to X, convert to a DP. Plain fields are reserved for
  genuinely view-invisible state (timer handles, ID counters,
  unsubscribe closures, internal caches).

- **VMs MUST NOT mutate Visuals or attach routed-event listeners to
  Visuals.** No `someVisual.Background = ...`, no
  `someVisual.AddRoutedEventListener(...)` from VM code. View
  reactions go through Style triggers, DataTemplate triggers, and
  Storyboards. User input goes through routed-event triggers in
  markup (`on PointerDown { … }`) wired to VM ICommands or VM
  methods exposed as triggers. *Why:* a VM that mutates view objects
  IS the View, just written in JS. The point of MVVM is that view
  reactions are declared in the view layer. *How to apply:* if the
  needed reaction can't be expressed in triggers + bindings, write a
  Behavior class that attaches to the view; never inline view
  mutation into the VM.

- **VMs MUST NOT touch host globals.** No `document.addEventListener`,
  no `window.localStorage`, no `window.fetch`, no `setTimeout` that
  outlives a single function call, no `navigator.*`. *Why:* VMs become
  impossible to test off-browser; they leak across navigations; they
  couple to one host. *How to apply:* keyboard input → `on KeyDown`
  triggers in markup bound to commands. Persistence → an
  `IStorageService` (or equivalent) passed to the VM's constructor.
  Network → an injected service. The demo's factory file supplies
  concrete implementations; the VM accepts the abstraction.

- **VMs MUST NOT build Visuals.** No `new Line()`, `new Border()`,
  `canvas.AddChild(visual)` from VM code. *Why:* imperative Visual
  construction bypasses templates, bindings, and styles, and tangles
  view lifecycle into VM control flow. *How to apply:* state the
  view needs (e.g. rubber-band endpoints during a drag) goes on the
  VM as DPs; the view declares the Visual in markup and binds it.
  If the dynamic shape can't be expressed in templates, write a
  Behavior — never construct Visuals from a VM.

### Escape hatch

If a task seems to require breaking one of these rules, STOP and tell
the user the framework is missing a primitive (typically: a Behavior
system, a service abstraction, a missing trigger type). Do not
silently break a rule to "get the demo working." The point of these
rules is that the violations reveal framework gaps; quietly absorbing
them in the VM hides the gap.

## Behaviors

A "Behavior" is the standard third leg of the MVVM triangle (V / VM /
B). Behaviors absorb view-layer concerns that can't be expressed in
markup triggers or bindings — typically: state machines spanning
multiple visuals, view-coordinate math, imperative scene-tree mutation,
or complex event-sequencing — without polluting the VM.

**Location.** Demo-local behaviors live at `demo/demos/<demo>/behaviors/`
as `*-behavior.mjs` files. Reusable behaviors that ship with the
framework eventually live alongside controls in `src/Controls/behaviors/`,
but no behavior gets promoted there until at least two demos need it.

**Shape.** A behavior exports one or more attach functions:

```js
export function attachThing(visual, vmOrConfig) {
    // free to FindName, AddRoutedEventListener, mutate Visuals
    // …
    return function detach() { /* unwire */ };
}
```

The returned `detach` is mandatory: container recycling, demo
deactivation, and live-edit reloads all need a clean way to unwire.

**Rules behaviors follow.**

- **Behaviors MAY do what VMs CAN'T.** `FindName`, `visualChildren[N]`,
  `AddRoutedEventListener`, direct Visual mutation, building Visuals
  imperatively — all fair game. That's the whole point.
- **Behaviors MUST NOT hold domain state.** Selection, items, mode
  flags belong on the VM. Behaviors hold view-only transient state
  (hover counters, timer handles, drag-from coordinates, etc.).
- **Behaviors translate view events into VM writes.** The "output" of
  a behavior is updates to VM DPs and/or invocations of VM commands.
  If you find a behavior implementing business logic (validation,
  persistence, computing derived state from VM data), that logic
  belongs on the VM.
- **Behaviors MUST be detachable.** Always return a `detach` thunk
  that removes every listener and clears every timer. No exceptions.
- **Behaviors are wired from the bootstrap, not the VM.** The demo's
  `*.mjs` entry point (or a thin view-init helper) calls `attachFoo`
  after view materialization. The VM never imports a behavior.

**When to write a behavior vs. when to extend the framework.** If the
same view-layer pattern shows up in three demos, it's a candidate for
either (a) a framework primitive (new trigger action, new attached
property, new Control) or (b) a shared behavior moved to
`src/Controls/behaviors/`. A behavior in one demo is fine; a behavior
copy-pasted across demos is a framework-gap signal.