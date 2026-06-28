// Symbol-table: maps unqualified PascalCase identifiers used in `.mu`
// source to the module they come from. Used by the emitter to build the
// `import { … } from "…"` header at the top of compiled JS, and to
// recognise legal references during bind.
//
// Pluggable: callers can wrap or replace `DEFAULT_SYMBOLS` to handle
// custom control libraries.

export type SymbolMap = Map<string, string>;

const ENTRIES: ReadonlyArray<readonly [string, string]> = [
    // ── runtime ─────────────────────────────────────────────────────
    ['Application',         '@visualisation-sub/mural/runtime'],
    ['ServiceProvider',     '@visualisation-sub/mural/runtime'],
    ['Visual',              '@visualisation-sub/mural/runtime'],
    ['Single',              '@visualisation-sub/mural/runtime'],
    ['Panel',               '@visualisation-sub/mural/runtime'],
    ['ResourceDictionary',  '@visualisation-sub/mural/runtime'],
    ['Style',               '@visualisation-sub/mural/runtime'],
    ['Setter',              '@visualisation-sub/mural/runtime'],
    ['SetterFactory',       '@visualisation-sub/mural/runtime'],
    ['PropertyTrigger',     '@visualisation-sub/mural/runtime'],
    ['EventTrigger',           '@visualisation-sub/mural/runtime'],
    ['BeginStoryboardAction',  '@visualisation-sub/mural/runtime'],
    ['InvokeCommandAction',    '@visualisation-sub/mural/runtime'],
    ['StopStoryboardAction',   '@visualisation-sub/mural/runtime'],
    ['PauseStoryboardAction',  '@visualisation-sub/mural/runtime'],
    ['ResumeStoryboardAction', '@visualisation-sub/mural/runtime'],
    ['AttachBehaviorAction',   '@visualisation-sub/mural/runtime'],
    ['DetachBehaviorAction',   '@visualisation-sub/mural/runtime'],
    ['Storyboard',             '@visualisation-sub/mural/runtime'],
    ['DoubleAnimation',        '@visualisation-sub/mural/runtime'],
    ['ColorAnimation',         '@visualisation-sub/mural/runtime'],
    ['ThicknessAnimation',     '@visualisation-sub/mural/runtime'],
    ['Binding',             '@visualisation-sub/mural/runtime'],
    ['BindingMode',         '@visualisation-sub/mural/runtime'],
    ['DynamicResource',     '@visualisation-sub/mural/runtime'],
    ['DataContextBinding',  '@visualisation-sub/mural/runtime'],
    ['ElementNameBinding',  '@visualisation-sub/mural/runtime'],
    ['ServiceBinding',      '@visualisation-sub/mural/runtime'],
    ['SelfBinding',         '@visualisation-sub/mural/runtime'],
    ['composeConverters',   '@visualisation-sub/mural/runtime'],
    // Built-in color modifiers — converter factories usable on the `<<`
    // pipe (`#0d47a1 << Lighten(0.5)`). User-defined modifiers follow the
    // same shape and are pulled in with a `.mu` import clause instead.
    ['Lighten',             '@visualisation-sub/mural/runtime'],
    ['Darken',              '@visualisation-sub/mural/runtime'],
    ['Mix',                 '@visualisation-sub/mural/runtime'],
    ['Saturate',            '@visualisation-sub/mural/runtime'],
    ['Desaturate',          '@visualisation-sub/mural/runtime'],
    ['Alpha',               '@visualisation-sub/mural/runtime'],
    ['MultiBinding',        '@visualisation-sub/mural/runtime'],
    ['TemplateBinding',     '@visualisation-sub/mural/runtime'],
    ['MultiTrigger',        '@visualisation-sub/mural/runtime'],
    ['DataTrigger',         '@visualisation-sub/mural/runtime'],
    ['MultiDataTrigger',    '@visualisation-sub/mural/runtime'],
    ['HorizontalAlignment', '@visualisation-sub/mural/runtime'],
    ['VerticalAlignment',   '@visualisation-sub/mural/runtime'],
    ['Visibility',          '@visualisation-sub/mural/runtime'],
    ['Point',               '@visualisation-sub/mural/runtime'],
    ['Size',                '@visualisation-sub/mural/runtime'],
    ['Rect',                '@visualisation-sub/mural/runtime'],
    ['Color',               '@visualisation-sub/mural/runtime'],
    ['Matrix',              '@visualisation-sub/mural/runtime'],
    ['Thickness',           '@visualisation-sub/mural/runtime'],
    ['CornerRadius',        '@visualisation-sub/mural/runtime'],
    // Theme engine — emitted by `theme` / `scheme` top-level forms.
    ['defineScheme',        '@visualisation-sub/mural/runtime'],
    ['defineTheme',         '@visualisation-sub/mural/runtime'],
    ['Scheme',              '@visualisation-sub/mural/runtime'],
    ['Theme',               '@visualisation-sub/mural/runtime'],
    ['ThemeManager',        '@visualisation-sub/mural/runtime'],
    ['Application',         '@visualisation-sub/mural/runtime'],
    // Adaptive context — inherited DPs on Visual written by ThemeManager
    // / MediaWatcher; templates trigger on these via the standard `when`
    // syntax (`when (Density = Compact) { … }`).
    ['Density',             '@visualisation-sub/mural/runtime'],
    ['ViewportClass',       '@visualisation-sub/mural/runtime'],
    ['Pointer',             '@visualisation-sub/mural/runtime'],
    ['PrefersContrast',     '@visualisation-sub/mural/runtime'],
    ['PreferredScheme',     '@visualisation-sub/mural/runtime'],
    ['DataObject',          '@visualisation-sub/mural/runtime'],
    ['DragDropEffects',     '@visualisation-sub/mural/runtime'],
    ['DragDrop',            '@visualisation-sub/mural/runtime'],

    // ── basic controls ──────────────────────────────────────────────
    ['Border',                  '@visualisation-sub/mural/basic'],
    ['Button',                  '@visualisation-sub/mural/framework/buttons/button.js'],
    ['IconButton',              '@visualisation-sub/mural/framework/buttons/icon-button.js'],
    ['IconButtonToggle',        '@visualisation-sub/mural/framework/buttons/icon-button-toggle.js'],
    ['FloatingActionButton',    '@visualisation-sub/mural/framework/buttons/fab.js'],
    ['FabSize',                 '@visualisation-sub/mural/framework/buttons/fab.js'],
    ['Card',                    '@visualisation-sub/mural/framework/surfaces/card.js'],
    ['CardVariant',             '@visualisation-sub/mural/framework/surfaces/card.js'],
    ['TopAppBar',               '@visualisation-sub/mural/framework/top-app-bar/top-app-bar.js'],
    ['TopAppBarVariant',        '@visualisation-sub/mural/framework/top-app-bar/top-app-bar.js'],
    ['NavigationItem',          '@visualisation-sub/mural/framework/navigation/navigation-item.js'],
    ['NavigationRail',          '@visualisation-sub/mural/framework/navigation/navigation-rail.js'],
    ['NavigationBar',           '@visualisation-sub/mural/framework/navigation/navigation-bar.js'],
    ['Shell',                   '@visualisation-sub/mural/framework/shell/shell.js'],
    ['ShellBase',               '@visualisation-sub/mural/framework/shell/shell.js'],
    ['ShellRegion',             '@visualisation-sub/mural/framework/shell/shell.js'],
    ['EditorShell',             '@visualisation-sub/mural/framework/shell/editor-shell.js'],
    ['ViewerShell',             '@visualisation-sub/mural/framework/shell/viewer-shell.js'],
    ['NavigationService',       '@visualisation-sub/mural/framework/shell/services/navigation-service.js'],
    ['InspectorService',        '@visualisation-sub/mural/framework/shell/services/inspector-service.js'],
    ['StatusService',           '@visualisation-sub/mural/framework/shell/services/status-service.js'],
    ['ClickMode',               '@visualisation-sub/mural/framework/buttons/button.js'],
    ['ButtonVariant',           '@visualisation-sub/mural/framework/buttons/button.js'],
    ['TextBlock',               '@visualisation-sub/mural/basic'],
    ['Canvas',                  '@visualisation-sub/mural/basic'],
    ['PaginatedCanvas',         '@visualisation-sub/mural/basic'],
    ['Ellipse',                 '@visualisation-sub/mural/basic'],
    ['Shape',                   '@visualisation-sub/mural/basic'],
    ['Path',                    '@visualisation-sub/mural/basic'],
    ['Image',                   '@visualisation-sub/mural/basic'],
    ['Icon',                    '@visualisation-sub/mural/basic'],
    ['Line',                    '@visualisation-sub/mural/basic'],
    ['Rectangle',               '@visualisation-sub/mural/basic'],
    ['ComboBox',                '@visualisation-sub/mural/framework/list/combo-box.js'],
    ['DockPanel',               '@visualisation-sub/mural/basic'],
    ['Dock',                    '@visualisation-sub/mural/basic'],
    ['Drawer',                  '@visualisation-sub/mural/framework/surfaces/drawer.js'],
    ['DrawerVariant',           '@visualisation-sub/mural/framework/surfaces/drawer.js'],
    ['TreeView',                '@visualisation-sub/mural/framework/list/tree-view.js'],
    ['TreeViewItem',            '@visualisation-sub/mural/framework/list/tree-view.js'],
    ['ListBox',                 '@visualisation-sub/mural/framework/list/list-box.js'],
    ['ListBoxItem',             '@visualisation-sub/mural/framework/list/list-box.js'],
    ['SelectionMode',           '@visualisation-sub/mural/framework/list/list-box.js'],
    ['MarqueeBoundsPolicy',     '@visualisation-sub/mural/framework/list/selector.js'],
    ['TextBox',                 '@visualisation-sub/mural/basic'],
    ['SpinEdit',                '@visualisation-sub/mural/basic'],
    ['Slider',                  '@visualisation-sub/mural/basic'],
    ['ColorPicker',             '@visualisation-sub/mural/framework'],
    ['ColorPickerVariant',      '@visualisation-sub/mural/framework'],
    ['ColorScheme',             '@visualisation-sub/mural/framework'],
    ['BrushPicker',             '@visualisation-sub/mural/framework'],
    ['BrushPickerVariant',      '@visualisation-sub/mural/framework'],
    ['PenEditor',               '@visualisation-sub/mural/framework'],
    ['FillEditor',              '@visualisation-sub/mural/framework'],
    ['FillEditorVariant',       '@visualisation-sub/mural/framework'],
    ['ShapeFormatControl',      '@visualisation-sub/mural/framework'],
    ['CapOption',               '@visualisation-sub/mural/framework'],
    ['PageView',                '@visualisation-sub/mural/basic'],

    // Runtime types that the emitter may reference even when the
    // consumer's source doesn't name them directly — added on demand
    // by the emit pass.
    ['NameScope',               '@visualisation-sub/mural/runtime'],
    ['PropertyTransition',      '@visualisation-sub/mural/runtime'],
    ['StackPanel',              '@visualisation-sub/mural/basic'],
    ['WrapPanel',               '@visualisation-sub/mural/basic'],
    ['UniformGrid',             '@visualisation-sub/mural/basic'],
    ['Orientation',             '@visualisation-sub/mural/basic'],
    ['ContentControl',          '@visualisation-sub/mural/framework/base/content-control.js'],
    ['ContentPresenter',        '@visualisation-sub/mural/basic'],
    ['Figure',                  '@visualisation-sub/mural/framework/diagram/figure.js'],
    ['Group',                   '@visualisation-sub/mural/framework/diagram/group.js'],
    ['Diagram',                 '@visualisation-sub/mural/framework/diagram/diagram.js'],
    // Connector — markup references it for the `Connector.CapInset`
    // attached property on cap templates. ConnectorCapDataContext is the
    // DataType those cap DataTemplates bind against ($Brush / $Pen).
    ['Connector',               '@visualisation-sub/mural/framework/diagram/connector.js'],
    ['ConnectorCapDataContext', '@visualisation-sub/mural/framework/diagram/caps/connector-cap-data-context.js'],
    ['ToolboxShape',            '@visualisation-sub/mural/framework/diagram/toolbox-shape.js'],
    ['DiagramDocument',         '@visualisation-sub/mural/framework/diagram/diagram-document.js'],
    ['DiagramStorageKey',       '@visualisation-sub/mural/framework/diagram/diagram-document.js'],
    ['Grid',                    '@visualisation-sub/mural/basic'],
    ['GridLength',              '@visualisation-sub/mural/basic'],
    ['ColumnDefinition',        '@visualisation-sub/mural/basic'],
    ['RowDefinition',           '@visualisation-sub/mural/basic'],
    ['ControlTemplate',         '@visualisation-sub/mural/basic'],
    ['DataTemplate',            '@visualisation-sub/mural/basic'],
    ['TargetedSetter',          '@visualisation-sub/mural/basic'],
    ['TemplatePropertyTrigger',  '@visualisation-sub/mural/basic'],
    ['TemplateDataTrigger',      '@visualisation-sub/mural/basic'],
    ['TemplateMultiDataTrigger', '@visualisation-sub/mural/basic'],
    ['ItemsControl',            '@visualisation-sub/mural/framework/base/items-control.js'],
    ['ListReorderBehavior',     '@visualisation-sub/mural/basic'],
    ['LogBehavior',             '@visualisation-sub/mural/basic'],
    ['Selector',                '@visualisation-sub/mural/framework/list/selector.js'],
    ['ItemContainerGenerator',  '@visualisation-sub/mural/basic'],
    ['ItemsPresenter',          '@visualisation-sub/mural/basic'],
    ['AdornerDecorator',        '@visualisation-sub/mural/basic'],
    ['HierarchicalDataTemplate','@visualisation-sub/mural/basic'],
    ['ItemsPanelTemplate',      '@visualisation-sub/mural/basic'],
    ['CollectionView',          '@visualisation-sub/mural/basic'],
    ['SortDescription',         '@visualisation-sub/mural/basic'],
    ['GroupDescription',        '@visualisation-sub/mural/basic'],
    ['ScrollViewer',            '@visualisation-sub/mural/framework/surfaces/scroll-viewer.js'],
    ['ScrollBar',               '@visualisation-sub/mural/basic'],
    ['Thumb',                   '@visualisation-sub/mural/basic'],
    ['GridSplitter',            '@visualisation-sub/mural/basic'],
    ['Splitter',                '@visualisation-sub/mural/basic'],
    ['VirtualizingPanel',       '@visualisation-sub/mural/basic'],
    ['VirtualizingStackPanel',  '@visualisation-sub/mural/basic'],
    ['VirtualizingWrapPanel',   '@visualisation-sub/mural/basic'],
    ['TextWrapping',            '@visualisation-sub/mural/basic'],
    ['TextAlignment',           '@visualisation-sub/mural/basic'],
    ['TextBoxVariant',          '@visualisation-sub/mural/basic'],
    ['Arc',                     '@visualisation-sub/mural/basic'],
    ['Squircle',                '@visualisation-sub/mural/basic'],
    ['Pill',                    '@visualisation-sub/mural/basic'],
    ['Arch',                    '@visualisation-sub/mural/basic'],
    ['Semicircle',              '@visualisation-sub/mural/basic'],
    ['Triangle',                '@visualisation-sub/mural/basic'],
    ['Arrow',                   '@visualisation-sub/mural/basic'],
    ['Fan',                     '@visualisation-sub/mural/basic'],
    ['FanPivot',                '@visualisation-sub/mural/basic'],
    ['Clamshell',               '@visualisation-sub/mural/basic'],
    ['Cookie',                  '@visualisation-sub/mural/basic'],
    ['Diamond',                 '@visualisation-sub/mural/basic'],
    ['Pentagon',                '@visualisation-sub/mural/basic'],
    ['Gem',                     '@visualisation-sub/mural/basic'],
    ['FourSidedCookie',         '@visualisation-sub/mural/basic'],
    ['SixSidedCookie',          '@visualisation-sub/mural/basic'],
    ['SevenSidedCookie',        '@visualisation-sub/mural/basic'],
    ['NineSidedCookie',         '@visualisation-sub/mural/basic'],
    ['TwelveSidedCookie',       '@visualisation-sub/mural/basic'],
    ['Clover',                  '@visualisation-sub/mural/basic'],
    ['FourLeafClover',          '@visualisation-sub/mural/basic'],
    ['EightLeafClover',         '@visualisation-sub/mural/basic'],
    ['Slanted',                 '@visualisation-sub/mural/basic'],
    ['Puffy',                   '@visualisation-sub/mural/basic'],
    ['PuffyDiamond',            '@visualisation-sub/mural/basic'],
    ['PuffyBase',               '@visualisation-sub/mural/basic'],
    ['Heart',                   '@visualisation-sub/mural/basic'],
    ['Bun',                     '@visualisation-sub/mural/basic'],
    ['Ghostish',                '@visualisation-sub/mural/basic'],
    ['PixelArt',                '@visualisation-sub/mural/basic'],
    ['PixelCircle',             '@visualisation-sub/mural/basic'],
    ['PixelTriangle',           '@visualisation-sub/mural/basic'],
    ['PixelSource',             '@visualisation-sub/mural/basic'],
    ['RadialWave',              '@visualisation-sub/mural/basic'],
    ['Sunny',                   '@visualisation-sub/mural/basic'],
    ['VerySunny',               '@visualisation-sub/mural/basic'],
    ['Burst',                   '@visualisation-sub/mural/basic'],
    ['SoftBurst',               '@visualisation-sub/mural/basic'],
    ['Boom',                    '@visualisation-sub/mural/basic'],
    ['SoftBoom',                '@visualisation-sub/mural/basic'],
    ['Flower',                  '@visualisation-sub/mural/basic'],

    // ── Internal helper classes ────────────────────────────────────
    // Layout / behaviour primitives owned by individual controls but
    // exported from their files (and re-exported from the basic
    // barrel) so the controls' bundled `.template.mu` defaults can
    // reference them by name. Registered here as well so the LSP /
    // analyzer accepts them when an in-tree template is opened — the
    // build-control-templates script overrides these entries with
    // direct relative file paths at compile time.
    ['ClickableBorder',         '@visualisation-sub/mural/basic/clickable-border.js'],
    ['ClickAwayScrim',          '@visualisation-sub/mural/basic/click-away-scrim.js'],
    ['SplitRow',                '@visualisation-sub/mural/framework/list/combo-box.js'],
    ['ComboBoxPopupHost',       '@visualisation-sub/mural/framework/list/combo-box.js'],
    ['ComboBoxItem',            '@visualisation-sub/mural/framework/list/combo-box.js'],
    ['ComboBoxItemList',        '@visualisation-sub/mural/framework/list/combo-box.js'],
    ['ScrimSurface',            '@visualisation-sub/mural/framework/surfaces/drawer.js'],
    ['TemporaryOverlayHost',    '@visualisation-sub/mural/framework/surfaces/drawer.js'],
    ['ClickableRow',            '@visualisation-sub/mural/framework/list/tree-view.js'],
    ['ChevronTarget',           '@visualisation-sub/mural/framework/list/tree-view.js'],
    ['CollapsibleStack',        '@visualisation-sub/mural/framework/list/tree-view.js'],
    ['ScrollBarLayout',         '@visualisation-sub/mural/basic'],
    ['ScrollViewerLayout',      '@visualisation-sub/mural/framework/surfaces/scroll-viewer.js'],
    ['ScrollContentPresenter',  '@visualisation-sub/mural/basic'],
    ['SliderLayout',            '@visualisation-sub/mural/basic'],
    ['TextEditorSurface',       '@visualisation-sub/mural/basic'],

    // ── Command-surface controls (5.11) ─────────────────────────────
    // These extend Button / Visual and live in a separate barrel
    // (`./surface.js`) to avoid a TDZ cycle through the main basic
    // barrel during Button's default-style theme cascade.
    ['ToggleButton',            '@visualisation-sub/mural/framework/buttons/toggle-button.js'],
    // M3 Switch — capitalised `Switch` is fine in JS (only the
    // lowercase `switch` keyword is reserved), so the class and the
    // markup symbol both spell it `Switch`.
    ['Switch',                  '@visualisation-sub/mural/framework/toggles/switch.js'],
    ['Checkbox',                '@visualisation-sub/mural/framework/toggles/checkbox.js'],
    ['RadioButton',             '@visualisation-sub/mural/framework/toggles/radio-button.js'],
    ['Chip',                    '@visualisation-sub/mural/framework/markers/chip.js'],
    ['ChipVariant',             '@visualisation-sub/mural/framework/markers/chip.js'],
    ['SegmentedButton',         '@visualisation-sub/mural/framework/button-groups/segmented-button.js'],
    ['SegmentedItem',           '@visualisation-sub/mural/framework/button-groups/segmented-button.js'],
    ['SegmentedPosition',       '@visualisation-sub/mural/framework/button-groups/segmented-button.js'],
    ['ButtonGroup',             '@visualisation-sub/mural/framework/button-groups/button-group.js'],
    ['SplitButton',             '@visualisation-sub/mural/framework/button-groups/split-button.js'],
    ['FabMenu',                 '@visualisation-sub/mural/framework/buttons/fab-menu.js'],
    ['TabControl',              '@visualisation-sub/mural/framework/tabs/tabs.js'],
    ['TabItem',                 '@visualisation-sub/mural/framework/tabs/tabs.js'],
    ['SearchBar',               '@visualisation-sub/mural/framework/search-bar/search-bar.js'],
    ['Divider',                 '@visualisation-sub/mural/framework/markers/divider.js'],
    ['Badge',                   '@visualisation-sub/mural/framework/markers/badge.js'],
    ['BadgeVariant',            '@visualisation-sub/mural/framework/markers/badge.js'],
    ['Tooltip',                 '@visualisation-sub/mural/framework/tooltips/tooltip.js'],
    ['TooltipPopupHost',        '@visualisation-sub/mural/framework/tooltips/tooltip-service.js'],
    ['ToolTipService',          '@visualisation-sub/mural/framework/tooltips/tooltip-service.js'],
    ['PlacementMode',           '@visualisation-sub/mural/framework/tooltips/tooltip-service.js'],
    // Commands — referenced in markup as DataTemplate DataType targets
    // (the default rich-tooltip template dispatches on CommandBase).
    ['CommandBase',             '@visualisation-sub/mural/runtime'],
    ['RelayCommand',            '@visualisation-sub/mural/runtime'],
    ['RoutedCommand',           '@visualisation-sub/mural/framework/commands/routed-command.js'],
    // Input bindings — `Visual.InputBindings { KeyBinding[…] }` /
    // `CommandBindings { CommandBinding[…] }` markup authoring.
    ['KeyBinding',              '@visualisation-sub/mural/framework/commands/input-binding.js'],
    ['MouseBinding',           '@visualisation-sub/mural/framework/commands/input-binding.js'],
    ['MouseAction',            '@visualisation-sub/mural/framework/commands/input-binding.js'],
    ['CommandBinding',         '@visualisation-sub/mural/framework/commands/command-binding.js'],
    // WPF-parity input enums (Key / ModifierKeys / MouseButton) re-exported
    // from the runtime barrel; usable in KeyBinding[Key=…, Modifiers=…]
    // and in `when (…)` triggers.
    ['Key',                    '@visualisation-sub/mural/runtime'],
    ['ModifierKeys',           '@visualisation-sub/mural/runtime'],
    ['MouseButton',            '@visualisation-sub/mural/runtime'],
    // Focus scopes + keyboard navigation — attached properties usable in
    // markup (FocusManager.IsFocusScope=true, KeyboardNavigation.TabNavigation=Cycle).
    ['FocusManager',           '@visualisation-sub/mural/runtime'],
    ['KeyboardNavigation',     '@visualisation-sub/mural/runtime'],
    ['KeyboardNavigationMode', '@visualisation-sub/mural/runtime'],
    ['ProgressIndicator',       '@visualisation-sub/mural/framework/notifications/progress-indicator.js'],
    ['ProgressIndicatorVariant','@visualisation-sub/mural/framework/notifications/progress-indicator.js'],
    ['Banner',                  '@visualisation-sub/mural/framework/notifications/banner.js'],
    ['Snackbar',                '@visualisation-sub/mural/framework/notifications/snackbar.js'],
    ['Dialog',                  '@visualisation-sub/mural/framework/surfaces/dialog.js'],
    ['BottomSheet',             '@visualisation-sub/mural/framework/surfaces/bottom-sheet.js'],
    ['ToolBar',                 '@visualisation-sub/mural/framework/surface.js'],
    ['ToolBarButton',           '@visualisation-sub/mural/framework/surface.js'],
    ['ToolBarToggleButton',     '@visualisation-sub/mural/framework/surface.js'],
    ['ToolBarSeparator',        '@visualisation-sub/mural/framework/surface.js'],
    ['ToolBarPosition',         '@visualisation-sub/mural/framework/surface.js'],
    ['ToolBarPopupHost',        '@visualisation-sub/mural/framework/surface.js'],
    ['ToolBarOverflowItemsControl', '@visualisation-sub/mural/framework/surface.js'],
    ['MenuStrip',               '@visualisation-sub/mural/framework/surface.js'],
    ['MenuButton',              '@visualisation-sub/mural/framework/surface.js'],
    ['MenuItem',                '@visualisation-sub/mural/framework/surface.js'],
    ['MenuSeparator',           '@visualisation-sub/mural/framework/surface.js'],
    ['ContextMenu',             '@visualisation-sub/mural/framework/surface.js'],
    ['ContextMenuService',      '@visualisation-sub/mural/framework/surface.js'],
    // Popup host shared by MenuButton + ContextMenu; referenced by the
    // framework.resources.mu default ControlTemplates.
    ['MenuPopupHost',           '@visualisation-sub/mural/framework/surface.js'],
    ['StatusBar',               '@visualisation-sub/mural/framework/surface.js'],
    ['StatusBarItem',           '@visualisation-sub/mural/framework/surface.js'],
    ['StatusBarSeparator',      '@visualisation-sub/mural/framework/surface.js'],
    ['ThemeSelector',           '@visualisation-sub/mural/framework/surface.js'],

    // ── Framework layer ─────────────────────────────────────────────
    // Templated-control base class. Sits between runtime's `Visual`
    // and the concrete control surface (ContentControl, ItemsControl,
    // MenuButton, ContextMenu, Drawer). `.mu` files reach for it when
    // declaring `[TargetType=Control]` style entries or test fixtures
    // that want to talk about templated controls polymorphically.
    ['Control',                 '@visualisation-sub/mural/framework'],

    // ── visual-engine ───────────────────────────────────────────────
    ['SolidColorBrush',     '@visualisation-sub/mural/visual-engine'],
    ['LinearGradientBrush', '@visualisation-sub/mural/visual-engine'],
    ['RadialGradientBrush', '@visualisation-sub/mural/visual-engine'],
    ['ImageBrush',          '@visualisation-sub/mural/visual-engine'],
    ['PatternBrush',        '@visualisation-sub/mural/visual-engine'],
    ['PatternKind',         '@visualisation-sub/mural/visual-engine'],
    ['GradientStop',        '@visualisation-sub/mural/visual-engine'],
    ['Brush',               '@visualisation-sub/mural/visual-engine'],
    ['Pen',                 '@visualisation-sub/mural/visual-engine'],
    ['FontWeight',          '@visualisation-sub/mural/visual-engine'],
    ['FontStyle',           '@visualisation-sub/mural/visual-engine'],
    ['Stretch',             '@visualisation-sub/mural/visual-engine'],
    ['AlignmentX',          '@visualisation-sub/mural/visual-engine'],
    ['AlignmentY',          '@visualisation-sub/mural/visual-engine'],
    ['GradientSpreadMethod', '@visualisation-sub/mural/visual-engine'],
    ['LineCap',             '@visualisation-sub/mural/visual-engine'],
    ['LineJoin',            '@visualisation-sub/mural/visual-engine'],
    ['FillRule',            '@visualisation-sub/mural/visual-engine'],
    ['SweepDirection',      '@visualisation-sub/mural/visual-engine'],
    ['DropShadowEffect',         '@visualisation-sub/mural/visual-engine'],
    ['MaterialElevationEffect',  '@visualisation-sub/mural/visual-engine'],

    // ── runtime/animation (motion easing curve palette) ────────────────
    ['Easings',             '@visualisation-sub/mural/runtime'],
];

