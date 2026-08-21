import { MetaData, MuralBase } from '../../runtime/index.js';
import type { Diagram } from './diagram.js';

// A tab in the paged DiagramInspector. Both pages edit the SAME Diagram
// selection, so a page only carries a Title (for the rail) + View (the live
// Diagram); the page body binds through $View. The concrete subtype is the
// DataTemplate key (ShapeStylePage vs SizePositionPage).
export abstract class InspectorPage extends MuralBase
{
    public static readonly TitleKey = MuralBase.RegisterProperty<string>(
        InspectorPage, 'Title', '', MetaData.None);
    public static readonly ViewKey = MuralBase.RegisterProperty<Diagram | undefined>(
        InspectorPage, 'View', undefined, MetaData.None);

    protected constructor(title: string)
    {
        super();
        this.set_property_value(InspectorPage.TitleKey, title);
    }

    public get Title(): string { return this.get_property_value(InspectorPage.TitleKey); }
    public get View(): Diagram | undefined { return this.get_property_value(InspectorPage.ViewKey); }
    public set View(v: Diagram | undefined) { this.set_property_value(InspectorPage.ViewKey, v); }
}

export class ShapeStylePage extends InspectorPage { constructor() { super('Style'); } }
export class SizePositionPage extends InspectorPage { constructor() { super('Size & Position'); } }
