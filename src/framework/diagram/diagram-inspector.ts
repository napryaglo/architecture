import {
    MetaData,
    Model,
    ObservableCollection,
} from '../../runtime/index.js';
import { Inspector } from '../shell/services/inspector.js';
import type { Diagram } from './diagram.js';
import { InspectorPage, ShapeStylePage, SizePositionPage } from './inspector-pages.js';

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
// inspector is a PAGED container: `Pages` holds the tabs (Style +
// Size & Position), `SelectedPage` drives the rail + content presenter. Each
// page holds `View` (propagated below), and its body binds the Diagram's
// SINGLE-segment reactive selection DPs ($SelectionFormat* / $SelectedShape*)
// through that View — the same reason the old single-page template retargeted
// its DataContext to $View.
export class DiagramInspector extends Inspector
{
    public static readonly ViewKey = Model.RegisterProperty<Diagram | undefined>(
        DiagramInspector, 'View', undefined, MetaData.None);
    public static readonly PagesKey = Model.RegisterProperty<ObservableCollection<InspectorPage>>(
        DiagramInspector, 'Pages', undefined as unknown as ObservableCollection<InspectorPage>, MetaData.None);
    public static readonly SelectedPageKey = Model.RegisterProperty<InspectorPage | undefined>(
        DiagramInspector, 'SelectedPage', undefined, MetaData.None | MetaData.BindsTwoWayByDefault);

    constructor()
    {
        super('diagram-format', 'Format Shape');
        const pages = new ObservableCollection<InspectorPage>();
        pages.Add(new ShapeStylePage());
        pages.Add(new SizePositionPage());
        this.set_property_value(DiagramInspector.PagesKey, pages);
        this.set_property_value(DiagramInspector.SelectedPageKey, pages.Get(0));
    }

    public get View(): Diagram | undefined { return this.get_property_value(DiagramInspector.ViewKey); }
    public set View(v: Diagram | undefined)
    {
        this.set_property_value(DiagramInspector.ViewKey, v);
        for (const p of this.Pages) p.View = v;
    }
    public get Pages(): ObservableCollection<InspectorPage> { return this.get_property_value(DiagramInspector.PagesKey); }
    public get SelectedPage(): InspectorPage | undefined { return this.get_property_value(DiagramInspector.SelectedPageKey); }
    public set SelectedPage(v: InspectorPage | undefined) { this.set_property_value(DiagramInspector.SelectedPageKey, v); }
}