export const DEFAULT_SYMBOLS: SymbolMap = new Map(ENTRIES);

// Enum class name → set of valid PascalCase members. Used by the
// emitter to decide whether to emit `Orientation.Vertical` (when the
// property name happens to match an enum class) AND to validate the
// member name. An ident in enum position that isn't in the member set
// is a compile error — silently emitting `Orientation.foo` would
// resolve to `undefined` at runtime and cascade into NaN through any
// layout math that touches the value.
//
// All runtime enums listed here MUST also appear in DEFAULT_SYMBOLS so
// the emitter can pull them in via an import. The member sets MUST
// stay in sync with the runtime declarations (src/runtime/visual.ts,
// src/visual-engine/*, src/basic/*) — there's no compile-time link
// between this table and the actual enum declarations, so adding a
// member to the runtime without updating this table makes the new
// member unusable from markup until the table is updated.
export const ENUM_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>([
    ['HorizontalAlignment',   new Set(['Left', 'Center', 'Right', 'Stretch'])],
    ['VerticalAlignment',     new Set(['Top', 'Center', 'Bottom', 'Stretch'])],
    ['Visibility',            new Set(['Visible', 'Hidden', 'Collapsed'])],
    ['PlacementMode',         new Set(['Bottom', 'Top', 'Left', 'Right', 'Center', 'Mouse'])],
    ['FontWeight',            new Set(['Normal', 'Medium', 'Bold'])],
    ['FontStyle',             new Set(['Normal', 'Italic'])],
    ['Stretch',               new Set(['None', 'Fill', 'Uniform', 'UniformToFill'])],
    ['AlignmentX',            new Set(['Left', 'Center', 'Right'])],
    ['AlignmentY',            new Set(['Top', 'Center', 'Bottom'])],
    ['BindingMode',           new Set(['OneWay', 'TwoWay', 'OneTime', 'OneWayToSource'])],
    ['GradientSpreadMethod',  new Set(['Pad', 'Reflect', 'Repeat'])],
    ['PatternKind',           new Set(['Stripes', 'Dots', 'Checker', 'Grid', 'CrossHatch'])],
    ['LineCap',               new Set(['Flat', 'Round', 'Square'])],
    ['LineJoin',              new Set(['Miter', 'Round', 'Bevel'])],
    ['FillRule',              new Set(['EvenOdd', 'Nonzero'])],
    ['SweepDirection',        new Set(['Counterclockwise', 'Clockwise'])],
    ['FanPivot',              new Set(['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'])],
    ['PuffyBase',             new Set(['Square', 'Diamond'])],
    ['PixelSource',           new Set(['Circle', 'Triangle'])],
    ['TextWrapping',          new Set(['NoWrap', 'Wrap'])],
    ['TextAlignment',         new Set(['Left', 'Center', 'Right'])],
    ['ClickMode',             new Set(['Release', 'Press', 'Hover'])],
    ['ButtonVariant',         new Set(['Filled', 'Elevated', 'Tonal', 'Outlined', 'Text', 'Standard'])],
    ['ColorPickerVariant',    new Set(['HSV', 'RGB'])],
    ['BrushPickerVariant',    new Set(['Solid', 'Linear', 'Radial', 'Pattern'])],
    ['FillEditorVariant',     new Set(['None', 'Solid', 'Linear', 'Radial', 'Pattern', 'Picture'])],
    ['TextBoxVariant',        new Set(['Filled', 'Outlined'])],
    ['ChipVariant',           new Set(['Assist', 'Filter', 'Input', 'Suggestion'])],
    ['SegmentedPosition',     new Set(['Single', 'Start', 'Middle', 'End'])],
    ['BadgeVariant',          new Set(['Dot', 'Numeric'])],
    ['ProgressIndicatorVariant', new Set(['Linear', 'Circular'])],
    ['FabSize',               new Set(['Small', 'Default', 'Large', 'Extended'])],
    ['CardVariant',           new Set(['Filled', 'Elevated', 'Outlined'])],
    ['TopAppBarVariant',      new Set(['Small', 'CenterAligned', 'Medium', 'Large'])],
    ['Orientation',           new Set(['Vertical', 'Horizontal'])],
    ['SelectionMode',         new Set(['Single', 'Multiple', 'Extended'])],
    ['MarqueeBoundsPolicy',   new Set(['Intersect', 'Contained'])],
    ['Dock',                  new Set(['Left', 'Top', 'Right', 'Bottom'])],
    ['ShellRegion',           new Set(['Header', 'Commands', 'Navigation', 'Content', 'Inspector', 'Status'])],
    ['DrawerVariant',         new Set(['Permanent', 'Persistent', 'Temporary'])],
    ['ToolBarPosition',       new Set(['None', 'Only', 'First', 'Middle', 'Last'])],
    ['Density',               new Set(['Compact', 'Regular', 'Comfortable'])],
    ['ViewportClass',         new Set(['Mobile', 'Tablet', 'Desktop'])],
    ['Pointer',               new Set(['Fine', 'Coarse'])],
    ['PrefersContrast',       new Set(['Normal', 'More'])],
    ['PreferredScheme',       new Set(['NoPreference', 'Light', 'Dark'])],
    // WPF-parity input enums (KeyBinding[Key=…, Modifiers=…],
    // MouseBinding[Gesture=…]). ModifierKeys is a [Flags] enum — markup
    // authors a single member today (`Modifiers=Control`); multi-modifier
    // combination syntax is a separate follow-up.
    ['Key', new Set([
        'None', 'Cancel', 'Back', 'Tab', 'Clear', 'Return', 'Pause',
        'CapsLock', 'Escape', 'Space', 'PageUp', 'PageDown', 'End', 'Home',
        'Left', 'Up', 'Right', 'Down', 'Select', 'Print', 'Execute',
        'PrintScreen', 'Insert', 'Delete', 'Help', 'D0', 'D1', 'D2', 'D3',
        'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'A', 'B', 'C', 'D', 'E', 'F',
        'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
        'U', 'V', 'W', 'X', 'Y', 'Z', 'LWin', 'RWin', 'Apps', 'Sleep',
        'NumPad0', 'NumPad1', 'NumPad2', 'NumPad3', 'NumPad4', 'NumPad5',
        'NumPad6', 'NumPad7', 'NumPad8', 'NumPad9', 'Multiply', 'Add',
        'Separator', 'Subtract', 'Decimal', 'Divide', 'F1', 'F2', 'F3', 'F4',
        'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F14',
        'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
        'NumLock', 'Scroll', 'LeftShift', 'RightShift', 'LeftCtrl',
        'RightCtrl', 'LeftAlt', 'RightAlt', 'BrowserBack', 'BrowserForward',
        'BrowserRefresh', 'BrowserStop', 'BrowserSearch', 'BrowserFavorites',
        'BrowserHome', 'VolumeMute', 'VolumeDown', 'VolumeUp',
        'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop',
        'MediaPlayPause', 'Oem1', 'OemPlus', 'OemComma', 'OemMinus',
        'OemPeriod', 'Oem2', 'Oem3', 'Oem4', 'Oem5', 'Oem6', 'Oem7',
        'Unknown',
    ])],
    ['ModifierKeys',          new Set(['None', 'Alt', 'Control', 'Shift', 'Windows'])],
    ['MouseAction',           new Set(['LeftClick', 'RightClick', 'MiddleClick', 'LeftDoubleClick', 'RightDoubleClick', 'MiddleDoubleClick'])],
    ['MouseButton',           new Set(['Left', 'Middle', 'Right', 'XButton1', 'XButton2'])],
    ['KeyboardNavigationMode', new Set(['Continue', 'Once', 'Cycle', 'None', 'Contained', 'Local'])],
]);

