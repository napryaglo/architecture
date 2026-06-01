// ICommand — the MVVM command contract that WPF popularised. Mural's
// shape mirrors System.Windows.Input.ICommand:
//
//   * Execute(parameter)         — perform the action.
//   * CanExecute(parameter)      — whether Execute is currently allowed.
//                                    Consumers (Buttons, MenuItems, …)
//                                    query this to gate user interaction.
//   * CanExecuteChanged listeners — notified when the command's
//                                    executability may have changed, so
//                                    consumers can re-query CanExecute
//                                    and update their UI state.
//
// The intent is the canonical Command pattern: the command encapsulates
// both the *what* (Execute) and the *when* (CanExecute), letting view
// models expose a single object that drives a control's enabled state
// and click action in lock-step.
//
// `parameter` is intentionally typed `unknown` so view models can pass
// any payload (an item to delete, a record id, …) without forcing every
// command implementation to declare a generic. Implementations narrow
// internally — this mirrors WPF's `object`-typed parameter.

export interface ICommand
{
    /**
     * Perform the command's action. Callers are responsible for
     * checking CanExecute first; the command itself is not required
     * to be idempotent or to internally re-check executability.
     */
    Execute(parameter?: unknown): void;

    /**
     * Whether Execute is allowed for the given parameter. Pure query
     * — implementations should not mutate state here.
     */
    CanExecute(parameter?: unknown): boolean;

    /**
     * Register a listener for CanExecuteChanged. The callback fires
     * whenever the command's executability may have transitioned;
     * consumers should re-query CanExecute in response.
     */
    AddCanExecuteChangedListener(listener: () => void): void;

    /** Reverse of AddCanExecuteChangedListener. Idempotent — removing
     *  an unregistered listener is a no-op. */
    RemoveCanExecuteChangedListener(listener: () => void): void;
}

// ── RelayCommand ────────────────────────────────────────────────────

// A drop-in ICommand implementation backed by a pair of callbacks.
// Equivalent to WPF / MVVM Toolkit's `RelayCommand`: the view model
// supplies the action (and optionally a guard); the command class
// handles the listener bookkeeping and CanExecuteChanged plumbing.
//
// View models with imperative re-evaluation needs (e.g., "selection
// changed, recompute") call `RaiseCanExecuteChanged()` to notify
// subscribers — Buttons / MenuItems re-query CanExecute and refresh
// their enabled state.
export class RelayCommand implements ICommand
{
    private readonly listeners: Set<() => void> = new Set();
    private readonly execute:    (parameter?: unknown) => void;
    private readonly canExecute: ((parameter?: unknown) => boolean) | undefined;

    constructor(
        execute:    (parameter?: unknown) => void,
        canExecute?: (parameter?: unknown) => boolean,
    )
    {
        this.execute    = execute;
        this.canExecute = canExecute;
    }

    public Execute(parameter?: unknown): void
    {
        this.execute(parameter);
    }

    public CanExecute(parameter?: unknown): boolean
    {
        return this.canExecute === undefined ? true : this.canExecute(parameter);
    }

    public AddCanExecuteChangedListener(listener: () => void): void
    {
        this.listeners.add(listener);
    }

    public RemoveCanExecuteChangedListener(listener: () => void): void
    {
        this.listeners.delete(listener);
    }

    // Notify subscribers that CanExecute may have transitioned. Snapshot
    // the listener set first so a subscriber that detaches itself from
    // within its callback doesn't perturb the iteration. Same pattern
    // as Button's click-handler snapshot.
    public RaiseCanExecuteChanged(): void
    {
        const snap = [...this.listeners];
        for (const cb of snap) cb();
    }
}
