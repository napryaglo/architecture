import {
    Model,
    RelayCommand,
    type CommandBase,
} from '../../../runtime/index.js';
import { findDescriptor } from '../../../runtime/model-internals.js';
import type { Diagram } from '../diagram.js';
import {
    alignLeft,
    alignRight,
    alignTop,
    alignMiddle,
    alignCenter,
    type AlignTarget,
} from '../commands/align.js';
import {
    distributeHorizontal,
    distributeVertical,
} from '../commands/distribute.js';
import {
    selectedTopLevel,
    selectedTopLevelGroups,
} from '../commands/group-ops.js';
import {
    GeometryCombineMode,
    isGeometricItem,
    type IGeometricItem,
} from '../commands/combine.js';

// Internal collaborator owned by Diagram. Owns the default RelayCommand
// instances installed onto Diagram's Command DPs at construction time.
// Consumers can override any command by writing their own RelayCommand
// to the corresponding Diagram DP — last-writer-wins per § 7.1 of
// [src/document/diagram-control.md](../../document/diagram-control.md).
// Default impls run after the constructor; consumer writes happen later
// and naturally shadow.
//
// Phase D ships the 5 align commands (Left / Right / Top / Middle /
// Center). Phases E-G add Distribute, Group / Ungroup, and Combine.
//
// CanExecute guards: alignment requires ≥ 2 IFigure-shaped selected
// items. SelectionChanged subscription drives RaiseCanExecuteChanged
// on every command so bound Buttons / MenuItems re-query enabled state
// without per-command wiring on the consumer side.
export class DiagramCommands
{
    private readonly _diagram: Diagram;

    // Cached command refs — used by the SelectionChanged listener to
    // fan out RaiseCanExecuteChanged. Indexed by name so future
    // additions (distribute, group/ungroup, combine) stay tidy here.
    private readonly _commands: Map<string, CommandBase> = new Map();

    constructor(diagram: Diagram)
    {
        this._diagram = diagram;
        this._installAlignCommands();
        this._installDistributeCommands();
        this._installGroupCommands();
        this._installCombineCommands();
        diagram.AddSelectionChangedListener(() => this._raiseCanExecuteAll());
    }

    private _installAlignCommands(): void
    {
        const canAlign = (): boolean => this._collectSelected().length >= 2;
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;

        this._install(Diagram.AlignLeftCommandKey, 'AlignLeft',
            new RelayCommand(() => alignLeft(this._collectSelected()), canAlign,
                { Text: 'Align Left',   Description: 'Align selected shapes to the left edge of the leftmost shape.' }));
        this._install(Diagram.AlignRightCommandKey, 'AlignRight',
            new RelayCommand(() => alignRight(this._collectSelected()), canAlign,
                { Text: 'Align Right',  Description: 'Align selected shapes to the right edge of the rightmost shape.' }));
        this._install(Diagram.AlignTopCommandKey, 'AlignTop',
            new RelayCommand(() => alignTop(this._collectSelected()), canAlign,
                { Text: 'Align Top',    Description: 'Align selected shapes to the top edge of the topmost shape.' }));
        this._install(Diagram.AlignMiddleCommandKey, 'AlignMiddle',
            new RelayCommand(() => alignMiddle(this._collectSelected()), canAlign,
                { Text: 'Align Middle', Description: 'Center selected shapes vertically on a shared horizontal axis.' }));
        this._install(Diagram.AlignCenterCommandKey, 'AlignCenter',
            new RelayCommand(() => alignCenter(this._collectSelected()), canAlign,
                { Text: 'Align Center', Description: 'Center selected shapes horizontally on a shared vertical axis.' }));
    }

    private _installDistributeCommands(): void
    {
        const canDistribute = (): boolean => this._collectSelected().length >= 3;
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;

        this._install(Diagram.DistributeHorizontalCommandKey, 'DistributeHorizontal',
            new RelayCommand(() => distributeHorizontal(this._collectSelected()), canDistribute,
                { Text: 'Distribute Horizontally', Description: 'Space three or more shapes evenly between the leftmost and rightmost.' }));
        this._install(Diagram.DistributeVerticalCommandKey, 'DistributeVertical',
            new RelayCommand(() => distributeVertical(this._collectSelected()), canDistribute,
                { Text: 'Distribute Vertically',   Description: 'Space three or more shapes evenly between the topmost and bottommost.' }));
    }

