import {
    MetaData,
    Model,
    ObservableCollection,
} from '../../../runtime/index.js';

// The value shape a setting carries — drives which editor a settings pane
// renders (Boolean → toggle, Choice → picker, Color → colour editor, …) and how
// a persisted value is interpreted. A markup-facing enum (authors write
// `Kind = Boolean` in a module's `.settings:` block), so it is registered in the
// compiler's symbol table (SettingKind in DEFAULT_SYMBOLS + ENUM_MEMBERS, and
// under the `Kind` property in PROPERTY_TO_ENUM). Explicit string values keep
// the wire/persisted form stable.
export enum SettingKind
{
    Boolean  = 'boolean',
    Number   = 'number',
    String   = 'string',
    Choice   = 'choice',
    Color    = 'color',
    FilePath = 'filePath',
}

// A setting's SCHEMA — what a module declares in its `.settings:` block. It says
// what the setting IS (key, type, default, metadata); the live, user-modifiable
// VALUE lives on a `Setting` the ApplicationSettings service builds from this.
//
// A Model so it is DP-backed, bindable, and declarable in markup:
//
//     module DiagramModule [ Name = "Diagram" ] {
//         .settings: {
//             SettingDefinition [ Key = "diagram.grid.snap", Label = "Snap to grid",
//                                 Kind = Boolean, Default = true, Category = "Diagram" ]
//         }
//     }
//
// The `.settings:` block is a generic member-block: each entry is appended to the
// module's `Settings` collection (module.Settings.Add(def)), so no bespoke
// compiler grammar is needed — only the symbol-table registration above.
export class SettingDefinition extends Model
{
    // Unique, stable id — namespace by module ("diagram.grid.snap"). The
    // persistence key and the ApplicationSettings lookup key.
    public static readonly KeyKey = Model.RegisterProperty<string>(
        SettingDefinition, 'Key', '', MetaData.None);

    // Display name shown in a settings pane row.
    public static readonly LabelKey = Model.RegisterProperty<string>(
        SettingDefinition, 'Label', '', MetaData.None);

    // Longer help text for the row.
    public static readonly DescriptionKey = Model.RegisterProperty<string>(
        SettingDefinition, 'Description', '', MetaData.None);

    // Grouping bucket in a settings pane ("Diagram", "Appearance", …).
    public static readonly CategoryKey = Model.RegisterProperty<string>(
        SettingDefinition, 'Category', '', MetaData.None);

    // The value shape — picks the editor and the parse/serialize path.
    public static readonly KindKey = Model.RegisterProperty<SettingKind>(
        SettingDefinition, 'Kind', SettingKind.String, MetaData.None);

    // The value used when nothing is persisted. Typed unknown: a bool for
    // Boolean, a number for Number, a Color for Color, a string for String /
    // FilePath / Choice.
    public static readonly DefaultKey = Model.RegisterProperty<unknown>(
        SettingDefinition, 'Default', undefined, MetaData.None);

    // The option list for Kind = Choice (ignored otherwise). Populated
    // programmatically for now; declaring the option list in `.settings:` markup
    // is a follow-up (needs a choices sub-block).
    public static readonly ChoicesKey = Model.RegisterProperty<ObservableCollection<string> | undefined>(
        SettingDefinition, 'Choices', undefined, MetaData.None);

    // Bounds for Kind = Number (ignored otherwise).
    public static readonly MinKey = Model.RegisterProperty<number>(
        SettingDefinition, 'Min', Number.NEGATIVE_INFINITY, MetaData.None);

    public static readonly MaxKey = Model.RegisterProperty<number>(
        SettingDefinition, 'Max', Number.POSITIVE_INFINITY, MetaData.None);

    public get Key(): string  { return this.get_property_value(SettingDefinition.KeyKey); }
    public set Key(v: string) { this.set_property_value(SettingDefinition.KeyKey, v); }

    public get Label(): string  { return this.get_property_value(SettingDefinition.LabelKey); }
    public set Label(v: string) { this.set_property_value(SettingDefinition.LabelKey, v); }

    public get Description(): string  { return this.get_property_value(SettingDefinition.DescriptionKey); }
    public set Description(v: string) { this.set_property_value(SettingDefinition.DescriptionKey, v); }

    public get Category(): string  { return this.get_property_value(SettingDefinition.CategoryKey); }
    public set Category(v: string) { this.set_property_value(SettingDefinition.CategoryKey, v); }

    public get Kind(): SettingKind  { return this.get_property_value(SettingDefinition.KindKey); }
    public set Kind(v: SettingKind) { this.set_property_value(SettingDefinition.KindKey, v); }

    public get Default(): unknown  { return this.get_property_value(SettingDefinition.DefaultKey); }
    public set Default(v: unknown) { this.set_property_value(SettingDefinition.DefaultKey, v); }

    public get Choices(): ObservableCollection<string> | undefined  { return this.get_property_value(SettingDefinition.ChoicesKey); }
    public set Choices(v: ObservableCollection<string> | undefined) { this.set_property_value(SettingDefinition.ChoicesKey, v); }

    public get Min(): number  { return this.get_property_value(SettingDefinition.MinKey); }
    public set Min(v: number) { this.set_property_value(SettingDefinition.MinKey, v); }

    public get Max(): number  { return this.get_property_value(SettingDefinition.MaxKey); }
    public set Max(v: number) { this.set_property_value(SettingDefinition.MaxKey, v); }
}
