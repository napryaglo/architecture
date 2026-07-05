// A service that presents itself when it becomes the shell's active content.
//
// NavigationService calls OnActivated() on the ActiveService whenever the
// active capability changes (a rail switch). This is the piece the imperative
// "present on selection change" model (DocumentSelectorService →
// ContentHostService.View) misses: when several selectors share ONE content
// host, returning to an already-visited selector doesn't change that
// selector's own selection, so it never re-pushes its content and the host
// keeps showing the previously-active selector's item. OnActivated is the
// re-present hook — the newly-active service pushes its current state again.
//
// NavigationService only knows this interface, not any concrete service, so
// the coupling stays a one-method contract. Implementers: DocumentSelectorService
// (re-presents its current selection); an app service can implement it for any
// "refresh when I become visible" need.
export interface IActivatable
{
    OnActivated(): void;
}
