// Default theme entries for the command-surface controls — ToggleButton
// / ToolBar / Menu / MenuButton / ContextMenu. Kept separate from
// `basic.resources.mu` because the surface bundle's `extends Button`
// declarations would TDZ on the not-yet-initialised Button binding if
// they were pulled in through Button's own static block path.
//
// Themes pull this bundle in by listing `MuralFramework` in their
// `dictionaries:` header (see Material's `material.mu`).
//
// MenuButton and ContextMenu each ship TWO keyed templates (trigger +
// popup for MenuButton; just popup for ContextMenu) because they need
// to materialise two visual subtrees with different lifetimes — the
// trigger sits inline in the tree, while the popup is mounted onto the
// PresentationTarget's OverlayLayer when IsOpen flips true. WPF's
// MenuButton / ContextMenu carry an analogous split in their default
// styles; ComboBox + Drawer use the same dual-template shape (see
// `basic.resources.mu`).

resources MuralFramework {

    // ── Per-family dictionaries ────────────────────────────────────
    // Each family's Styles + ControlTemplates live next to its
    // controls under src/framework/<family>/<family>.template.mu.
    // The compiler folds every imported dictionary's entries into
    // this one at Clone() time, so MuralFramework is the single
    // composed handle that material.mu lists in its `dictionaries:`
    // header. New families: drop a .template.mu next to the .ts
    // files and add one import here.
    import Buttons       from "../framework/buttons/buttons.template.mu.js"
    import ButtonGroups  from "../framework/button-groups/button-groups.template.mu.js"
    import Formatting    from "../framework/formatting/formatting.template.mu.js"
    import Lists         from "../framework/list/list.template.mu.js"
    import Markers       from "../framework/markers/markers.template.mu.js"
    import Menus         from "../framework/menu/menu.template.mu.js"
    import Navigation    from "../framework/navigation/navigation.template.mu.js"
    import Notifications from "../framework/notifications/notifications.template.mu.js"
    import SearchBars    from "../framework/search-bar/search-bar.template.mu.js"
    import StatusBars    from "../framework/status-bar/status-bar.template.mu.js"
    import Surfaces      from "../framework/surfaces/surfaces.template.mu.js"
    import Tabs          from "../framework/tabs/tabs.template.mu.js"
    import ThemeSelectors from "../framework/theme-selector/theme-selector.template.mu.js"
    import Toggles       from "../framework/toggles/toggles.template.mu.js"
    import ToolBars      from "../framework/tool-bar/tool-bar.template.mu.js"
    import Tooltips      from "../framework/tooltips/tooltips.template.mu.js"
    import TopAppBars    from "../framework/top-app-bar/top-app-bar.template.mu.js"

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
    Template x:key="DefaultContentControlTemplate" [TargetType=ContentControl] {
        ContentPresenter
    }
    Style [TargetType=ContentControl] {
        Template = @DefaultContentControlTemplate;
    }

    // ── Menu family (MenuStrip / MenuButton / MenuItem /
    //    MenuSeparator / MenuStripItem / ContextMenu) ──────────────
    // Promoted to src/framework/menu/menu.template.mu.

    // ── ToolBarButton ───────────────────────────────────────────────
    // Promoted to src/framework/tool-bar/tool-bar.template.mu.

    // ── IconButton / IconButtonToggle / FloatingActionButton ─────────
    // Promoted to src/framework/buttons/buttons.template.mu.

    // ── Card ───────────────────────────────────────────────────────
    // Promoted to src/framework/surfaces/surfaces.template.mu.

    // ── TopAppBar ───────────────────────────────────────────────────
    // Promoted to src/framework/top-app-bar/top-app-bar.template.mu.

    // ── NavigationItem / NavigationRail / NavigationBar ─────────────
    // Promoted to src/framework/navigation/navigation.template.mu.

    // ── Switch / Checkbox / RadioButton ─────────────────────────────
    // Promoted to src/framework/toggles/toggles.template.mu.

    // ── Chip ────────────────────────────────────────────────────────
    // Promoted to src/framework/markers/markers.template.mu.

    // ── SegmentedButton / SegmentedItem / SplitButton ───────────────
    // Promoted to src/framework/button-groups/button-groups.template.mu.

    // ── TabControl / TabItem ────────────────────────────────────────
    // Promoted to src/framework/tabs/tabs.template.mu.

    // ── SearchBar ───────────────────────────────────────────────────
    // Promoted to src/framework/search-bar/search-bar.template.mu.
    // ── Divider / Badge ─────────────────────────────────────────────
    // Promoted to src/framework/markers/markers.template.mu.

    // ── ProgressIndicator / Banner / Snackbar ───────────────────────
    // Promoted to src/framework/notifications/notifications.template.mu.

    // ── Dialog / BottomSheet ───────────────────────────────────────
    // Promoted to src/framework/surfaces/surfaces.template.mu.

    // ── ToolBar family (ToolBar / ToolBarButton / ToolBarToggleButton /
    //    ToolBarSeparator) ──────────────────────────────────────
    // Promoted to src/framework/tool-bar/tool-bar.template.mu.
    // ── StatusBar / StatusBarItem / StatusBarSeparator ──────────────
    // Promoted to src/framework/status-bar/status-bar.template.mu.

    // ── ThemeSelector ───────────────────────────────────────────────
    // Promoted to src/framework/theme-selector/theme-selector.template.mu.

    // ── ColorPicker / BrushPicker / PenEditor / FillEditor /
    //    ShapeFormatControl ────────────────────────────────────────
    // Promoted to src/framework/formatting/formatting.template.mu.

    // ── Tooltip + CommandBase DataTemplate ──────────────────────────
    // Promoted to src/framework/tooltips/tooltips.template.mu.
}
