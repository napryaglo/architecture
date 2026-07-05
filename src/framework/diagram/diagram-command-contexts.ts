import { ServiceKey } from '../../runtime/index.js';

// The command context a diagram document activates — the identity tag that joins
// the diagram's toolbar commands to the active document. A ServiceKey used purely
// as a context key (never resolved): a CommandDefinition declares
// `Context = DiagramEditingContext`, DiagramDocument exposes it in its live
// CommandContexts, and the ToolbarService shows the command iff the two match.
// Shareable — any document type that activates this context lights up the same
// commands.
export const DiagramEditingContext = new ServiceKey<unknown>('diagram.editing');

// Stable ids for the diagram's editing commands. DiagramDocument maps each to the
// Diagram control's corresponding command when it interprets Execute / CanExecute
// (see diagram-document.ts). An app declares matching CommandDefinitions (chrome)
// in its `.commands:` block with these exact Id strings — same markup-string ↔
// code-constant contract as SettingDefinition keys.
export enum DiagramCommandId
{
    AlignLeft   = 'diagram.align.left',
    AlignRight  = 'diagram.align.right',
    AlignTop    = 'diagram.align.top',
    AlignMiddle = 'diagram.align.middle',
    AlignCenter = 'diagram.align.center',
    DistributeHorizontal = 'diagram.distribute.horizontal',
    DistributeVertical   = 'diagram.distribute.vertical',
    Group   = 'diagram.group',
    Ungroup = 'diagram.ungroup',
    CombineUnion     = 'diagram.combine.union',
    CombineIntersect = 'diagram.combine.intersect',
    CombineSubtract  = 'diagram.combine.subtract',
    CombineExclude   = 'diagram.combine.exclude',
}
