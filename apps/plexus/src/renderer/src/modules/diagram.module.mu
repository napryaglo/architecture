// diagram.module.mu — the Diagram module for Plexus.
//
// A ShellModule declaration: the "Diagram" capability provider. It contributes
// its capabilities to the shell's root navigation layer — each Capability is
// one rail entry (Name, and later an Icon) whose Panel is the left-panel view
// shown when the capability is active.
//
// Compiles to `export function create()` returning the ShellModule instance;
// the app adds it via a `.modules:` block on the Application. An editor is then
// "shell + a set of modules": this Diagram module, plus a Layers module, an
// Outline module, …
//
// Deferred (not blocking this module compiling):
//   • Icons — Capability.Icon is a Geometry needing an icon resource dictionary
//     (baked glyphs) Plexus doesn't have yet; added as a follow-up.
//   • Lazy panels — panels are EAGER Visuals for now (the Capability's content
//     child). The confirmed lazy-template path needs the compiler to accept an
//     inline template as a child value; deferred until panels grow heavy.

module DiagramModule [ Name = "Diagram" ] {
    // Shapes — the toolbox of shapes to drop onto the canvas.
    Capability [ Name = "Tool Box", Icon = @ToolBox ] { }

    // Layers — the document's layer stack.
    Capability [ Name = "Layers", Icon = @Layers ] { }

    // Outline — a tree of the diagram's nodes.
    Capability [ Name = "Outline", Icon = @Outline ] { }
}
