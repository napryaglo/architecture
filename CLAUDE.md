# CLAUDE.md

## Workflow

- Do not use the `superpowers` skills. No spec docs, no plan files, no
  design-approval gates.

## Architecture

- **List-based controls descend from `ItemsControl`.** Use its overrides
  (`GetContainerForItemOverride`, `PrepareContainerForItemOverride`,
  `ClearContainerForItemOverride`) for control-specific containers and
  behavior. `ListBox`, `TreeView`, `ComboBox` are grandfathered.

- **Every control MUST have a default Style.** No
  `Application.ResolveDefaultResource(stringKey)` or `resolveXxxTemplate`
  helpers from a control's ctor. Every template a control needs is a
  `ControlTemplate` DP (`Template`, `RowTemplate`, `TriggerTemplate`, …)
  set on the control's default Style block in a `*.template.mu` file.
  The ctor calls `applyDefaultStyle()` then reads the DPs. Undefined at
  use time means the surface theme wasn't registered — fix the bundle
  wiring, don't paper over with a string lookup.

## MVVM

Apply to `*-vm.mjs` files under `demo/demos/`. Not framework, controls,
or behaviors.

- **No view-tree reads.** No `view.FindName`, `visualChildren[N]`,
  `Generator.ContainerFromItem`, `templatedParent`. View publishes state
  via bindings / routed events the VM subscribes to from outside the
  tree.
- **No view-layer imports.** Permitted: `@visualisation-sub/mural/runtime`
  (DPs, bindings, ICommand, ObservableCollection, primitives, routed
  event TYPES). Forbidden: `Basic`, `visual-engine`, any host target. No
  `Border`, `Canvas`, `Line`, `SolidColorBrush`, `Color` in VM code.
- **View-observable state lives on DPs.** No closure variables, no
  plain fields for state a view might read or react to. Plain fields
  only for genuinely view-invisible state (timers, IDs, unsubscribes,
  caches).
- **No Visual mutation, no routed-event listeners on Visuals.** View
  reactions go through Style triggers, DataTemplate triggers, Storyboards.
  Input goes through markup routed-event triggers wired to VM ICommands
  or methods. Can't express it that way → Behavior.
- **No host globals.** No `document`, `window`, `navigator`, no
  `setTimeout` outliving one function call. Keyboard → markup
  triggers → commands. Persistence / network → injected service.
- **No Visual construction.** No `new Border()`, `canvas.AddChild`. State
  the view needs goes on the VM as DPs; the view declares the Visual and
  binds it. Dynamic shape that won't fit templates → Behavior.

**Escape hatch.** If a rule blocks the task, STOP and flag the framework
gap (missing Behavior system, service abstraction, trigger type). Don't
silently break a rule.

## Behaviors

Third leg of MVVM (V / VM / B). Absorb view-layer concerns that don't
fit markup triggers or bindings.

- **Location.** Demo-local: `demo/demos/<demo>/behaviors/*-behavior.mjs`.
  Promote to `src/Basic/behaviors/` only when ≥ 2 demos need it.
- **Shape.** Export `attachThing(visual, vmOrConfig)` returning a
  mandatory `detach` thunk.
- **MAY do what VMs CAN'T.** `FindName`, `visualChildren[N]`,
  `AddRoutedEventListener`, Visual mutation, Visual construction — all
  fair game.
- **MUST NOT hold domain state.** Selection, items, mode flags belong
  on the VM. Behaviors hold view-only transient state.
- **Translate view events into VM writes.** Output is VM DP updates or
  command invocations. Business logic belongs on the VM.
- **MUST be detachable.** `detach` removes every listener, clears every
  timer.
- **Wired from the bootstrap.** Demo's `*.mjs` entry point calls
  `attachFoo` after view materialization. The VM never imports a
  behavior.

**Promote vs. extend the framework.** Same pattern in 3 demos →
candidate for a framework primitive (trigger action, attached property,
Control) or a shared behavior in `src/Basic/behaviors/`. Copy-pasted
behavior across demos is a framework-gap signal.
