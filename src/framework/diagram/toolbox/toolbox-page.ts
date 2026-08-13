import { MetaData, Model, ObservableCollection } from '../../../runtime/index.js';
import type { ToolboxItem } from './toolbox-item.js';

// One palette section: a titled, ordered set of items.
export class ToolboxPage extends Model
{
    public static readonly IdKey = Model.RegisterProperty<string>(
        ToolboxPage, 'Id', '', MetaData.None);
    public static readonly TitleKey = Model.RegisterProperty<string>(
        ToolboxPage, 'Title', '', MetaData.None);
    public static readonly ItemsKey = Model.RegisterProperty<ObservableCollection<ToolboxItem>>(
        ToolboxPage, 'Items', undefined as unknown as ObservableCollection<ToolboxItem>, MetaData.None);
    // Collapsed / expanded state for a palette section that renders as an
    // accordion. Settable so a header toggle can two-way bind `IsChecked` to it;
    // defaults expanded so a section shows its items until the user collapses it.
    public static readonly IsExpandedKey = Model.RegisterProperty<boolean>(
        ToolboxPage, 'IsExpanded', true, MetaData.None);

    constructor(id: string, title: string)
    {
        super();
        this.set_property_value(ToolboxPage.IdKey, id);
        this.set_property_value(ToolboxPage.TitleKey, title);
        this.set_property_value(ToolboxPage.ItemsKey, new ObservableCollection<ToolboxItem>());
    }

    public get Id():    string { return this.get_property_value(ToolboxPage.IdKey); }
    public get Title(): string { return this.get_property_value(ToolboxPage.TitleKey); }
    public get Items(): ObservableCollection<ToolboxItem> { return this.get_property_value(ToolboxPage.ItemsKey); }
    public get IsExpanded(): boolean { return this.get_property_value(ToolboxPage.IsExpandedKey); }
    public set IsExpanded(v: boolean) { this.set_property_value(ToolboxPage.IsExpandedKey, v); }
}
