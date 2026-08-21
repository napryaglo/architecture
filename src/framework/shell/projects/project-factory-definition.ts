import {
    MetaData,
    MuralBase,
    type ServiceToken,
} from '../../../runtime/index.js';

// A PROJECT TYPE's schema — what a module declares in its `.projectFactories:`
// block. It says what a project type IS (its stable type id, display name, and
// the factory service that opens / creates / saves projects of that type); the
// live, per-instance project is built by the resolved factory.
//
// A MuralBase so it is DP-backed, bindable, and declarable in markup — the same
// shape as DocumentDefinition:
//
//     module ArchitectureModule [ Name = "Architecture" ] {
//         .services: { DiagramProjectFactory }
//         .projectFactories: {
//             ProjectFactoryDefinition
//                 [ Type    = "architecture",
//                   Title   = "Architecture Project",
//                   Factory = DiagramProjectFactory ]
//         }
//     }
//
// `.projectFactories:` lowers to `module.ProjectFactories.Add(def)` (the compiler
// remaps the lowercase section name to the PascalCase `ProjectFactories`
// collection, exactly as `.documents:` → `Documents`). ProjectFactoryRegistry
// aggregates these across every composed module; a project-explorer service
// resolves a definition's Factory to open / create / save real projects.
//
// This is the project-level sibling of DocumentDefinition: a DocumentDefinition
// creates one tab document from a file, a ProjectFactoryDefinition creates a
// whole project (a folder + manifest + attached files, including diagrams).
export class ProjectFactoryDefinition extends MuralBase
{
    // Stable id for the project type ("architecture"). The registry key, and the
    // value a project manifest carries in its `type` field so an Open flow can
    // route a folder back to the factory that owns it. Namespace by module.
    public static readonly TypeKey = MuralBase.RegisterProperty<string>(
        ProjectFactoryDefinition, 'Type', '', MetaData.None);

    // Display name — a "New Project" gallery / picker binds this.
    public static readonly TitleKey = MuralBase.RegisterProperty<string>(
        ProjectFactoryDefinition, 'Title', '', MetaData.None);

    // Longer help text (a new-project gallery entry, a tooltip).
    public static readonly DescriptionKey = MuralBase.RegisterProperty<string>(
        ProjectFactoryDefinition, 'Description', '', MetaData.None);

    // The DI token of the factory that opens / creates / saves projects of this
    // type (a consumer-side IProjectFactory). A real reference in markup
    // (`Factory = SomeFactory`), resolved through the container like
    // Capability.ServiceKey / DocumentDefinition.Factory.
    public static readonly FactoryKey = MuralBase.RegisterProperty<ServiceToken<unknown> | undefined>(
        ProjectFactoryDefinition, 'Factory', undefined, MetaData.None);

    public get Type(): string  { return this.get_property_value(ProjectFactoryDefinition.TypeKey); }
    public set Type(v: string) { this.set_property_value(ProjectFactoryDefinition.TypeKey, v); }

    public get Title(): string  { return this.get_property_value(ProjectFactoryDefinition.TitleKey); }
    public set Title(v: string) { this.set_property_value(ProjectFactoryDefinition.TitleKey, v); }

    public get Description(): string  { return this.get_property_value(ProjectFactoryDefinition.DescriptionKey); }
    public set Description(v: string) { this.set_property_value(ProjectFactoryDefinition.DescriptionKey, v); }

    public get Factory(): ServiceToken<unknown> | undefined  { return this.get_property_value(ProjectFactoryDefinition.FactoryKey); }
    public set Factory(v: ServiceToken<unknown> | undefined) { this.set_property_value(ProjectFactoryDefinition.FactoryKey, v); }
}
