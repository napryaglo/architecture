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
    ['Application',         '@pragmatic-lab/mural/runtime'],
    ['ServiceProvider',     '@pragmatic-lab/mural/runtime'],
    ['Visual',              '@pragmatic-lab/mural/runtime'],
    ['Single',              '@pragmatic-lab/mural/runtime'],
    ['Panel',               '@pragmatic-lab/mural/runtime'],
    ['ResourceDictionary',  '@pragmatic-lab/mural/runtime'],
    ['Style',               '@pragmatic-lab/mural/runtime'],
    ['Setter',              '@pragmatic-lab/mural/runtime'],
    ['SetterFactory',       '@pragmatic-lab/mural/runtime'],
    ['PropertyTrigger',     '@pragmatic-lab/mural/runtime'],
    ['TriggerUnset',        '@pragmatic-lab/mural/runtime'],
    ['TriggerSet',          '@pragmatic-lab/mural/runtime'],
    ['EventTrigger',           '@pragmatic-lab/mural/runtime'],
    ['BeginStoryboardAction',  '@pragmatic-lab/mural/runtime'],
    ['InvokeCommandAction',    '@pragmatic-lab/mural/runtime'],
    ['StopStoryboardAction',   '@pragmatic-lab/mural/runtime'],
    ['PauseStoryboardAction',  '@pragmatic-lab/mural/runtime'],
    ['ResumeStoryboardAction', '@pragmatic-lab/mural/runtime'],
    ['AttachBehaviorAction',   '@pragmatic-lab/mural/runtime'],
    ['DetachBehaviorAction',   '@pragmatic-lab/mural/runtime'],
    ['Storyboard',             '@pragmatic-lab/mural/runtime'],
    ['DoubleAnimation',        '@pragmatic-lab/mural/runtime'],
    ['ColorAnimation',         '@pragmatic-lab/mural/runtime'],
    ['ThicknessAnimation',     '@pragmatic-lab/mural/runtime'],
    ['Binding',             '@pragmatic-lab/mural/runtime'],
    ['BindingMode',         '@pragmatic-lab/mural/runtime'],
    ['DynamicResource',     '@pragmatic-lab/mural/runtime'],
    ['DataContextBinding',  '@pragmatic-lab/mural/runtime'],
    ['ElementNameBinding',  '@pragmatic-lab/mural/runtime'],
    ['ServiceBinding',      '@pragmatic-lab/mural/runtime'],
    ['SelfBinding',         '@pragmatic-lab/mural/runtime'],
    ['composeConverters',   '@pragmatic-lab/mural/runtime'],
    // Built-in color modifiers — converter factories usable on the `<<`
    // pipe (`#0d47a1 << Lighten(0.5)`). User-defined modifiers follow the
    // same shape and are pulled in with a `.mu` import clause instead.
    ['Lighten',             '@pragmatic-lab/mural/runtime'],
    ['Darken',              '@pragmatic-lab/mural/runtime'],
    ['Mix',                 '@pragmatic-lab/mural/runtime'],
    ['Saturate',            '@pragmatic-lab/mural/runtime'],
    ['Desaturate',          '@pragmatic-lab/mural/runtime'],
    ['Alpha',               '@pragmatic-lab/mural/runtime'],
    // General value-reflection converter factory for `$path << Is(x)`:
    // convert → `value === x`, convertBack → `x`. Drives a ToggleButton's
    // IsChecked from an enum-valued binding (radio-style selection where
    // clicking always selects x, so clicking the active one is a no-op).
    ['Is',                  '@pragmatic-lab/mural/runtime'],
    // Boolean → Visibility converter factory for `Visibility = $path <<
    // ToVisibility()`: truthy → Visible, falsy → Collapsed (or the passed
    // Visibility). Collapses a region reactively off a bool DP.
    ['ToVisibility',        '@pragmatic-lab/mural/runtime'],
    ['MultiBinding',        '@pragmatic-lab/mural/runtime'],
    ['TemplateBinding',     '@pragmatic-lab/mural/runtime'],
    ['MultiTrigger',        '@pragmatic-lab/mural/runtime'],
    ['DataTrigger',         '@pragmatic-lab/mural/runtime'],
    ['MultiDataTrigger',    '@pragmatic-lab/mural/runtime'],
    ['HorizontalAlignment', '@pragmatic-lab/mural/runtime'],
    ['VerticalAlignment',   '@pragmatic-lab/mural/runtime'],
    ['Visibility',          '@pragmatic-lab/mural/runtime'],
    ['Point',               '@pragmatic-lab/mural/runtime'],
    ['Size',                '@pragmatic-lab/mural/runtime'],
    ['Rect',                '@pragmatic-lab/mural/runtime'],
    ['Color',               '@pragmatic-lab/mural/runtime'],
    ['Matrix',              '@pragmatic-lab/mural/runtime'],
    ['Thickness',           '@pragmatic-lab/mural/runtime'],
    ['CornerRadius',        '@pragmatic-lab/mural/runtime'],
    // Theme engine — emitted by `theme` / `scheme` top-level forms.
    ['defineScheme',        '@pragmatic-lab/mural/runtime'],
    ['defineTheme',         '@pragmatic-lab/mural/runtime'],
    ['Scheme',              '@pragmatic-lab/mural/runtime'],
    ['Theme',               '@pragmatic-lab/mural/runtime'],
    ['ThemeManager',        '@pragmatic-lab/mural/runtime'],
    ['Application',         '@pragmatic-lab/mural/runtime'],
    // Adaptive context — inherited DPs on Visual written by ThemeManager
    // / MediaWatcher; templates trigger on these via the standard `when`
    // syntax (`when (Density = Compact) { … }`).
    ['Density',             '@pragmatic-lab/mural/runtime'],
    ['ViewportClass',       '@pragmatic-lab/mural/runtime'],
    ['Pointer',             '@pragmatic-lab/mural/runtime'],
    ['PrefersContrast',     '@pragmatic-lab/mural/runtime'],
    ['PreferredScheme',     '@pragmatic-lab/mural/runtime'],
    ['DataObject',          '@pragmatic-lab/mural/runtime'],
    ['DragDropEffects',     '@pragmatic-lab/mural/runtime'],
    ['DragDrop',            '@pragmatic-lab/mural/runtime'],

    // ── basic controls ──────────────────────────────────────────────
    ['Border',                  '@pragmatic-lab/mural/basic'],
    ['DomHost',                 '@pragmatic-lab/mural/basic'],
    ['Button',                  '@pragmatic-lab/mural/framework/buttons/button.js'],
    ['IconButton',              '@pragmatic-lab/mural/framework/buttons/icon-button.js'],
    ['IconButtonToggle',        '@pragmatic-lab/mural/framework/buttons/icon-button-toggle.js'],
    ['FloatingActionButton',    '@pragmatic-lab/mural/framework/buttons/fab.js'],
    ['FabSize',                 '@pragmatic-lab/mural/framework/buttons/fab.js'],
    ['Card',                    '@pragmatic-lab/mural/framework/surfaces/card.js'],
    ['CardVariant',             '@pragmatic-lab/mural/framework/surfaces/card.js'],
    ['TopAppBar',               '@pragmatic-lab/mural/framework/top-app-bar/top-app-bar.js'],
    ['TopAppBarVariant',        '@pragmatic-lab/mural/framework/top-app-bar/top-app-bar.js'],
    ['BottomAppBar',            '@pragmatic-lab/mural/framework/bottom-app-bar/bottom-app-bar.js'],
    ['NavigationItem',          '@pragmatic-lab/mural/framework/navigation/navigation-item.js'],
    ['NavigationRail',          '@pragmatic-lab/mural/framework/navigation/navigation-rail.js'],
    ['NavigationBar',           '@pragmatic-lab/mural/framework/navigation/navigation-bar.js'],
    ['ShellBase',               '@pragmatic-lab/mural/framework/shell/shell.js'],
    ['EditorShell',             '@pragmatic-lab/mural/framework/shell/editor-shell.js'],
    ['ViewerShell',             '@pragmatic-lab/mural/framework/shell/viewer-shell.js'],
    ['ShellSideContentPane',    '@pragmatic-lab/mural/framework/shell/shell-side-content-pane.js'],
    ['PanelButton',             '@pragmatic-lab/mural/framework/shell/panel-button.js'],
    ['ShellModule',             '@pragmatic-lab/mural/framework/shell/module.js'],
    ['Capability',              '@pragmatic-lab/mural/framework/shell/module.js'],
    ['RailAction',              '@pragmatic-lab/mural/framework/shell/rail-action.js'],
    ['SettingDefinition',       '@pragmatic-lab/mural/framework/shell/settings/setting-definition.js'],
    ['SettingKind',             '@pragmatic-lab/mural/framework/shell/settings/setting-definition.js'],
    ['DocumentDefinition',      '@pragmatic-lab/mural/framework/shell/documents/document-definition.js'],
    ['DocumentTypeRegistry',    '@pragmatic-lab/mural/framework/shell/documents/document-type-registry.js'],
    ['ProjectFactoryDefinition', '@pragmatic-lab/mural/framework/shell/projects/project-factory-definition.js'],
    ['ProjectFactoryRegistry',  '@pragmatic-lab/mural/framework/shell/projects/project-factory-registry.js'],
    ['CommandDefinition',       '@pragmatic-lab/mural/framework/shell/commands/command-definition.js'],
    ['CommandGroupPresentation', '@pragmatic-lab/mural/framework/shell/commands/command-definition.js'],
    ['CommandRegistry',         '@pragmatic-lab/mural/framework/shell/commands/command-registry.js'],
    ['CommandViewModel',        '@pragmatic-lab/mural/framework/shell/commands/command-view-model.js'],
    ['CommandToggleViewModel',  '@pragmatic-lab/mural/framework/shell/commands/command-view-model.js'],
    ['ShellControlDefinition',  '@pragmatic-lab/mural/framework/shell/commands/shell-control-definition.js'],
    ['ShellRegion',             '@pragmatic-lab/mural/framework/shell/commands/shell-control-definition.js'],
    ['ToolbarFlatGroup',        '@pragmatic-lab/mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarSeparatorItem',    '@pragmatic-lab/mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarSplitMenuGroup',   '@pragmatic-lab/mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarSplitGridGroup',   '@pragmatic-lab/mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarToggleGroup',      '@pragmatic-lab/mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ShellControlViewModel',   '@pragmatic-lab/mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarService',          '@pragmatic-lab/mural/framework/shell/commands/toolbar-service.js'],
    ['NavigationService',       '@pragmatic-lab/mural/framework/shell/services/navigation-service.js'],
    ['PanelDockService',        '@pragmatic-lab/mural/framework/shell/services/panel-dock-service.js'],
    ['DialogService',           '@pragmatic-lab/mural/framework/shell/services/dialog-service.js'],
    ['StatusService',           '@pragmatic-lab/mural/framework/shell/services/status-service.js'],
    ['ContentHostService',      '@pragmatic-lab/mural/framework/shell/services/content-host-service.js'],
    ['DocumentsContentHostService', '@pragmatic-lab/mural/framework/shell/services/documents-content-host-service.js'],
    ['DocumentSelectorService', '@pragmatic-lab/mural/framework/shell/services/document-selector-service.js'],
    ['ClickMode',               '@pragmatic-lab/mural/framework/buttons/button.js'],
    ['ButtonVariant',           '@pragmatic-lab/mural/framework/buttons/button.js'],
    ['TextBlock',               '@pragmatic-lab/mural/basic'],
    ['Run',                     '@pragmatic-lab/mural/basic'],
    ['Span',                    '@pragmatic-lab/mural/basic'],
    ['Bold',                    '@pragmatic-lab/mural/basic'],
    ['Italic',                  '@pragmatic-lab/mural/basic'],
    ['Underline',               '@pragmatic-lab/mural/basic'],
    ['LineBreak',               '@pragmatic-lab/mural/basic'],
    ['Hyperlink',               '@pragmatic-lab/mural/basic'],
    ['InlineUIContainer',       '@pragmatic-lab/mural/basic'],
    // Block flow-content model (FlowDocument analog) + its hosts.
    ['FlowDocument',            '@pragmatic-lab/mural/basic'],
    ['Paragraph',               '@pragmatic-lab/mural/basic'],
    ['List',                    '@pragmatic-lab/mural/basic'],
    ['ListItem',                '@pragmatic-lab/mural/basic'],
    ['ListMarkerStyle',         '@pragmatic-lab/mural/basic'],
    ['RichTextBlock',           '@pragmatic-lab/mural/basic'],
    ['RichTextBox',             '@pragmatic-lab/mural/basic'],
    ['Canvas',                  '@pragmatic-lab/mural/basic'],
    ['PaginatedCanvas',         '@pragmatic-lab/mural/basic'],
    ['Ellipse',                 '@pragmatic-lab/mural/basic'],
    ['Shape',                   '@pragmatic-lab/mural/basic'],
    ['Path',                    '@pragmatic-lab/mural/basic'],
    ['Image',                   '@pragmatic-lab/mural/basic'],
    ['Icon',                    '@pragmatic-lab/mural/basic'],
    ['Line',                    '@pragmatic-lab/mural/basic'],
    ['Rectangle',               '@pragmatic-lab/mural/basic'],
    ['ComboBox',                '@pragmatic-lab/mural/framework/list/combo-box.js'],
    ['DockPanel',               '@pragmatic-lab/mural/basic'],
    ['Dock',                    '@pragmatic-lab/mural/basic'],
    ['Drawer',                  '@pragmatic-lab/mural/framework/surfaces/drawer.js'],
    ['DrawerVariant',           '@pragmatic-lab/mural/framework/surfaces/drawer.js'],
    ['SideSheet',               '@pragmatic-lab/mural/framework/surfaces/side-sheet.js'],
    ['SideSheetVariant',        '@pragmatic-lab/mural/framework/surfaces/side-sheet.js'],
    ['TreeView',                '@pragmatic-lab/mural/framework/list/tree-view.js'],
    ['TreeViewItem',            '@pragmatic-lab/mural/framework/list/tree-view.js'],
    ['ListBox',                 '@pragmatic-lab/mural/framework/list/list-box.js'],
    ['ListBoxItem',             '@pragmatic-lab/mural/framework/list/list-box.js'],
    ['SelectionMode',           '@pragmatic-lab/mural/framework/list/list-box.js'],
    ['MarqueeBoundsPolicy',     '@pragmatic-lab/mural/framework/list/selector.js'],
    ['TextBox',                 '@pragmatic-lab/mural/basic'],
    ['SpinEdit',                '@pragmatic-lab/mural/basic'],
    ['Slider',                  '@pragmatic-lab/mural/basic'],
    ['SliderSpinEdit',          '@pragmatic-lab/mural/basic'],
    ['ColorPicker',             '@pragmatic-lab/mural/framework'],
    ['ColorPickerVariant',      '@pragmatic-lab/mural/framework'],
    ['FontFamilyPicker',        '@pragmatic-lab/mural/framework'],
    ['FontSizePicker',          '@pragmatic-lab/mural/framework'],
    ['ColorScheme',             '@pragmatic-lab/mural/framework'],
    ['BrushPicker',             '@pragmatic-lab/mural/framework'],
    ['BrushPickerVariant',      '@pragmatic-lab/mural/framework'],
    ['PenEditor',               '@pragmatic-lab/mural/framework'],
    ['FillEditor',              '@pragmatic-lab/mural/framework'],
    ['FillEditorVariant',       '@pragmatic-lab/mural/framework'],
    ['ShapeFormatControl',      '@pragmatic-lab/mural/framework'],
    ['CapOption',               '@pragmatic-lab/mural/framework'],
    ['PageView',                '@pragmatic-lab/mural/basic'],

    // Runtime types that the emitter may reference even when the
    // consumer's source doesn't name them directly — added on demand
    // by the emit pass.
    ['NameScope',               '@pragmatic-lab/mural/runtime'],
    ['PropertyTransition',      '@pragmatic-lab/mural/runtime'],
    ['StackPanel',              '@pragmatic-lab/mural/basic'],
    ['WrapPanel',               '@pragmatic-lab/mural/basic'],
    ['UniformGrid',             '@pragmatic-lab/mural/basic'],
    ['Orientation',             '@pragmatic-lab/mural/basic'],
    ['ContentControl',          '@pragmatic-lab/mural/framework/base/content-control.js'],
    ['ContentPresenter',        '@pragmatic-lab/mural/basic'],
    ['Figure',                  '@pragmatic-lab/mural/framework/diagram/figure.js'],
    ['TextNodeVM',              '@pragmatic-lab/mural/framework/diagram/text-node-vm.js'],
    ['CalloutNodeVM',           '@pragmatic-lab/mural/framework/diagram/callout-node-vm.js'],
    ['ShapeText',               '@pragmatic-lab/mural/framework/diagram/shape-text.js'],
    ['Group',                   '@pragmatic-lab/mural/framework/diagram/group.js'],
    ['Diagram',                 '@pragmatic-lab/mural/framework/diagram/diagram.js'],
    // Connector — markup references it for the `Connector.CapInset`
    // attached property on cap templates. ConnectorCapDataContext is the
    // DataType those cap DataTemplates bind against ($Brush / $Pen).
    ['Connector',               '@pragmatic-lab/mural/framework/diagram/connector.js'],
    ['ConnectorCapDataContext', '@pragmatic-lab/mural/framework/diagram/caps/connector-cap-data-context.js'],
    ['ToolboxVisualPresenter',  '@pragmatic-lab/mural/framework/diagram/toolbox/toolbox-visual-presenter.js'],
    ['ToolboxRepository',       '@pragmatic-lab/mural/framework/diagram/toolbox/toolbox-repository.js'],
    ['ToolboxPage',             '@pragmatic-lab/mural/framework/diagram/toolbox/toolbox-page.js'],
    ['ToolboxItem',             '@pragmatic-lab/mural/framework/diagram/toolbox/toolbox-item.js'],
    ['VisualContext',           '@pragmatic-lab/mural/framework/diagram/toolbox/toolbox-visual-resolver.js'],
    ['DiagramDocument',         '@pragmatic-lab/mural/framework/diagram/diagram-document.js'],
    ['DiagramStorageKey',       '@pragmatic-lab/mural/framework/diagram/diagram-document.js'],
    ['DiagramEditingContext',   '@pragmatic-lab/mural/framework/diagram/diagram-command-contexts.js'],
    ['DiagramInspector',        '@pragmatic-lab/mural/framework/diagram/diagram-inspector.js'],
    ['Grid',                    '@pragmatic-lab/mural/basic'],
    ['GridLength',              '@pragmatic-lab/mural/basic'],
    ['ColumnDefinition',        '@pragmatic-lab/mural/basic'],
    ['RowDefinition',           '@pragmatic-lab/mural/basic'],
    ['ControlTemplate',         '@pragmatic-lab/mural/basic'],
    ['DataTemplate',            '@pragmatic-lab/mural/basic'],
    ['TargetedSetter',          '@pragmatic-lab/mural/basic'],
    ['TemplatePropertyTrigger',  '@pragmatic-lab/mural/basic'],
    ['TemplateDataTrigger',      '@pragmatic-lab/mural/basic'],
    ['TemplateMultiDataTrigger', '@pragmatic-lab/mural/basic'],
    ['ItemsControl',            '@pragmatic-lab/mural/framework/base/items-control.js'],
    ['ListReorderBehavior',     '@pragmatic-lab/mural/basic'],
    ['LogBehavior',             '@pragmatic-lab/mural/basic'],
    ['FocusOnVisibleBehavior',  '@pragmatic-lab/mural/basic'],
    ['Selector',                '@pragmatic-lab/mural/framework/list/selector.js'],
    ['ItemContainerGenerator',  '@pragmatic-lab/mural/basic'],
    ['ItemsPresenter',          '@pragmatic-lab/mural/basic'],
    ['AdornerDecorator',        '@pragmatic-lab/mural/basic'],
    ['HierarchicalDataTemplate','@pragmatic-lab/mural/basic'],
    ['ItemsPanelTemplate',      '@pragmatic-lab/mural/basic'],
    ['CollectionView',          '@pragmatic-lab/mural/basic'],
    ['SortDescription',         '@pragmatic-lab/mural/basic'],
    ['GroupDescription',        '@pragmatic-lab/mural/basic'],
    ['ScrollViewer',            '@pragmatic-lab/mural/framework/surfaces/scroll-viewer.js'],
    ['ScrollBar',               '@pragmatic-lab/mural/basic'],
    ['Thumb',                   '@pragmatic-lab/mural/basic'],
    ['GridSplitter',            '@pragmatic-lab/mural/basic'],
    ['Splitter',                '@pragmatic-lab/mural/basic'],
    ['VirtualizingPanel',       '@pragmatic-lab/mural/basic'],
    ['VirtualizingStackPanel',  '@pragmatic-lab/mural/basic'],
    ['VirtualizingWrapPanel',   '@pragmatic-lab/mural/basic'],
    ['TextWrapping',            '@pragmatic-lab/mural/basic'],
    ['TextAlignment',           '@pragmatic-lab/mural/basic'],
    ['MeasurementFidelity',     '@pragmatic-lab/mural/basic'],
    ['TextPlacement',           '@pragmatic-lab/mural/framework'],
    ['TextBoxVariant',          '@pragmatic-lab/mural/basic'],
    ['Arc',                     '@pragmatic-lab/mural/basic'],
    ['Squircle',                '@pragmatic-lab/mural/basic'],
    ['Pill',                    '@pragmatic-lab/mural/basic'],
    ['Arch',                    '@pragmatic-lab/mural/basic'],
    ['Semicircle',              '@pragmatic-lab/mural/basic'],
    ['Triangle',                '@pragmatic-lab/mural/basic'],
    ['Arrow',                   '@pragmatic-lab/mural/basic'],
    ['Fan',                     '@pragmatic-lab/mural/basic'],
    ['FanPivot',                '@pragmatic-lab/mural/basic'],
    ['Clamshell',               '@pragmatic-lab/mural/basic'],
    ['Cookie',                  '@pragmatic-lab/mural/basic'],
    ['Diamond',                 '@pragmatic-lab/mural/basic'],
    ['Pentagon',                '@pragmatic-lab/mural/basic'],
    ['Gem',                     '@pragmatic-lab/mural/basic'],
    ['FourSidedCookie',         '@pragmatic-lab/mural/basic'],
    ['SixSidedCookie',          '@pragmatic-lab/mural/basic'],
    ['SevenSidedCookie',        '@pragmatic-lab/mural/basic'],
    ['NineSidedCookie',         '@pragmatic-lab/mural/basic'],
    ['TwelveSidedCookie',       '@pragmatic-lab/mural/basic'],
    ['Clover',                  '@pragmatic-lab/mural/basic'],
    ['FourLeafClover',          '@pragmatic-lab/mural/basic'],
    ['EightLeafClover',         '@pragmatic-lab/mural/basic'],
    ['Slanted',                 '@pragmatic-lab/mural/basic'],
    ['Puffy',                   '@pragmatic-lab/mural/basic'],
    ['PuffyDiamond',            '@pragmatic-lab/mural/basic'],
    ['PuffyBase',               '@pragmatic-lab/mural/basic'],
    ['Heart',                   '@pragmatic-lab/mural/basic'],
    ['HeartPresenter',          '@pragmatic-lab/mural/basic'],
    ['Bun',                     '@pragmatic-lab/mural/basic'],
    ['Ghostish',                '@pragmatic-lab/mural/basic'],
    ['PixelArt',                '@pragmatic-lab/mural/basic'],
    ['PixelCircle',             '@pragmatic-lab/mural/basic'],
    ['PixelTriangle',           '@pragmatic-lab/mural/basic'],
    ['PixelSource',             '@pragmatic-lab/mural/basic'],
    ['RadialWave',              '@pragmatic-lab/mural/basic'],
    ['Sunny',                   '@pragmatic-lab/mural/basic'],
    ['VerySunny',               '@pragmatic-lab/mural/basic'],
    ['Burst',                   '@pragmatic-lab/mural/basic'],
    ['SoftBurst',               '@pragmatic-lab/mural/basic'],
    ['Boom',                    '@pragmatic-lab/mural/basic'],
    ['SoftBoom',                '@pragmatic-lab/mural/basic'],
    ['Flower',                  '@pragmatic-lab/mural/basic'],

    // ── Internal helper classes ────────────────────────────────────
    // Layout / behaviour primitives owned by individual controls but
    // exported from their files (and re-exported from the basic
    // barrel) so the controls' bundled `.template.mu` defaults can
    // reference them by name. Registered here as well so the LSP /
    // analyzer accepts them when an in-tree template is opened — the
    // build-control-templates script overrides these entries with
    // direct relative file paths at compile time.
    ['ClickableBorder',         '@pragmatic-lab/mural/basic/clickable-border.js'],
    ['ClickAwayScrim',          '@pragmatic-lab/mural/basic/click-away-scrim.js'],
    ['SplitRow',                '@pragmatic-lab/mural/framework/list/combo-box.js'],
    ['ComboBoxPopupHost',       '@pragmatic-lab/mural/framework/list/combo-box.js'],
    ['ComboBoxItem',            '@pragmatic-lab/mural/framework/list/combo-box.js'],
    ['ComboBoxItemList',        '@pragmatic-lab/mural/framework/list/combo-box.js'],
    ['ScrimSurface',            '@pragmatic-lab/mural/framework/surfaces/drawer.js'],
    ['TemporaryOverlayHost',    '@pragmatic-lab/mural/framework/surfaces/drawer.js'],
    ['ClickableRow',            '@pragmatic-lab/mural/framework/list/tree-view.js'],
    ['ChevronTarget',           '@pragmatic-lab/mural/framework/list/tree-view.js'],
    ['CollapsibleStack',        '@pragmatic-lab/mural/framework/list/tree-view.js'],
    ['ScrollBarLayout',         '@pragmatic-lab/mural/basic'],
    ['ScrollViewerLayout',      '@pragmatic-lab/mural/framework/surfaces/scroll-viewer.js'],
    ['ScrollContentPresenter',  '@pragmatic-lab/mural/basic'],
    ['SliderLayout',            '@pragmatic-lab/mural/basic'],
    ['TextEditorSurface',       '@pragmatic-lab/mural/basic'],

    // ── Command-surface controls (5.11) ─────────────────────────────
    // These extend Button / Visual and live in a separate barrel
    // (`./surface.js`) to avoid a TDZ cycle through the main basic
    // barrel during Button's default-style theme cascade.
    ['ToggleButton',            '@pragmatic-lab/mural/framework/buttons/toggle-button.js'],
    // M3 Switch — capitalised `Switch` is fine in JS (only the
    // lowercase `switch` keyword is reserved), so the class and the
    // markup symbol both spell it `Switch`.
    ['Switch',                  '@pragmatic-lab/mural/framework/toggles/switch.js'],
    ['Checkbox',                '@pragmatic-lab/mural/framework/toggles/checkbox.js'],
    ['RadioButton',             '@pragmatic-lab/mural/framework/toggles/radio-button.js'],
    ['RadioButtonGroup',        '@pragmatic-lab/mural/framework/toggles/radio-button-group.js'],
    ['RadioButtonItem',         '@pragmatic-lab/mural/framework/toggles/radio-button-group.js'],
    ['Chip',                    '@pragmatic-lab/mural/framework/markers/chip.js'],
    ['ChipVariant',             '@pragmatic-lab/mural/framework/markers/chip.js'],
    ['SegmentedButton',         '@pragmatic-lab/mural/framework/button-groups/segmented-button.js'],
    ['SegmentedItem',           '@pragmatic-lab/mural/framework/button-groups/segmented-button.js'],
    ['SegmentedPosition',       '@pragmatic-lab/mural/framework/button-groups/segmented-button.js'],
    ['ButtonGroup',             '@pragmatic-lab/mural/framework/button-groups/button-group.js'],
    ['SplitButton',             '@pragmatic-lab/mural/framework/button-groups/split-button.js'],
    ['FabMenu',                 '@pragmatic-lab/mural/framework/buttons/fab-menu.js'],
    ['TabControl',              '@pragmatic-lab/mural/framework/tabs/tabs.js'],
    ['TabItem',                 '@pragmatic-lab/mural/framework/tabs/tabs.js'],
    ['SearchBar',               '@pragmatic-lab/mural/framework/search-bar/search-bar.js'],
    ['Divider',                 '@pragmatic-lab/mural/framework/markers/divider.js'],
    ['Badge',                   '@pragmatic-lab/mural/framework/markers/badge.js'],
    ['BadgeVariant',            '@pragmatic-lab/mural/framework/markers/badge.js'],
    ['Tooltip',                 '@pragmatic-lab/mural/framework/tooltips/tooltip.js'],
    ['TooltipPopupHost',        '@pragmatic-lab/mural/framework/tooltips/tooltip-service.js'],
    ['ToolTipService',          '@pragmatic-lab/mural/framework/tooltips/tooltip-service.js'],
    ['PlacementMode',           '@pragmatic-lab/mural/framework/tooltips/tooltip-service.js'],
    // Commands — referenced in markup as DataTemplate DataType targets
    // (the default rich-tooltip template dispatches on CommandBase).
    ['CommandBase',             '@pragmatic-lab/mural/runtime'],
    ['RelayCommand',            '@pragmatic-lab/mural/runtime'],
    ['RoutedCommand',           '@pragmatic-lab/mural/framework/commands/routed-command.js'],
    // Input bindings — `Visual.InputBindings { KeyBinding[…] }` /
    // `CommandBindings { CommandBinding[…] }` markup authoring.
    ['KeyBinding',              '@pragmatic-lab/mural/framework/commands/input-binding.js'],
    ['MouseBinding',           '@pragmatic-lab/mural/framework/commands/input-binding.js'],
    ['MouseAction',            '@pragmatic-lab/mural/framework/commands/input-binding.js'],
    ['CommandBinding',         '@pragmatic-lab/mural/framework/commands/command-binding.js'],
    // WPF-parity input enums (Key / ModifierKeys / MouseButton) re-exported
    // from the runtime barrel; usable in KeyBinding[Key=…, Modifiers=…]
    // and in `when (…)` triggers.
    ['Key',                    '@pragmatic-lab/mural/runtime'],
    ['ModifierKeys',           '@pragmatic-lab/mural/runtime'],
    ['MouseButton',            '@pragmatic-lab/mural/runtime'],
    // Focus scopes + keyboard navigation — attached properties usable in
    // markup (FocusManager.IsFocusScope=true, KeyboardNavigation.TabNavigation=Cycle).
    ['FocusManager',           '@pragmatic-lab/mural/runtime'],
    ['KeyboardNavigation',     '@pragmatic-lab/mural/runtime'],
    ['KeyboardNavigationMode', '@pragmatic-lab/mural/runtime'],
    ['ProgressIndicator',       '@pragmatic-lab/mural/framework/notifications/progress-indicator.js'],
    ['ProgressIndicatorVariant','@pragmatic-lab/mural/framework/notifications/progress-indicator.js'],
    ['LoadingIndicator',        '@pragmatic-lab/mural/framework/notifications/loading-indicator.js'],
    ['LoadingIndicatorVariant', '@pragmatic-lab/mural/framework/notifications/loading-indicator.js'],
    ['DatePicker',              '@pragmatic-lab/mural/framework/pickers/date-picker.js'],
    ['TimePicker',              '@pragmatic-lab/mural/framework/pickers/time-picker.js'],
    ['Carousel',                '@pragmatic-lab/mural/framework/carousel/carousel.js'],
    ['Banner',                  '@pragmatic-lab/mural/framework/notifications/banner.js'],
    ['Snackbar',                '@pragmatic-lab/mural/framework/notifications/snackbar.js'],
    ['Dialog',                  '@pragmatic-lab/mural/framework/surfaces/dialog.js'],
    ['BottomSheet',             '@pragmatic-lab/mural/framework/surfaces/bottom-sheet.js'],
    ['ToolBar',                 '@pragmatic-lab/mural/framework/surface.js'],
    ['ToolBarButton',           '@pragmatic-lab/mural/framework/surface.js'],
    ['ToolBarToggleButton',     '@pragmatic-lab/mural/framework/surface.js'],
    ['ToolBarSplitButton',      '@pragmatic-lab/mural/framework/surface.js'],
    ['ToolBarSeparator',        '@pragmatic-lab/mural/framework/surface.js'],
    ['ToolBarPosition',         '@pragmatic-lab/mural/framework/surface.js'],
    ['ToolBarPopupHost',        '@pragmatic-lab/mural/framework/surface.js'],
    ['ToolBarOverflowItemsControl', '@pragmatic-lab/mural/framework/surface.js'],
    ['MenuStrip',               '@pragmatic-lab/mural/framework/surface.js'],
    ['MenuButton',              '@pragmatic-lab/mural/framework/surface.js'],
    ['MenuItem',                '@pragmatic-lab/mural/framework/surface.js'],
    ['MenuSeparator',           '@pragmatic-lab/mural/framework/surface.js'],
    ['ContextMenu',             '@pragmatic-lab/mural/framework/surface.js'],
    ['ContextMenuService',      '@pragmatic-lab/mural/framework/surface.js'],
    // Popup host shared by MenuButton + ContextMenu; referenced by the
    // framework.resources.mu default ControlTemplates.
    ['MenuPopupHost',           '@pragmatic-lab/mural/framework/surface.js'],
    ['StatusBar',               '@pragmatic-lab/mural/framework/surface.js'],
    ['StatusBarItem',           '@pragmatic-lab/mural/framework/surface.js'],
    ['StatusBarSeparator',      '@pragmatic-lab/mural/framework/surface.js'],
    ['ThemeSelector',           '@pragmatic-lab/mural/framework/surface.js'],
    // ── Ribbon family (5.11.3) ──────────────────────────────────────
    ['Ribbon',                  '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonTab',               '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonTabHeader',         '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonContextualGroup',   '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonGroup',             '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonSmallButtonColumn', '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonButton',            '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonToggleButton',      '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonButtonSize',        '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonDropDownButton',    '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonSplitButton',       '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonGallery',           '@pragmatic-lab/mural/framework/surface.js'],
    ['RibbonGalleryPopupList',  '@pragmatic-lab/mural/framework/surface.js'],

    // ── Framework layer ─────────────────────────────────────────────
    // Templated-control base class. Sits between runtime's `Visual`
    // and the concrete control surface (ContentControl, ItemsControl,
    // MenuButton, ContextMenu, Drawer). `.mu` files reach for it when
    // declaring `[TargetType=Control]` style entries or test fixtures
    // that want to talk about templated controls polymorphically.
    ['Control',                 '@pragmatic-lab/mural/framework'],

    // ── visual-engine ───────────────────────────────────────────────
    ['SolidColorBrush',     '@pragmatic-lab/mural/visual-engine'],
    ['LinearGradientBrush', '@pragmatic-lab/mural/visual-engine'],
    ['RadialGradientBrush', '@pragmatic-lab/mural/visual-engine'],
    ['ImageBrush',          '@pragmatic-lab/mural/visual-engine'],
    ['PatternBrush',        '@pragmatic-lab/mural/visual-engine'],
    ['PatternKind',         '@pragmatic-lab/mural/visual-engine'],
    ['GradientStop',        '@pragmatic-lab/mural/visual-engine'],
    ['Brush',               '@pragmatic-lab/mural/visual-engine'],
    ['Pen',                 '@pragmatic-lab/mural/visual-engine'],
    ['FontWeight',          '@pragmatic-lab/mural/visual-engine'],
    ['FontStyle',           '@pragmatic-lab/mural/visual-engine'],
    ['TextDecorations',     '@pragmatic-lab/mural/visual-engine'],
    ['FontFamily',          '@pragmatic-lab/mural/visual-engine'],
    ['FontManager',         '@pragmatic-lab/mural/visual-engine'],
    ['FontSourceKind',      '@pragmatic-lab/mural/visual-engine'],
    ['Stretch',             '@pragmatic-lab/mural/visual-engine'],
    ['AlignmentX',          '@pragmatic-lab/mural/visual-engine'],
    ['AlignmentY',          '@pragmatic-lab/mural/visual-engine'],
    ['GradientSpreadMethod', '@pragmatic-lab/mural/visual-engine'],
    ['LineCap',             '@pragmatic-lab/mural/visual-engine'],
    ['LineJoin',            '@pragmatic-lab/mural/visual-engine'],
    ['FillRule',            '@pragmatic-lab/mural/visual-engine'],
    ['SweepDirection',      '@pragmatic-lab/mural/visual-engine'],
    ['DropShadowEffect',         '@pragmatic-lab/mural/visual-engine'],
    ['MaterialElevationEffect',  '@pragmatic-lab/mural/visual-engine'],

    // ── runtime/animation (motion easing curve palette) ────────────────
    ['Easings',             '@pragmatic-lab/mural/runtime'],
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
    ['TextDecorations',       new Set(['None', 'Underline', 'Strikethrough', 'Overline'])],
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
    ['TextAlignment',         new Set(['Left', 'Center', 'Right', 'Justify'])],
    ['MeasurementFidelity',   new Set(['Fast', 'Exact'])],
    ['ListMarkerStyle',       new Set(['None', 'Disc', 'Circle', 'Square', 'Decimal', 'LowerLatin', 'UpperLatin', 'LowerRoman', 'UpperRoman'])],
    ['ClickMode',             new Set(['Release', 'Press', 'Hover'])],
    ['ButtonVariant',         new Set(['Filled', 'Elevated', 'Tonal', 'Outlined', 'Text', 'Standard'])],
    ['ColorPickerVariant',    new Set(['HSV', 'RGB'])],
    ['BrushPickerVariant',    new Set(['Solid', 'Linear', 'Radial', 'Pattern'])],
    ['FillEditorVariant',     new Set(['None', 'Solid', 'Linear', 'Radial', 'Pattern', 'Picture'])],
    ['TextBoxVariant',        new Set(['Filled', 'Outlined', 'Plain'])],
    ['ChipVariant',           new Set(['Assist', 'Filter', 'Input', 'Suggestion'])],
    ['SegmentedPosition',     new Set(['Single', 'Start', 'Middle', 'End'])],
    ['BadgeVariant',          new Set(['Dot', 'Numeric'])],
    ['ProgressIndicatorVariant', new Set(['Linear', 'Circular'])],
    ['LoadingIndicatorVariant', new Set(['ActiveIndicator', 'Contained'])],
    ['FabSize',               new Set(['Small', 'Default', 'Large', 'Extended'])],
    ['CardVariant',           new Set(['Filled', 'Elevated', 'Outlined'])],
    ['TopAppBarVariant',      new Set(['Small', 'CenterAligned', 'Medium', 'Large'])],
    ['Orientation',           new Set(['Vertical', 'Horizontal'])],
    ['VisualContext',         new Set(['Tile', 'Figure'])],
    ['SelectionMode',         new Set(['Single', 'Multiple', 'Extended'])],
    ['MarqueeBoundsPolicy',   new Set(['Intersect', 'Contained'])],
    ['Dock',                  new Set(['Left', 'Top', 'Right', 'Bottom'])],
    ['DrawerVariant',         new Set(['Permanent', 'Persistent', 'Temporary'])],
    ['SideSheetVariant',      new Set(['Standard', 'Modal'])],
    ['ToolBarPosition',       new Set(['None', 'Only', 'First', 'Middle', 'Last'])],
    ['RibbonButtonSize',      new Set(['Large', 'Medium', 'Small'])],
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
    // Setting value shapes — a module's `.settings:` block authors
    // `SettingDefinition [ Kind = Boolean … ]`. Resolved via PROPERTY_TO_ENUM
    // under the `Kind` property (below); its members are disjoint from the other
    // `Kind` enums (ChipVariant / PatternKind), so there's no collision.
    ['SettingKind',           new Set(['Boolean', 'Number', 'String', 'Choice', 'Color', 'FilePath'])],
    // Command-group presentation — a module's `.commands:` block authors
    // `CommandDefinition [ Presentation = SplitMenu … ]` on a group's leader.
    // Resolved via PROPERTY_TO_ENUM under the `Presentation` property.
    ['CommandGroupPresentation', new Set(['Flat', 'SplitMenu', 'SplitGrid', 'Toggles'])],
    // Shell-control host region — `ShellControlDefinition [ Region = StatusBar ]`.
    ['ShellRegion', new Set(['Toolbar', 'StatusBar', 'EditorActions'])],
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
    // Exposed for the dotted form `TextAlignment.Justify` / `TextPlacement.Center`
    // as `Is(...)` converter-factory arguments in the diagram alignment
    // toolbars (also in ENUM_MEMBERS for TextAlignment so `TextAlignment=Left`
    // property assignment keeps working).
    ['TextAlignment', new Set(['Left', 'Center', 'Right', 'Justify'])],
    ['TextPlacement', new Set([
        'Center', 'Top', 'Bottom', 'Left', 'Right',
        'TopLeft', 'TopRight', 'BottomLeft', 'BottomRight',
        'Above', 'Below', 'LeftOf', 'RightOf',
    ])],
    // ToolboxVisualPresenter.Context = VisualContext.Tile / .Figure. The `Context`
    // property name is overloaded (a class-ref `Context = DiagramEditingContext`
    // also exists), so the bare-member PROPERTY_TO_ENUM path can't be used — author
    // the qualified `VisualContext.Tile` form, resolved here.
    ['VisualContext', new Set(['Tile', 'Figure'])],
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
    ['Variant',  ['ButtonVariant', 'DrawerVariant', 'SideSheetVariant', 'CardVariant', 'TopAppBarVariant', 'TextBoxVariant', 'BadgeVariant', 'ProgressIndicatorVariant', 'LoadingIndicatorVariant', 'ColorPickerVariant', 'BrushPickerVariant', 'FillEditorVariant']],
    ['Kind',     ['ChipVariant', 'PatternKind', 'SettingKind']],
    ['PatternKind', ['PatternKind']],
    ['LineCap',  ['LineCap']],
    ['LineJoin', ['LineJoin']],
    ['EffectiveVariant', ['TopAppBarVariant']],
    ['Size',     ['FabSize', 'RibbonButtonSize']],
    ['Anchor',   ['Dock']],
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
    // List.MarkerStyle → ListMarkerStyle (property name ≠ enum class name).
    ['MarkerStyle', ['ListMarkerStyle']],
    // CommandDefinition.Presentation → CommandGroupPresentation.
    ['Presentation', ['CommandGroupPresentation']],
    // ShellControlDefinition.Region → ShellRegion.
    ['Region', ['ShellRegion']],
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
    ['PanelButton',             { name: 'Content',  kind: 'object' }],
    ['IconButtonToggle',        { name: 'Content',  kind: 'object' }],
    ['FloatingActionButton',    { name: 'Content',  kind: 'object' }],
    ['Card',                    { name: 'Content',  kind: 'object' }],
    ['SideSheet',               { name: 'Content',  kind: 'object' }],
    ['TopAppBar',               { name: 'Actions',  kind: 'list'   }],
    ['BottomAppBar',            { name: 'Actions',  kind: 'list'   }],
    ['NavigationItem',          { name: 'Content',  kind: 'object' }],
    ['NavigationRail',          { name: 'Items',    kind: 'list'   }],
    ['NavigationBar',           { name: 'Items',    kind: 'list'   }],
    // EditorShell / ViewerShell take no body children — they are
    // services-driven (content flows through the modules composed on the
    // Application and the shell template's `$service(…)` bindings), so they
    // declare no content slot. Their bodies carry only `.services:` blocks.
    // ShellModule { Capability … } — declarative capabilities route through
    // ShellModule.AddChild → Capabilities.Add (the `list` slot emits AddChild).
    // A Capability takes no content child — it names its content SERVICE via the
    // `ServiceKey` attribute (a service class ref), so it's attribute-only.
    ['ShellModule',             { name: 'Capabilities', kind: 'list'   }],
    ['TabControl',              { name: 'Items',    kind: 'list'   }],
    ['TabItem',                 { name: 'Content',  kind: 'object' }],
    ['Chip',                    { name: 'Content',  kind: 'object' }],
    // TextBlock is an inline flow-content host: its brace body is mixed
    // inline content — quoted strings → Run, bare idents → inline elements
    // (Bold / Italic / …) — lowered to `.Inlines.Add(…)`. Text must be
    // QUOTED (mural's disambiguator in place of XAML `<>` tags). Plain
    // `TextBlock [Text="…"]` (attribute) is unaffected and uses the
    // Text-only fast path.
    ['TextBlock',               { name: 'Inlines',  kind: 'list'   }],
    // Inline flow-content hosts — mixed bodies of text chunks + nested
    // Span/Bold/Italic/Underline/Hyperlink.
    ['Span',                    { name: 'Inlines',  kind: 'list'   }],
    ['Bold',                    { name: 'Inlines',  kind: 'list'   }],
    ['Italic',                  { name: 'Inlines',  kind: 'list'   }],
    ['Underline',               { name: 'Inlines',  kind: 'list'   }],
    ['Hyperlink',               { name: 'Inlines',  kind: 'list'   }],
    // Run is a text leaf; `Run { "text" }` sets Text via the string body.
    ['Run',                     { name: 'Text',     kind: 'string' }],
    // InlineUIContainer embeds one Visual: `InlineUIContainer { Btn[…] }`.
    ['InlineUIContainer',       { name: 'Child',    kind: 'object' }],
    // Block flow-content model. RichText hosts take a single FlowDocument
    // (object slot); FlowDocument / ListItem hold Blocks (list); Paragraph
    // is an inline host (Inlines list — text chunks allowed); List holds
    // ListItems (list). Text directly in a block host (FlowDocument / List /
    // ListItem) is a compile error — text must live inside a Paragraph.
    ['RichTextBlock',           { name: 'Document',  kind: 'object' }],
    ['RichTextBox',             { name: 'Document',  kind: 'object' }],
    ['FlowDocument',            { name: 'Blocks',    kind: 'list'   }],
    ['Paragraph',               { name: 'Inlines',   kind: 'list'   }],
    ['List',                    { name: 'ListItems', kind: 'list'   }],
    ['ListItem',                { name: 'Blocks',    kind: 'list'   }],
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
    ['RadioButtonGroup',        { name: 'Items',    kind: 'list'   }],
    ['RadioButtonItem',         { name: 'Content',  kind: 'object' }],
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

    // ── Surfaces / notifications ContentControls ────────────────────
    // Each is a ContentControl whose brace body fills its Content slot
    // (same shape as Card / Drawer / Dialog). Banner / BottomSheet /
    // Snackbar carry their message / body payload here; the trailing
    // Leading / Actions slots stay attribute-driven (Visual DPs).
    ['Banner',                  { name: 'Content',  kind: 'object' }],
    ['BottomSheet',             { name: 'Content',  kind: 'object' }],
    ['Snackbar',                { name: 'Content',  kind: 'object' }],
    ['Dialog',                  { name: 'Content',  kind: 'object' }],

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
    ['ToolBarSplitButton',      { name: 'Items',    kind: 'list'   }],
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

    // ── Ribbon family (5.11.3) ──────────────────────────────────────
    // Ribbon's default children are stable RibbonTabs (list → AddChild →
    // Tabs); contextual groups + QAT invokers are authored via
    // property-element `ContextualGroups { … }` / `QuickAccessItems { … }`
    // blocks (recognised in compiler.ts). RibbonContextualGroup's default
    // children are its contextual RibbonTabs (list → AddChild → Tabs).
    ['Ribbon',                  { name: 'Tabs',     kind: 'list'   }],
    ['RibbonTab',               { name: 'Items',    kind: 'list'   }],
    ['RibbonContextualGroup',   { name: 'Tabs',     kind: 'list'   }],
    ['RibbonGroup',             { name: 'Items',    kind: 'list'   }],
    ['RibbonSmallButtonColumn', { name: 'Children', kind: 'list'   }],
    ['RibbonButton',            { name: 'Content',  kind: 'object' }],
    ['RibbonToggleButton',      { name: 'Content',  kind: 'object' }],
    ['RibbonDropDownButton',    { name: 'Items',    kind: 'list'   }],
    ['RibbonSplitButton',       { name: 'Items',    kind: 'list'   }],
    ['RibbonGallery',           { name: 'Items',    kind: 'list'   }],
    // RibbonTabHeader: Content set by the Ribbon; RibbonGalleryPopupList:
    // populated via ItemsSource — neither takes a markup body.
]);