    private _installGroupCommands(): void
    {
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;

        const canGroup   = (): boolean => selectedTopLevel(this._diagram.SelectedItems).length >= 2;
        const canUngroup = (): boolean => selectedTopLevelGroups(this._diagram.SelectedItems).length >= 1;

        this._install(Diagram.GroupCommandKey, 'Group',
            new RelayCommand(
                () => this._diagram._fireGroupRequested({ Items: selectedTopLevel(this._diagram.SelectedItems) }),
                canGroup,
                { Text: 'Group', Description: 'Wrap the current top-level selection in a new group.' }));
        this._install(Diagram.UngroupCommandKey, 'Ungroup',
            new RelayCommand(
                () => this._diagram._fireUngroupRequested({ Groups: selectedTopLevelGroups(this._diagram.SelectedItems) }),
                canUngroup,
                { Text: 'Ungroup', Description: 'Dissolve the currently-selected group(s), re-parenting their members to the surrounding scope.' }));
    }

    private _installCombineCommands(): void
    {
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;

        // Combine needs ≥ 2 selected items that EACH have a Geometry —
        // the merge op needs something to fold. Items without Geometry
        // (text-only labels, etc.) are silently excluded.
        const canCombine = (): boolean => this._collectCombinable().length >= 2;

        const fireCombine = (mode: GeometryCombineMode): (() => void) => () =>
            this._diagram._fireCombineRequested({
                Items: this._collectCombinable(),
                Mode:  mode,
            });

        this._install(Diagram.CombineUnionCommandKey, 'CombineUnion',
            new RelayCommand(fireCombine(GeometryCombineMode.Union), canCombine,
                { Text: 'Combine — Union',     Description: 'Merge the selected shapes into a single union.' }));
        this._install(Diagram.CombineIntersectCommandKey, 'CombineIntersect',
            new RelayCommand(fireCombine(GeometryCombineMode.Intersect), canCombine,
                { Text: 'Combine — Intersect', Description: 'Keep only the overlapping area of the selected shapes.' }));
        this._install(Diagram.CombineSubtractCommandKey, 'CombineSubtract',
            new RelayCommand(fireCombine(GeometryCombineMode.Exclude), canCombine,
                { Text: 'Combine — Subtract',  Description: 'Subtract subsequent shapes from the first.' }));
        this._install(Diagram.CombineExcludeCommandKey, 'CombineExclude',
            new RelayCommand(fireCombine(GeometryCombineMode.Xor), canCombine,
                { Text: 'Combine — Exclude',   Description: 'Keep only the non-overlapping areas (XOR).' }));
    }

    private _collectCombinable(): (import('../../../runtime/index.js').Model & IGeometricItem)[]
    {
        const out: (import('../../../runtime/index.js').Model & IGeometricItem)[] = [];
        for (const item of this._diagram.SelectedItems)
        {
            if (isGeometricItem(item)) out.push(item);
        }
        return out;
    }

    private _install(key: import('../../../runtime/index.js').PropertyKey<RelayCommand | undefined>, name: string, command: RelayCommand): void
    {
        this._diagram.set_property_value(key, command);
        this._commands.set(name, command);
    }

    // Re-evaluate every command's CanExecute. Drives Button.IsEnabled
    // update — the binding pipeline subscribes to each command's
    // CanExecuteChanged event, which RaiseCanExecuteChanged fires.
    private _raiseCanExecuteAll(): void
    {
        for (const cmd of this._commands.values())
        {
            cmd.RaiseCanExecuteChanged();
        }
    }

    private _collectSelected(): AlignTarget[]
    {
        const out: AlignTarget[] = [];
        for (const item of this._diagram.SelectedItems)
        {
            if (this._isFigureShape(item))
            {
                out.push(item as unknown as AlignTarget);
            }
        }
        return out;
    }

    private _isFigureShape(item: unknown): item is Model
    {
        if (!(item instanceof Model)) return false;
        const klass = item.constructor as Function;
        return findDescriptor(klass, 'X')      !== undefined
            && findDescriptor(klass, 'Y')      !== undefined
            && findDescriptor(klass, 'Width')  !== undefined
            && findDescriptor(klass, 'Height') !== undefined;
    }
}
