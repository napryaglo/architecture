// diagram.module.mu â€” the Diagram module for Plexus.
//
// A ShellModule declaration: the "Diagram" capability provider. It contributes
// its capabilities to the shell's root navigation layer â€” each Capability is
// one rail entry (Name + Icon) that names, via its `ServiceKey`, the service
// whose content fills the shell's left panel while the capability is active.
//
// Compiles to `export function create()` returning the ShellModule instance;
// the app adds it via a `.modules:` block on the Application. An editor is then
// "shell + a set of modules": this Diagram module, plus a Layers module, an
// Outline module, â€¦
//
// Capability content is service-backed (the updated mechanism): the module's
// `.services:` block registers a service per capability, and a shared
// `DataTemplate [DataType = PlexusPanelService]` (in panels.resources.mu) renders whichever
// one is active. See services/panels/panel-services.ts.

import ToolBoxService from "./services/diagram-panel-services.js"
import LayersService from "./services/diagram-panel-services.js"
import OutlineService from "./services/diagram-panel-services.js"

module DiagramModule [ Name = "Diagram" ] {
    .services: {
        ToolBoxService
        LayersService
        OutlineService
    }

    // Settings this module contributes to the app's ApplicationSettings. Each is
    // a schema (key + type + default + metadata); ApplicationSettings builds a
    // live, user-modifiable value from it, overlaying any persisted value.
    .settings: {
        SettingDefinition [ Key = "diagram.grid.snap",    Label = "Snap to grid",
                            Description = "Snap shapes to the grid while dragging.",
                            Kind = Boolean, Default = true,     Category = "Diagram" ]
        SettingDefinition [ Key = "diagram.grid.size",    Label = "Grid size",
                            Description = "Grid cell size in pixels.",
                            Kind = Number,  Default = 8, Min = 1, Max = 128, Category = "Diagram" ]
        SettingDefinition [ Key = "diagram.grid.color",   Label = "Grid color",
                            Kind = Color,   Default = #E0E0E0,  Category = "Diagram" ]
    }

    // The document type this module edits. Declarative schema aggregated by the
    // framework DocumentTypeRegistry (Type + extensions → future file-open;
    // CommandContexts → the toolbar contexts a diagram activates). No Factory yet
    // — documents are seeded in memory (DiagramWorkspaceService).
    .documents: {
        DocumentDefinition
            [ Type            = "diagram",
              Title           = "Diagram",
              Description     = "A node-and-connector diagram.",
              FileExtensions  = [".diagram"],
              CommandContexts = [DiagramEditingContext] ]
    }

    // Toolbar commands — pure chrome (Id + Title + Icon + Context + placement).
    // Behaviour lives on the active document: the ToolbarService shows these
    // while a DiagramEditingContext document is active and dispatches each to
    // DiagramDocument.Execute(definition), which forwards to the canvas control.
    // The Id strings match DiagramCommandId (framework) — the same markup-string
    // ↔ code-constant contract as setting keys. Order is global (keeps groups
    // contiguous); Group tags future separators.
    .commands: {
        CommandDefinition [ Id = "diagram.align.left",   Title = "Align Left",   Icon = @alignLeft,   Context = DiagramEditingContext, Group = "align",      Order = 10 ]
        CommandDefinition [ Id = "diagram.align.right",  Title = "Align Right",  Icon = @alignRight,  Context = DiagramEditingContext, Group = "align",      Order = 20 ]
        CommandDefinition [ Id = "diagram.align.top",    Title = "Align Top",    Icon = @alignTop,    Context = DiagramEditingContext, Group = "align",      Order = 30 ]
        CommandDefinition [ Id = "diagram.align.middle", Title = "Align Middle", Icon = @alignMiddle, Context = DiagramEditingContext, Group = "align",      Order = 40 ]
        CommandDefinition [ Id = "diagram.align.center", Title = "Align Center", Icon = @alignCenter, Context = DiagramEditingContext, Group = "align",      Order = 50 ]
        CommandDefinition [ Id = "diagram.distribute.horizontal", Title = "Distribute Horizontally", Icon = @distributeHorizontal, Context = DiagramEditingContext, Group = "distribute", Order = 60 ]
        CommandDefinition [ Id = "diagram.distribute.vertical",   Title = "Distribute Vertically",   Icon = @distributeVertical,   Context = DiagramEditingContext, Group = "distribute", Order = 70 ]
        CommandDefinition [ Id = "diagram.group",   Title = "Group",   Icon = @group,   Context = DiagramEditingContext, Group = "arrange", Order = 80 ]
        CommandDefinition [ Id = "diagram.ungroup", Title = "Ungroup", Icon = @ungroup, Context = DiagramEditingContext, Group = "arrange", Order = 90 ]
        CommandDefinition [ Id = "diagram.combine.union",     Title = "Combine — Union",     Icon = @join,       Context = DiagramEditingContext, Group = "combine", Order = 100 ]
        CommandDefinition [ Id = "diagram.combine.intersect", Title = "Combine — Intersect", Icon = @join_inner, Context = DiagramEditingContext, Group = "combine", Order = 110 ]
        CommandDefinition [ Id = "diagram.combine.subtract",  Title = "Combine — Subtract",  Icon = @join_left,  Context = DiagramEditingContext, Group = "combine", Order = 120 ]
        CommandDefinition [ Id = "diagram.combine.exclude",   Title = "Combine — Exclude",   Icon = @difference, Context = DiagramEditingContext, Group = "combine", Order = 130 ]
        // Paragraph alignment WITHIN the label block.
        CommandDefinition [ Id = "diagram.text.align.left",    Title = "Align Text Left",    Icon = @format_align_left,    Context = DiagramEditingContext, Group = "text-align", Order = 140 ]
        CommandDefinition [ Id = "diagram.text.align.center",  Title = "Align Text Center",  Icon = @format_align_center,  Context = DiagramEditingContext, Group = "text-align", Order = 150 ]
        CommandDefinition [ Id = "diagram.text.align.right",   Title = "Align Text Right",   Icon = @format_align_right,   Context = DiagramEditingContext, Group = "text-align", Order = 160 ]
        CommandDefinition [ Id = "diagram.text.align.justify", Title = "Justify Text",       Icon = @format_align_justify, Context = DiagramEditingContext, Group = "text-align", Order = 170 ]
        // Label placement WITHIN the shape footprint — 3×3 anchor grid.
        CommandDefinition [ Id = "diagram.text.place.top-left",     Title = "Place Label Top-Left",     Icon = @north_west,           Context = DiagramEditingContext, Group = "text-place", Order = 180 ]
        CommandDefinition [ Id = "diagram.text.place.top",          Title = "Place Label Top",          Icon = @north,                Context = DiagramEditingContext, Group = "text-place", Order = 190 ]
        CommandDefinition [ Id = "diagram.text.place.top-right",    Title = "Place Label Top-Right",    Icon = @north_east,           Context = DiagramEditingContext, Group = "text-place", Order = 200 ]
        CommandDefinition [ Id = "diagram.text.place.left",         Title = "Place Label Left",         Icon = @west,                 Context = DiagramEditingContext, Group = "text-place", Order = 210 ]
        CommandDefinition [ Id = "diagram.text.place.center",       Title = "Place Label Center",       Icon = @filter_center_focus,  Context = DiagramEditingContext, Group = "text-place", Order = 220 ]
        CommandDefinition [ Id = "diagram.text.place.right",        Title = "Place Label Right",        Icon = @east,                 Context = DiagramEditingContext, Group = "text-place", Order = 230 ]
        CommandDefinition [ Id = "diagram.text.place.bottom-left",  Title = "Place Label Bottom-Left",  Icon = @south_west,           Context = DiagramEditingContext, Group = "text-place", Order = 240 ]
        CommandDefinition [ Id = "diagram.text.place.bottom",       Title = "Place Label Bottom",       Icon = @south,                Context = DiagramEditingContext, Group = "text-place", Order = 250 ]
        CommandDefinition [ Id = "diagram.text.place.bottom-right", Title = "Place Label Bottom-Right", Icon = @south_east,           Context = DiagramEditingContext, Group = "text-place", Order = 260 ]
        // Character decorations — bold / italic / underline / strikethrough.
        CommandDefinition [ Id = "diagram.text.bold",          Title = "Bold",          Icon = @format_bold,          Context = DiagramEditingContext, Group = "text-style", Order = 270 ]
        CommandDefinition [ Id = "diagram.text.italic",        Title = "Italic",        Icon = @format_italic,        Context = DiagramEditingContext, Group = "text-style", Order = 280 ]
        CommandDefinition [ Id = "diagram.text.underline",     Title = "Underline",     Icon = @format_underlined,    Context = DiagramEditingContext, Group = "text-style", Order = 290 ]
        CommandDefinition [ Id = "diagram.text.strikethrough", Title = "Strikethrough", Icon = @format_strikethrough, Context = DiagramEditingContext, Group = "text-style", Order = 300 ]
        // Grow / shrink font one point.
        CommandDefinition [ Id = "diagram.text.size.increase", Title = "Increase Font Size", Icon = @text_increase, Context = DiagramEditingContext, Group = "text-size", Order = 310 ]
        CommandDefinition [ Id = "diagram.text.size.decrease", Title = "Decrease Font Size", Icon = @text_decrease, Context = DiagramEditingContext, Group = "text-size", Order = 320 ]
    }

    // Shapes â€” the toolbox of shapes to drop onto the canvas.
    Capability [ Name = "Tool Box", Icon = @ToolBox, ServiceKey = ToolBoxService ]

    // Layers â€” the document's layer stack.
    Capability [ Name = "Layers", Icon = @Layers, ServiceKey = LayersService ]

    // Outline â€” a tree of the diagram's nodes.
    Capability [ Name = "Outline", Icon = @Outline, ServiceKey = OutlineService ]
}