// Type → set of valid static-member names exposed for use in DOTTED
// value position (`CornerRadius.Full`, …). Distinct from ENUM_MEMBERS
// because the lookup trigger is different: enum members resolve from a
// BARE ident inside a property-context match, static members resolve
// from an explicit `Type.Member` dotted ref. Adding a class here lets
// `.mu` authors write the dotted form anywhere a ValueNode is accepted
// — including resource RHS positions (`@ShapeFull = CornerRadius.Full`)
// where no property-name context exists.
//
// The class must also appear in DEFAULT_SYMBOLS so the emitter can pull
// it in via an import. The member set must stay in sync with the
// runtime class's exported statics — there's no compile-time link.
export const STATIC_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>([
    ['CornerRadius', new Set(['Full', 'Zero', 'LeftRounded', 'RightRounded'])],
    ['GridLength',   new Set(['Auto', 'Star'])],
    ['Easings', new Set([
        'Linear', 'QuadIn', 'QuadOut', 'QuadInOut',
        'CubicIn', 'CubicOut', 'CubicInOut',
        // M3 motion easing tokens (https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)
        'Standard', 'StandardAccelerate', 'StandardDecelerate',
        'Emphasized', 'EmphasizedAccelerate', 'EmphasizedDecelerate',
    ])],
    // FontWeight is also in ENUM_MEMBERS so `FontWeight = Normal` works
    // when the LHS property's enum type is FontWeight. STATIC_MEMBERS
    // covers the standalone case — `@SomeToken = FontWeight.Normal` in
    // scheme value position, where there's no LHS property to drive
    // the enum-member resolution.
    ['FontWeight', new Set(['Normal', 'Medium', 'Bold'])],
]);

