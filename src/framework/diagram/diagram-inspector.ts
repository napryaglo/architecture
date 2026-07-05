import {
    MetaData,
    Model,
} from '../../runtime/index.js';
import { Inspector } from '../shell/services/inspector.js';
import type { Diagram } from './diagram.js';

// The diagram's inspector view-model — the "Format Shape" panel a diagram's
// context-menu command Add()s to the InspectorService, rendered via
// DataTemplate[DataType=DiagramInspector].
//
// An Inspector (Id 'diagram-format', Title 'Format Shape') so the host dedupes
// it by key — invoking Format Shape again re-surfaces the one panel rather than
// stacking duplicates.
//
// It carries a single reactive handle, `View`: the Diagram control currently
// editing the document (kept in sync with the document's ActiveView). The
// inspector template retargets its DataContext to `$View`, so the ShapeFormatControl
// binds the control's `$SelectionFormatFill` / `$SelectionFormatStroke` / cap DPs
// as SINGLE path segments — which are the reactive ones. Binding
// `ActiveDocument.ActiveView.SelectionFormatFill` from the shell would only react
// to its first segment and go stale on selection change; hopping through the
// VM's `View` DP first makes the format state track the live selection.
export class DiagramInspector extends Inspector
{
    public static readonly ViewKey = Model.RegisterProperty<Diagram | undefined>(
        DiagramInspector, 'View', undefined, MetaData.None);

    constructor()
    {
        super('diagram-format', 'Format Shape');
    }

    public get View(): Diagram | undefined { return this.get_property_value(DiagramInspector.ViewKey); }
    public set View(v: Diagram | undefined) { this.set_property_value(DiagramInspector.ViewKey, v); }
}
