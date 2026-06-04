// Drag & drop subsystem — primitives that the InputManager + Visual
// route into, and the session object returned to authors.
//
// Spec: docs/superpowers/specs/2026-06-04-drag-and-drop-design.md
//
// Layered like the rest of the runtime — `DataObject` and
// `DragDropEffects` are pure data with no Visual dependency; the
// session and `DragDrop` static come later in the file once the
// `Visual` type is in scope through type-only imports.

// Flag enum — values are OR-able so receivers can write e.g.
// `args.Effect = DragDropEffects.Copy | DragDropEffects.Move`. Matches
// WPF's `System.Windows.DragDropEffects` shape.
export enum DragDropEffects
{
    None = 0,
    Copy = 1,
    Move = 2,
    Link = 4,
    All  = Copy | Move | Link,
}

// WPF-parity formats map. Per the spec (Q2: B), one source can publish
// the same payload under multiple format keys (e.g. `text/plain` and
// `application/x-mural-node` for a draggable that wants to interoperate
// with future text receivers). Receivers query the formats they
// understand via `Has(format)` / `Get(format)`.
//
// `Set` returns `this` for fluent chaining. Insertion order is preserved
// so `Formats()` is deterministic for tests.
export class DataObject
{
    private readonly entries: Map<string, unknown> = new Map();

    public Set(format: string, data: unknown): this
    {
        this.entries.set(format, data);
        return this;
    }

    public Get<T = unknown>(format: string): T | undefined
    {
        return this.entries.get(format) as T | undefined;
    }

    public Has(format: string): boolean
    {
        return this.entries.has(format);
    }

    public Formats(): readonly string[]
    {
        return [...this.entries.keys()];
    }
}