// Property-name → enum class candidates. Used when the markup
// property name does not equal the enum class name (`Variant`,
// `Anchor`, …). The compiler consults this map before falling through
// to "unresolved identifier" — that way a markup author writing
// `Variant=Persistent` gets the same strict member-validation a
// `HorizontalAlignment=Center` site does.
//
// Multiple candidate enums per property let the same DP name carry
// different value sets across host classes — e.g. `Variant` is both
// `DrawerVariant` (Permanent/Persistent/Temporary) on Drawer AND
// `ButtonVariant` (Filled/Elevated/Tonal/…) on Button. The compiler
// walks the candidates and picks the first one whose ENUM_MEMBERS set
// contains the literal. When two candidates share a literal (Card and
// Button both define `Filled`/`Elevated`/`Outlined`), the emit picks
// whichever appears first in this list — that's still runtime-correct
// because the shared literals carry identical string values across
// every Variant enum (Filled === 'Filled' in every enum that defines
// it), so the host's setter still receives the same string at the wire.
//
// Entries here MUST point at enum classes that are also in
// ENUM_MEMBERS.
export const PROPERTY_TO_ENUM: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
    ['Variant',  ['ButtonVariant', 'DrawerVariant', 'CardVariant', 'TopAppBarVariant', 'TextBoxVariant', 'BadgeVariant', 'ProgressIndicatorVariant', 'ColorPickerVariant', 'BrushPickerVariant', 'FillEditorVariant']],
    ['Kind',     ['ChipVariant', 'PatternKind']],
    ['PatternKind', ['PatternKind']],
    ['LineCap',  ['LineCap']],
    ['LineJoin', ['LineJoin']],
    ['EffectiveVariant', ['TopAppBarVariant']],
    ['Size',     ['FabSize']],
    ['Anchor',   ['Dock']],
    ['Region',   ['ShellRegion']],
    ['Position', ['ToolBarPosition', 'SegmentedPosition']],
    ['Pivot',    ['FanPivot']],
    ['Base',     ['PuffyBase']],
    ['Source',   ['PixelSource']],
    // KeyBinding.Modifiers / MouseBinding.Modifiers → ModifierKeys;
    // MouseBinding.Gesture → MouseAction. (KeyBinding.Key resolves via the
    // property-name == enum-class-name path, like HorizontalAlignment.)
    ['Modifiers', ['ModifierKeys']],
    ['Gesture',   ['MouseAction']],
    ['TabNavigation', ['KeyboardNavigationMode']],
]);

