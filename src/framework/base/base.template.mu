// Default theme entries for the base family — the templated-control
// chassis (Control, ContentControl, ItemsControl). Control and
// ItemsControl are abstract bases with no chrome of their own; only
// ContentControl gets a default Template here.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Bases {
    // ── ContentControl: bare-bones content host ────────────────────
    // ContentControl is the base for Button, ToggleButton, IconButton,
    // FAB, Card, … — each of those installs its own default Style via
    // Application._defaultStyle. But a *bare* ContentControl used as a
    // standalone primitive (e.g. when a consumer wants DataTemplate
    // dispatch by Content's type without any decorative chrome — the
    // "render this VM through its DataTemplate, please" idiom) needs
    // a Template too. Without one, the control has no visual children
    // and renders nothing, even when Content is set.
    //
    // The minimal default: a single ContentPresenter that hosts the
    // resolved Content visual. Matches WPF's bare ContentControl. Any
    // derived class with its own Style overrides this without conflict.
    Template x:key="DefaultContentControlTemplate" [TargetType = ContentControl] {
        ContentPresenter
    }
    Style [TargetType = ContentControl] {
        Template = @DefaultContentControlTemplate;
    }
}
