import type { Visual } from './visual.js';

// Per-instance map from x:Name to Visual. A NameScope is attached to a
// Visual (typically a template root or a top-level Window-equivalent),
// turning that Visual into a "scope boundary" for name lookups —
// `FindName(name)` from any descendant walks up the LOGICAL tree until
// it hits the nearest enclosing NameScope and resolves there.
//
// WPF parity:
//   * Same scoping rule: walk up logical ancestors, stop at first
//     NameScope, look up there.
//   * Multiple NameScopes can coexist on different branches of the
//     tree — a Window's namescope contains the consumer's named
//     elements; each instantiated ControlTemplate inside the Window
//     has its OWN namescope with template-part names.
//   * The same name CAN appear in two different namescopes without
//     collision (e.g., every Button instance has its own PART_Background
//     scoped to that Button's template instance).
//
// Names are registered once on construction; re-registering the same
// name throws (matches WPF behavior). Unregister is intentionally
// absent — namescopes get torn down with their owning Visual.
export class NameScope
{
    private readonly entries: Map<string, Visual> = new Map();

    public Register(name: string, visual: Visual): void
    {
        if (this.entries.has(name))
        {
            throw new Error(`NameScope: name '${name}' already registered.`);
        }
        this.entries.set(name, visual);
    }

    public Unregister(name: string): void
    {
        this.entries.delete(name);
    }

    public Find(name: string): Visual | undefined
    {
        return this.entries.get(name);
    }

    // Iterator over (name, visual) pairs. Useful for debugging /
    // tooling — not part of the FindName path.
    public *Entries(): IterableIterator<[string, Visual]>
    {
        yield* this.entries.entries();
    }
}