// Meta-attr names whose RHS is a type reference (compiled as a bare
// class name, not a string). Used by resource forms.
export const TYPE_REF_META_ATTRS: ReadonlySet<string> = new Set([
    'TargetType',
    'DataType',
]);

// Per-control default-slot info. Used by the emitter to translate
// `Border{ TextBlock{…} }` → `_border.Child = _text` vs
// `Canvas{ A B C }` → `_canvas.Children.push(_a/_b/_c)`.
//
// The `kind` controls how body elements are assigned:
//   'single'   — body must have exactly one element; assigned via slot
//   'list'     — body elements appended to a collection
//   'string'   — body parsed as text mode (deferred — not in phase 3)
//   'object'   — body is one element OR a literal (ContentControl-ish)
export interface SlotInfo
{
    name: string;
    kind: 'single' | 'list' | 'string' | 'object';
}

// One entry per known control. Unknown controls fall back to 'single'
// + 'Child' with an emit-time error if the body doesn't match.
export const DEFAULT_SLOT_INFO: ReadonlyMap<string, SlotInfo> = new Map<string, SlotInfo>([
    ['AdornerDecorator',        { name: 'Child',    kind: 'single' }],
    ['Border',                  { name: 'Child',    kind: 'single' }],
    ['Button',                  { name: 'Content',  kind: 'object' }],
    ['IconButton',              { name: 'Content',  kind: 'object' }],
    ['IconButtonToggle',        { name: 'Content',  kind: 'object' }],
    ['FloatingActionButton',    { name: 'Content',  kind: 'object' }],
    ['Card',                    { name: 'Content',  kind: 'object' }],
    ['TopAppBar',               { name: 'Actions',  kind: 'list'   }],
    ['NavigationItem',          { name: 'Content',  kind: 'object' }],
    ['NavigationRail',          { name: 'Items',    kind: 'list'   }],
    ['NavigationBar',           { name: 'Items',    kind: 'list'   }],
    ['EditorShell',             { name: 'Children', kind: 'list'   }],
    ['ViewerShell',             { name: 'Children', kind: 'list'   }],
    ['TabControl',              { name: 'Items',    kind: 'list'   }],
    ['TabItem',                 { name: 'Content',  kind: 'object' }],
    ['Chip',                    { name: 'Content',  kind: 'object' }],
    ['TextBlock',               { name: 'Text',     kind: 'string' }],
    ['Canvas',                  { name: 'Children', kind: 'list'   }],
    ['PaginatedCanvas',         { name: 'Children', kind: 'list'   }],
    ['StackPanel',              { name: 'Children', kind: 'list'   }],
    ['WrapPanel',               { name: 'Children', kind: 'list'   }],
    ['UniformGrid',             { name: 'Children', kind: 'list'   }],
    ['Grid',                    { name: 'Children', kind: 'list'   }],
    ['DockPanel',               { name: 'Children', kind: 'list'   }],
    ['ButtonGroup',             { name: 'Children', kind: 'list'   }],
    ['SegmentedButton',         { name: 'Items',    kind: 'list'   }],
    ['SegmentedItem',           { name: 'Content',  kind: 'object' }],
    ['SplitButton',             { name: 'Content',  kind: 'object' }],
    ['FabMenu',                 { name: 'Content',  kind: 'object' }],
    ['Drawer',                  { name: 'Content',  kind: 'object' }],
    ['TreeView',                { name: 'Items',    kind: 'list'   }],
    ['TreeViewItem',            { name: 'Items',    kind: 'list'   }],
    ['ListBox',                 { name: 'Items',    kind: 'list'   }],
    ['ListBoxItem',             { name: 'Content',  kind: 'object' }],
    ['TextBox',                 { name: 'Text',     kind: 'string' }],
    ['PageView',                { name: 'Content',  kind: 'object' }],
    ['ContentControl',          { name: 'Content',  kind: 'object' }],
    ['ContentPresenter',        { name: 'Content',  kind: 'object' }],
    ['Figure',                  { name: 'Content',  kind: 'object' }],
    ['Group',                   { name: 'Content',  kind: 'object' }],
    ['ItemsControl',            { name: 'Items',    kind: 'list'   }],
    ['Selector',                { name: 'Items',    kind: 'list'   }],
    ['Diagram',                 { name: 'Items',    kind: 'list'   }],
    ['VirtualizingStackPanel',  { name: 'Children', kind: 'list'   }],
    ['VirtualizingWrapPanel',   { name: 'Children', kind: 'list'   }],
    ['ScrollViewer',            { name: 'Content',  kind: 'object' }],

    // Internal helper classes (see DEFAULT_SYMBOLS comment above).
    ['ClickableBorder',         { name: 'Child',    kind: 'single' }],
    ['ClickAwayScrim',          { name: 'Child',    kind: 'single' }],
    ['SplitRow',                { name: 'Children', kind: 'list'   }],
    ['ComboBoxPopupHost',       { name: 'Children', kind: 'list'   }],
    ['ScrimSurface',            { name: 'Child',    kind: 'single' }],
    ['TemporaryOverlayHost',    { name: 'Children', kind: 'list'   }],
    ['ClickableRow',            { name: 'Child',    kind: 'single' }],
    ['ChevronTarget',           { name: 'Child',    kind: 'single' }],
    ['CollapsibleStack',        { name: 'Children', kind: 'list'   }],
    ['ScrollBarLayout',         { name: 'Children', kind: 'list'   }],
    ['ScrollViewerLayout',      { name: 'Children', kind: 'list'   }],
    ['ScrollContentPresenter',  { name: 'Content',  kind: 'object' }],
    ['SliderLayout',            { name: 'Children', kind: 'list'   }],
    ['TextEditorSurface',       { name: 'Children', kind: 'list'   }],

    // ── Command-surface controls (5.11) ─────────────────────────────
    ['ToggleButton',            { name: 'Content',  kind: 'object' }],
    ['ToolBar',                 { name: 'Items',    kind: 'list'   }],
    ['ToolBarPopupHost',        { name: 'Children', kind: 'list'   }],
    ['ToolBarButton',           { name: 'Content',  kind: 'object' }],
    ['ToolBarToggleButton',     { name: 'Content',  kind: 'object' }],
    // ToolBarSeparator has no body; falls back to single/Child error
    // path on accidental nesting — fine.
    ['MenuStrip',               { name: 'Items',    kind: 'list'   }],
    ['MenuButton',              { name: 'Items',    kind: 'list'   }],
    ['MenuItem',                { name: 'Items',    kind: 'list'   }],
    // MenuSeparator: no body
    ['ContextMenu',             { name: 'Items',    kind: 'list'   }],
    // MenuPopupHost: Panel-shaped, takes Scrim + popup-container as
    // children declaratively from the default ControlTemplates in
    // framework.resources.mu.
    ['MenuPopupHost',           { name: 'Children', kind: 'list'   }],
    ['StatusBar',               { name: 'Items',    kind: 'list'   }],
    ['StatusBarItem',           { name: 'Content',  kind: 'object' }],
    // StatusBarSeparator: no body
]);
