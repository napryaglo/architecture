import type { ServiceToken } from '../../../runtime/index.js';
import type { CommandDefinition } from './command-definition.js';

// ICommandTarget — the runtime command-handling surface an active document
// exposes. The ToolbarService dispatches every command to whatever document is
// active: it reads CommandContexts to decide which commands are VISIBLE, and
// calls Execute / CanExecute to run and gate them.
//
// Separate from IDocument on purpose: not every document handles commands (a
// settings page doesn't), so command handling is an OPT-IN capability a document
// implements. The ToolbarService duck-types the active document against this
// (see isCommandTarget) — a non-target active document simply yields an empty
// toolbar.
//
// CommandContexts is the LIVE set (the document "shows the contexts it
// supports") — usually seeded from its DocumentDefinition.CommandContexts, but a
// document MAY vary it by mode. Execute / CanExecute receive the whole
// CommandDefinition; a handler keys on Id (and gets Context / Title for free if
// it wants them).
export interface ICommandTarget
{
    // The command contexts currently active for this document. A command whose
    // Context is in this set is shown on the toolbar; others are hidden.
    readonly CommandContexts: readonly ServiceToken<unknown>[];

    // Run the command. Called only after CanExecute has gated it (the toolbar
    // button won't dispatch a disabled command), but a handler should still be
    // defensive. No-op for an unrecognised definition.
    Execute(definition: CommandDefinition): void;

    // Whether the command can currently run (drives button enablement). Re-
    // queried on the CommandManager.RequerySuggested pulse and on active-document
    // change. Return false for an unrecognised or currently-invalid definition.
    CanExecute(definition: CommandDefinition): boolean;

    // Whether the command is in its ACTIVE / checked state (drives a Toggles-
    // presentation button's IsChecked). Optional — a target that has no toggle
    // commands need not implement it. Re-queried on the same signals as
    // CanExecute. Return false for a non-toggle or unrecognised definition.
    IsActive?(definition: CommandDefinition): boolean;
}

// Duck-type guard — an active document is a command target when it exposes the
// three members. Kept structural (not instanceof) so any document MuralBase can opt
// in without importing a base class, mirroring the diagram's IDiagramViewHost /
// DiagramMutator duck-typing.
export function isCommandTarget(value: unknown): value is ICommandTarget
{
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Partial<ICommandTarget>;
    return typeof v.Execute === 'function'
        && typeof v.CanExecute === 'function'
        && v.CommandContexts !== undefined;
}
