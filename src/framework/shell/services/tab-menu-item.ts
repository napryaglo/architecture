import { MetaData, MuralBase, type ICommand } from '../../../runtime/index.js';
import type { IDocument } from './documents-content-host-service.js';

// The heterogeneous rows of the editor tab-strip overflow menu (the ⋯ dropdown).
// DocumentsContentHostService synthesises one flat list — an action, a separator,
// then one row per open document — which the ExtendedTabControl's dropdown binds
// as its ItemsSource. Each kind is a distinct MuralBase TYPE so the flyout resolves
// it by IMPLICIT DataTemplate-by-type (no template selector needed): the host app
// ships a DataTemplate[TabMenuAction] / [TabMenuSeparator] / [TabMenuDocument].
//
// The rows are plain data holders — behaviour stays on the host's commands
// (CloseAllCommand / ActivateDocumentCommand / CloseDocumentCommand), which the
// row templates bind through `$service(ContentHostService)`.

// A one-shot action row (today: "Close All"). Carries its own label + command so
// the same type can serve future menu actions.
export class TabMenuAction extends MuralBase
{
    public static readonly LabelKey = MuralBase.RegisterProperty<string>(
        TabMenuAction, 'Label', '', MetaData.None);
    public static readonly CommandKey = MuralBase.RegisterProperty<ICommand | undefined>(
        TabMenuAction, 'Command', undefined, MetaData.None);

    constructor(label: string, command: ICommand)
    {
        super();
        this.set_property_value(TabMenuAction.LabelKey, label);
        this.set_property_value(TabMenuAction.CommandKey, command);
    }

    public get Label(): string { return this.get_property_value(TabMenuAction.LabelKey); }
    public get Command(): ICommand | undefined { return this.get_property_value(TabMenuAction.CommandKey); }
}

// A horizontal rule between the action block and the document list.
export class TabMenuSeparator extends MuralBase { }

// One open-document row: click the title to activate it, ✕ to close it. Title and
// Id are copied off the document as DPs so a row template can bind them directly
// ($Title / $Id) — Id is the parameter passed to the activate / close commands.
export class TabMenuDocument extends MuralBase
{
    public static readonly TitleKey = MuralBase.RegisterProperty<string>(
        TabMenuDocument, 'Title', '', MetaData.None);
    public static readonly IdKey = MuralBase.RegisterProperty<string>(
        TabMenuDocument, 'Id', '', MetaData.None);

    constructor(document: IDocument)
    {
        super();
        this.set_property_value(TabMenuDocument.TitleKey, document.Title);
        this.set_property_value(TabMenuDocument.IdKey, document.Id);
    }

    public get Title(): string { return this.get_property_value(TabMenuDocument.TitleKey); }
    public get Id(): string { return this.get_property_value(TabMenuDocument.IdKey); }
}
