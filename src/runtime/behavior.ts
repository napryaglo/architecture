import { Model } from './model.js';
import type { Visual } from './visual.js';

// Behavior — third leg of the V / VM / B triangle (see CLAUDE.md).
// A markup-attachable object that hooks routed events, mutates Visual
// state, or wires per-Visual closures without polluting the VM. Author
// a Behavior the same way you author a Control:
//
//   * Subclass `Behavior`.
//   * Register DPs for the per-instance configuration (typically with
//     `MetaData.None` — behaviors rarely affect layout / render directly).
//   * Override `OnAttached(visual)` to wire listeners, set AllowDrop,
//     capture references, etc.
//
// Authored behaviors are then attached from markup via:
//
//   ListBox x:name="leftList" [ItemsSource=$LeftItems] {
//       Behaviors {
//           ListBoxDropBehavior [Vm=$, Side=Left]
//       }
//   }
//
// At template materialization the compiler emits `new ListBoxDropBehavior()`
// followed by the DP setters (Vm=$, Side=Left) and finally
// `_listBox.AddBehavior(_behavior)`. The base's AddBehavior stores the
// behavior and calls OnAttached so the wired-up sequence ALWAYS sees a
// behavior whose DPs are already populated.
//
// Version scope (see src/document/behaviors.md § 0 for the full table):
//   * Behaviors v1 — Behavior base + OnAttached + Visual.AddBehavior
//     + markup `Behaviors { … }` block.
//   * Behaviors v2 (this implementation extends v1) — OnDetached(visual)
//     hook auto-wired through Visual.AddBehavior. Fires whenever the
//     host Visual's visualParent transitions from defined to undefined
//     (every detach, not one-shot). Backed by the new
//     Visual.AddUnloadedListener primitive.
//   * Behaviors v3 (planned, not built) — DataTrigger-driven
//     conditional attach (≡ backlog item 9.2).
export abstract class Behavior extends Model
{
    // Wire whatever the behavior does — routed-event listeners,
    // AllowDrop flips, captured references. Called once per
    // AddBehavior, AFTER the behavior's DP setters have populated its
    // configuration. Receives the host Visual.
    public abstract OnAttached(visual: Visual): void;

    // Symmetric teardown hook. Fires every time the host Visual's
    // visualParent transitions from defined to undefined. Default is
    // a no-op so behaviors that don't need teardown can ignore it.
    // Override to unregister listeners, release resources, etc.
    //
    // Re-fire on re-attach: a Visual that's added → removed → added →
    // removed fires OnDetached twice. If a behavior wants once-only
    // semantics it can track that with a local boolean.
    public OnDetached(visual: Visual): void { void visual; }
}
