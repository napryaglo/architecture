// Diagram.DeleteRequested — fired when the user presses Delete /
// Backspace with a non-empty selection. Same event-based mutation
// contract as Group / Ungroup / Combine: the framework knows what
// the user asked to remove, but not where the items live; the
// consumer's listener does the data-collection mutation.
//
// `Items` is the snapshot of SelectedItems at keypress time — the
// listener can rely on it being stable (the framework doesn't mutate
// it after fire), which matters when the consumer clears selection
// as part of the removal.

export interface DeleteRequestedArgs
{
    readonly Items: readonly unknown[];
}

export type DeleteRequestedListener = (args: DeleteRequestedArgs) => void;
