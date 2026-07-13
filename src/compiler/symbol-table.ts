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
    ['Application',         'mural/runtime'],
    ['ServiceProvider',     'mural/runtime'],
    ['Visual',              'mural/runtime'],
    ['Single',              'mural/runtime'],
    ['Panel',               'mural/runtime'],
    ['ResourceDictionary',  'mural/runtime'],
    ['Style',               'mural/runtime'],
    ['Setter',              'mural/runtime'],
    ['SetterFactory',       'mural/runtime'],
    ['PropertyTrigger',     'mural/runtime'],
    ['TriggerUnset',        'mural/runtime'],
    ['TriggerSet',          'mural/runtime'],
    ['EventTrigger',           'mural/runtime'],
    ['BeginStoryboardAction',  'mural/runtime'],
    ['InvokeCommandAction',    'mural/runtime'],
    ['StopStoryboardAction',   'mural/runtime'],
    ['PauseStoryboardAction',  'mural/runtime'],
    ['ResumeStoryboardAction', 'mural/runtime'],
    ['AttachBehaviorAction',   'mural/runtime'],
    ['DetachBehaviorAction',   'mural/runtime'],
    ['Storyboard',             'mural/runtime'],
    ['DoubleAnimation',        'mural/runtime'],
    ['ColorAnimation',         'mural/runtime'],
    ['ThicknessAnimation',     'mural/runtime'],
    ['Binding',             'mural/runtime'],
    ['BindingMode',         'mural/runtime'],
    ['DynamicResource',     'mural/runtime'],
    ['DataContextBinding',  'mural/runtime'],
    ['ElementNameBinding',  'mural/runtime'],
    ['ServiceBinding',      'mural/runtime'],
    ['SelfBinding',         'mural/runtime'],
    ['composeConverters',   'mural/runtime'],
    // Built-in color modifiers — converter factories usable on the `<<`
    // pipe (`#0d47a1 << Lighten(0.5)`). User-defined modifiers follow the
    // same shape and are pulled in with a `.mu` import clause instead.
    ['Lighten',             'mural/runtime'],
    ['Darken',              'mural/runtime'],
    ['Mix',                 'mural/runtime'],
    ['Saturate',            'mural/runtime'],
    ['Desaturate',          'mural/runtime'],
    ['Alpha',               'mural/runtime'],
    // General value-reflection converter factory for `$path << Is(x)`:
    // convert → `value === x`, convertBack → `x`. Drives a ToggleButton's
    // IsChecked from an enum-valued binding (radio-style selection where
    // clicking always selects x, so clicking the active one is a no-op).
    ['Is',                  'mural/runtime'],
    // Boolean → Visibility converter factory for `Visibility = $path <<
    // ToVisibility()`: truthy → Visible, falsy → Collapsed (or the passed
    // Visibility). Collapses a region reactively off a bool DP.
    ['ToVisibility',        'mural/runtime'],
    ['MultiBinding',        'mural/runtime'],
    ['TemplateBinding',     'mural/runtime'],
    ['MultiTrigger',        'mural/runtime'],
    ['DataTrigger',         'mural/runtime'],
    ['MultiDataTrigger',    'mural/runtime'],
    ['HorizontalAlignment', 'mural/runtime'],
    ['VerticalAlignment',   'mural/runtime'],
    ['Visibility',          'mural/runtime'],
    ['Point',               'mural/runtime'],
    ['Size',                'mural/runtime'],
    ['Rect',                'mural/runtime'],
    ['Color',               'mural/runtime'],
    ['Matrix',              'mural/runtime'],
    ['Thickness',           'mural/runtime'],
    ['CornerRadius',        'mural/runtime'],
    // Theme engine — emitted by `theme` / `scheme` top-level forms.
    ['defineScheme',        'mural/runtime'],
    ['defineTheme',         'mural/runtime'],
    ['Scheme',              'mural/runtime'],
    ['Theme',               'mural/runtime'],
    ['ThemeManager',        'mural/runtime'],
    ['Application',         'mural/runtime'],
    // Adaptive context — inherited DPs on Visual written by ThemeManager
    // / MediaWatcher; templates trigger on these via the standard `when`
    // syntax (`when (Density = Compact) { … }`).
    ['Density',             'mural/runtime'],
    ['ViewportClass',       'mural/runtime'],
    ['Pointer',             'mural/runtime'],
    ['PrefersContrast',     'mural/runtime'],
    ['PreferredScheme',     'mural/runtime'],
    ['DataObject',          'mural/runtime'],
    ['DragDropEffects',     'mural/runtime'],
    ['DragDrop',            'mural/runtime'],

    // ── basic controls ──────────────────────────────────────────────
    ['Border',                  'mural/basic'],
    ['Button',                  'mural/framework/buttons/button.js'],
    ['IconButton',              'mural/framework/buttons/icon-button.js'],
    ['IconButtonToggle',        'mural/framework/buttons/icon-button-toggle.js'],
    ['FloatingActionButton',    'mural/framework/buttons/fab.js'],
    ['FabSize',                 'mural/framework/buttons/fab.js'],
    ['Card',                    'mural/framework/surfaces/card.js'],
    ['CardVariant',             'mural/framework/surfaces/card.js'],
    ['TopAppBar',               'mural/framework/top-app-bar/top-app-bar.js'],
    ['TopAppBarVariant',        'mural/framework/top-app-bar/top-app-bar.js'],
    ['BottomAppBar',            'mural/framework/bottom-app-bar/bottom-app-bar.js'],
    ['NavigationItem',          'mural/framework/navigation/navigation-item.js'],
    ['NavigationRail',          'mural/framework/navigation/navigation-rail.js'],
    ['NavigationBar',           'mural/framework/navigation/navigation-bar.js'],
    ['ShellBase',               'mural/framework/shell/shell.js'],
    ['EditorShell',             'mural/framework/shell/editor-shell.js'],
    ['ViewerShell',             'mural/framework/shell/viewer-shell.js'],
    ['ShellSideContentPane',    'mural/framework/shell/shell-side-content-pane.js'],
    ['ShellModule',             'mural/framework/shell/module.js'],
    ['Capability',              'mural/framework/shell/module.js'],
    ['RailAction',              'mural/framework/shell/rail-action.js'],
    ['SettingDefinition',       'mural/framework/shell/settings/setting-definition.js'],
    ['SettingKind',             'mural/framework/shell/settings/setting-definition.js'],
    ['DocumentDefinition',      'mural/framework/shell/documents/document-definition.js'],
    ['DocumentTypeRegistry',    'mural/framework/shell/documents/document-type-registry.js'],
    ['CommandDefinition',       'mural/framework/shell/commands/command-definition.js'],
    ['CommandGroupPresentation', 'mural/framework/shell/commands/command-definition.js'],
    ['CommandRegistry',         'mural/framework/shell/commands/command-registry.js'],
    ['CommandViewModel',        'mural/framework/shell/commands/command-view-model.js'],
    ['CommandToggleViewModel',  'mural/framework/shell/commands/command-view-model.js'],
    ['ShellControlDefinition',  'mural/framework/shell/commands/shell-control-definition.js'],
    ['ShellRegion',             'mural/framework/shell/commands/shell-control-definition.js'],
    ['ToolbarFlatGroup',        'mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarSeparatorItem',    'mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarSplitMenuGroup',   'mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarSplitGridGroup',   'mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarToggleGroup',      'mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ShellControlViewModel',   'mural/framework/shell/commands/toolbar-group-view-model.js'],
    ['ToolbarService',          'mural/framework/shell/commands/toolbar-service.js'],
    ['NavigationService',       'mural/framework/shell/services/navigation-service.js'],
    ['InspectorService',        'mural/framework/shell/services/inspector-service.js'],
    ['DialogService',           'mural/framework/shell/services/dialog-service.js'],
    ['InspectorPanel',          'mural/framework/shell/inspector/inspector-panel.js'],
    ['InspectorStack',          'mural/framework/shell/inspector/inspector-stack.js'],
    ['StatusService',           'mural/framework/shell/services/status-service.js'],
    ['ContentHostService',      'mural/framework/shell/services/content-host-service.js'],
    ['DocumentsContentHostService', 'mural/framework/shell/services/documents-content-host-service.js'],
    ['DocumentSelectorService', 'mural/framework/shell/services/document-selector-service.js'],
    ['ClickMode',               'mural/framework/buttons/button.js'],
    ['ButtonVariant',           'mural/framework/buttons/button.js'],
    ['TextBlock',               'mural/basic'],
    ['Run',                     'mural/basic'],
    ['Span',                    'mural/basic'],
    ['Bold',                    'mural/basic'],
    ['Italic',                  'mural/basic'],
    ['Underline',               'mural/basic'],
    ['LineBreak',               'mural/basic'],
    ['Hyperlink',               'mural/basic'],
    ['InlineUIContainer',       'mural/basic'],
    // Block flow-content model (FlowDocument analog) + its hosts.
    ['FlowDocument',            'mural/basic'],
    ['Paragraph',               'mural/basic'],
    ['List',                    'mural/basic'],
    ['ListItem',                'mural/basic'],
    ['ListMarkerStyle',         'mural/basic'],
    ['RichTextBlock',           'mural/basic'],
    ['RichTextBox',             'mural/basic'],
    ['Canvas',                  'mural/basic'],
    ['PaginatedCanvas',         'mural/basic'],
    ['Ellipse',                 'mural/basic'],
    ['Shape',                   'mural/basic'],
    ['Path',                    'mural/basic'],
    ['Image',                   'mural/basic'],
    ['Icon',                    'mural/basic'],
    ['Line',                    'mural/basic'],
    ['Rectangle',               'mural/basic'],
    ['ComboBox',                'mural/framework/list/combo-box.js'],
    ['DockPanel',               'mural/basic'],
    ['Dock',                    'mural/basic'],
    ['Drawer',                  'mural/framework/surfaces/drawer.js'],
    ['DrawerVariant',           'mural/framework/surfaces/drawer.js'],
    ['SideSheet',               'mural/framework/surfaces/side-sheet.js'],
    ['SideSheetVariant',        'mural/framework/surfaces/side-sheet.js'],
    ['TreeView',                'mural/framework/list/tree-view.js'],
    ['TreeViewItem',            'mural/framework/list/tree-view.js'],
    ['ListBox',                 'mural/framework/list/list-box.js'],
    ['ListBoxItem',             'mural/framework/list/list-box.js'],
    ['SelectionMode',           'mural/framework/list/list-box.js'],
    ['MarqueeBoundsPolicy',     'mural/framework/list/selector.js'],
    ['TextBox',                 'mural/basic'],
    ['SpinEdit',                'mural/basic'],
    ['Slider',                  'mural/basic'],
    ['SliderSpinEdit',          'mural/basic'],
    ['ColorPicker',             'mural/framework'],
    ['ColorPickerVariant',      'mural/framework'],
    ['FontFamilyPicker',        'mural/framework'],
    ['FontSizePicker',          'mural/framework'],
    ['ColorScheme',             'mural/framework'],
    ['BrushPicker',             'mural/framework'],
    ['BrushPickerVariant',      'mural/framework'],
    ['PenEditor',               'mural/framework'],
    ['FillEditor',              'mural/framework'],
    ['FillEditorVariant',       'mural/framework'],
    ['ShapeFormatControl',      'mural/framework'],
    ['CapOption',               'mural/framework'],
    ['PageView',                'mural/basic'],

    // Runtime types that the emitter may reference even when the
    // consumer's source doesn't name them directly — added on demand
    // by the emit pass.
    ['NameScope',               'mural/runtime'],
    ['PropertyTransition',      'mural/runtime'],
    ['StackPanel',              'mural/basic'],
    ['WrapPanel',               'mural/basic'],
    ['UniformGrid',             'mural/basic'],
    ['Orientation',             'mural/basic'],
    ['ContentControl',          'mural/framework/base/content-control.js'],
    ['ContentPresenter',        'mural/basic'],
    ['Figure',                  'mural/framework/diagram/figure.js'],
    ['ShapeText',               'mural/framework/diagram/shape-text.js'],
    ['Group',                   'mural/framework/diagram/group.js'],
    ['Diagram',                 'mural/framework/diagram/diagram.js'],
    // Connector — markup references it for the `Connector.CapInset`
    // attached property on cap templates. ConnectorCapDataContext is the
    // DataType those cap DataTemplates bind against ($Brush / $Pen).
    ['Connector',               'mural/framework/diagram/connector.js'],
    ['ConnectorCapDataContext', 'mural/framework/diagram/caps/connector-cap-data-context.js'],
    ['ToolboxShape',            'mural/framework/diagram/toolbox-shape.js'],
    ['DiagramDocument',         'mural/framework/diagram/diagram-document.js'],
    ['DiagramStorageKey',       'mural/framework/diagram/diagram-document.js'],
    ['DiagramEditingContext',   'mural/framework/diagram/diagram-command-contexts.js'],
    ['DiagramInspector',        'mural/framework/diagram/diagram-inspector.js'],
    ['Grid',                    'mural/basic'],
    ['GridLength',              'mural/basic'],
    ['ColumnDefinition',        'mural/basic'],
    ['RowDefinition',           'mural/basic'],
    ['ControlTemplate',         'mural/basic'],
    ['DataTemplate',            'mural/basic'],
    ['TargetedSetter',          'mural/basic'],
    ['TemplatePropertyTrigger',  'mural/basic'],
    ['TemplateDataTrigger',      'mural/basic'],
    ['TemplateMultiDataTrigger', 'mural/basic'],
    ['ItemsControl',            'mural/framework/base/items-control.js'],
    ['ListReorderBehavior',     'mural/basic'],
    ['LogBehavior',             'mural/basic'],
    ['Selector',                'mural/framework/list/selector.js'],
    ['ItemContainerGenerator',  'mural/basic'],
    ['ItemsPresenter',          'mural/basic'],
    ['AdornerDecorator',        'mural/basic'],
    ['HierarchicalDataTemplate','mural/basic'],
    ['ItemsPanelTemplate',      'mural/basic'],
    ['CollectionView',          'mural/basic'],
    ['SortDescription',         'mural/basic'],
    ['GroupDescription',        'mural/basic'],
    ['ScrollViewer',            'mural/framework/surfaces/scroll-viewer.js'],
    ['ScrollBar',               'mural/basic'],
    ['Thumb',                   'mural/basic'],
    ['GridSplitter',            'mural/basic'],
    ['Splitter',                'mural/basic'],
    ['VirtualizingPanel',       'mural/basic'],
    ['VirtualizingStackPanel',  'mural/basic'],
    ['VirtualizingWrapPanel',   'mural/basic'],
    ['TextWrapping',            'mural/basic'],
    ['TextAlignment',           'mural/basic'],
    ['TextPlacement',           'mural/framework'],
    ['TextBoxVariant',          'mural/basic'],
    ['Arc',                     'mural/basic'],
    ['Squircle',                'mural/basic'],
    ['Pill',                    'mural/basic'],
    ['Arch',                    'mural/basic'],
    ['Semicircle',              'mural/basic'],
    ['Triangle',                'mural/basic'],
    ['Arrow',                   'mural/basic'],
    ['Fan',                     'mural/basic'],
    ['FanPivot',                'mural/basic'],
    ['Clamshell',               'mural/basic'],
    ['Cookie',                  'mural/basic'],
    ['Diamond',                 'mural/basic'],
    ['Pentagon',                'mural/basic'],
    ['Gem',                     'mural/basic'],
    ['FourSidedCookie',         'mural/basic'],
    ['SixSidedCookie',          'mural/basic'],
    ['SevenSidedCookie',        'mural/basic'],
    ['NineSidedCookie',         'mural/basic'],
    ['TwelveSidedCookie',       'mural/basic'],
    ['Clover',                  'mural/basic'],
    ['FourLeafClover',          'mural/basic'],
    ['EightLeafClover',         'mural/basic'],
    ['Slanted',                 'mural/basic'],
    ['Puffy',                   'mural/basic'],
    ['PuffyDiamond',            'mural/basic'],
    ['PuffyBase',               'mural/basic'],
    ['Heart',                   'mural/basic'],
    ['Bun',                     'mural/basic'],
    ['Ghostish',                'mural/basic'],
    ['PixelArt',                'mural/basic'],
    ['PixelCircle',             'mural/basic'],
    ['PixelTriangle',           'mural/basic'],
    ['PixelSource',             'mural/basic'],
    ['RadialWave',              'mural/basic'],
    ['Sunny',                   'mural/basic'],
    ['VerySunny',               'mural/basic'],
    ['Burst',                   'mural/basic'],
    ['SoftBurst',               'mural/basic'],
    ['Boom',                    'mural/basic'],
    ['SoftBoom',                'mural/basic'],
    ['Flower',                  'mural/basic'],

    // ── Internal helper classes ────────────────────────────────────
    // Layout / behaviour primitives owned by individual controls but
    // exported from their files (and re-exported from the basic
    // barrel) so the controls' bundled `.template.mu` defaults can
    // reference them by name. Registered here as well so the LSP /
    // analyzer accepts them when an in-tree template is opened — the
    // build-control-templates script overrides these entries with
    // direct relative file paths at compile time.
    ['ClickableBorder',         'mural/basic/clickable-border.js'],
    ['ClickAwayScrim',          'mural/basic/click-away-scrim.js'],
    ['SplitRow',                'mural/framework/list/combo-box.js'],
    ['ComboBoxPopupHost',       'mural/framework/list/combo-box.js'],
    ['ComboBoxItem',            'mural/framework/list/combo-box.js'],
    ['ComboBoxItemList',        'mural/framework/list/combo-box.js'],
    ['ScrimSurface',            'mural/framework/surfaces/drawer.js'],
    ['TemporaryOverlayHost',    'mural/framework/surfaces/drawer.js'],
    ['ClickableRow',            'mural/framework/list/tree-view.js'],
    ['ChevronTarget',           'mural/framework/list/tree-view.js'],
    ['CollapsibleStack',        'mural/framework/list/tree-view.js'],
    ['ScrollBarLayout',         'mural/basic'],
    ['ScrollViewerLayout',      'mural/framework/surfaces/scroll-viewer.js'],
    ['ScrollContentPresenter',  'mural/basic'],
    ['SliderLayout',            'mural/basic'],
    ['TextEditorSurface',       'mural/basic'],

    // ── Command-surface controls (5.11) ─────────────────────────────
    // These extend Button / Visual and live in a separate barrel
    // (`./surface.js`) to avoid a TDZ cycle through the main basic
    // barrel during Button's default-style theme cascade.
    ['ToggleButton',            'mural/framework/buttons/toggle-button.js'],
    // M3 Switch — capitalised `Switch` is fine in JS (only the
    // lowercase `switch` keyword is reserved), so the class and the
    // markup symbol both spell it `Switch`.
    ['Switch',                  'mural/framework/toggles/switch.js'],
    ['Checkbox',                'mural/framework/toggles/checkbox.js'],
    ['RadioButton',             'mural/framework/toggles/radio-button.js'],
    ['Chip',                    'mural/framework/markers/chip.js'],
    ['ChipVariant',             'mural/framework/markers/chip.js'],
    ['SegmentedButton',         'mural/framework/button-groups/segmented-button.js'],
    ['SegmentedItem',           'mural/framework/button-groups/segmented-button.js'],
    ['SegmentedPosition',       'mural/framework/button-groups/segmented-button.js'],
    ['ButtonGroup',             'mural/framework/button-groups/button-group.js'],
    ['SplitButton',             'mural/framework/button-groups/split-button.js'],
    ['FabMenu',                 'mural/framework/buttons/fab-menu.js'],
    ['TabControl',              'mural/framework/tabs/tabs.js'],
    ['TabItem',                 'mural/framework/tabs/tabs.js'],
    ['SearchBar',               'mural/framework/search-bar/search-bar.js'],
    ['Divider',                 'mural/framework/markers/divider.js'],
    ['Badge',                   'mural/framework/markers/badge.js'],
    ['BadgeVariant',            'mural/framework/markers/badge.js'],
    ['Tooltip',                 'mural/framework/tooltips/tooltip.js'],
    ['TooltipPopupHost',        'mural/framework/tooltips/tooltip-service.js'],
    ['ToolTipService',          'mural/framework/tooltips/tooltip-service.js'],
    ['PlacementMode',           'mural/framework/tooltips/tooltip-service.js'],
    // Commands — referenced in markup as DataTemplate DataType targets
    // (the default rich-tooltip template dispatches on CommandBase).
    ['CommandBase',             'mural/runtime'],
    ['RelayCommand',            'mural/runtime'],
    ['RoutedCommand',           'mural/framework/commands/routed-command.js'],
    // Input bindings — `Visual.InputBindings { KeyBinding[…] }` /
    // `CommandBindings { CommandBinding[…] }` markup authoring.
    ['KeyBinding',              'mural/framework/commands/input-binding.js'],
    ['MouseBinding',           'mural/framework/commands/input-binding.js'],
    ['MouseAction',            'mural/framework/commands/input-binding.js'],
    ['CommandBinding',         'mural/framework/commands/command-binding.js'],
    // WPF-parity input enums (Key / ModifierKeys / MouseButton) re-exported
    // from the runtime barrel; usable in KeyBinding[Key=…, Modifiers=…]
    // and in `when (…)` triggers.
    ['Key',                    'mural/runtime'],
    ['ModifierKeys',           'mural/runtime'],
    ['MouseButton',            'mural/runtime'],
    // Focus scopes + keyboard navigation — attached properties usable in
    // markup (FocusManager.IsFocusScope=true, KeyboardNavigation.TabNavigation=Cycle).
    ['FocusManager',           'mural/runtime'],
    ['KeyboardNavigation',     'mural/runtime'],
    ['KeyboardNavigationMode', 'mural/runtime'],
    ['ProgressIndicator',       'mural/framework/notifications/progress-indicator.js'],
    ['ProgressIndicatorVariant','mural/framework/notifications/progress-indicator.js'],
    ['LoadingIndicator',        'mural/framework/notifications/loading-indicator.js'],
    ['LoadingIndicatorVariant', 'mural/framework/notifications/loading-indicator.js'],
    ['DatePicker',              'mural/framework/pickers/date-picker.js'],
    ['TimePicker',              'mural/framework/pickers/time-picker.js'],
    ['Carousel',                'mural/framework/carousel/carousel.js'],
    ['Banner',                  'mural/framework/notifications/banner.js'],
    ['Snackbar',                'mural/framework/notifications/snackbar.js'],
    ['Dialog',                  'mural/framework/surfaces/dialog.js'],
    ['BottomSheet',             'mural/framework/surfaces/bottom-sheet.js'],
    ['ToolBar',                 'mural/framework/surface.js'],
    ['ToolBarButton',           'mural/framework/surface.js'],
    ['ToolBarToggleButton',     'mural/framework/surface.js'],
    ['ToolBarSplitButton',      'mural/framework/surface.js'],
    ['ToolBarSeparator',        'mural/framework/surface.js'],
    ['ToolBarPosition',         'mural/framework/surface.js'],
    ['ToolBarPopupHost',        'mural/framework/surface.js'],
    ['ToolBarOverflowItemsControl', 'mural/framework/surface.js'],
    ['MenuStrip',               'mural/framework/surface.js'],
    ['MenuButton',              'mural/framework/surface.js'],
    ['MenuItem',                'mural/framework/surface.js'],
    ['MenuSeparator',           'mural/framework/surface.js'],
    ['ContextMenu',             'mural/framework/surface.js'],
    ['ContextMenuService',      'mural/framework/surface.js'],
    // Popup host shared by MenuButton + ContextMenu; referenced by the
    // framework.resources.mu default ControlTemplates.
    ['MenuPopupHost',           'mural/framework/surface.js'],
    ['StatusBar',               'mural/framework/surface.js'],
    ['StatusBarItem',           'mural/framework/surface.js'],
    ['StatusBarSeparator',      'mural/framework/surface.js'],
    ['ThemeSelector',           'mural/framework/surface.js'],
    // ── Ribbon family (5.11.3) ──────────────────────────────────────
    ['Ribbon',                  'mural/framework/surface.js'],
    ['RibbonTab',               'mural/framework/surface.js'],
    ['RibbonTabHeader',         'mural/framework/surface.js'],
    ['RibbonContextualGroup',   'mural/framework/surface.js'],
    ['RibbonGroup',             'mural/framework/surface.js'],
    ['RibbonSmallButtonColumn', 'mural/framework/surface.js'],
    ['RibbonButton',            'mural/framework/surface.js'],
    ['RibbonToggleButton',      'mural/framework/surface.js'],
    ['RibbonButtonSize',        'mural/framework/surface.js'],
    ['RibbonDropDownButton',    'mural/framework/surface.js'],
    ['RibbonSplitButton',       'mural/framework/surface.js'],
    ['RibbonGallery',           'mural/framework/surface.js'],
    ['RibbonGalleryPopupList',  'mural/framework/surface.js'],

    // ── Framework layer ─────────────────────────────────────────────
    // Templated-control base class. Sits between runtime's `Visual`
    // and the concrete control surface (ContentControl, ItemsControl,
    // MenuButton, ContextMenu, Drawer). `.mu` files reach for it when
    // declaring `[TargetType=Control]` style entries or test fixtures
    // that want to talk about templated controls polymorphically.
    ['Control',                 'mural/framework'],

    // ── visual-engine ───────────────────────────────────────────────
    ['SolidColorBrush',     'mural/visual-engine'],
    ['LinearGradientBrush', 'mural/visual-engine'],
    ['RadialGradientBrush', 'mural/visual-engine'],
    ['ImageBrush',          'mural/visual-engine'],
    ['PatternBrush',        'mural/visual-engine'],
    ['PatternKind',         'mural/visual-engine'],
    ['GradientStop',        'mural/visual-engine'],
    ['Brush',               'mural/visual-engine'],
    ['Pen',                 'mural/visual-engine'],
    ['FontWeight',          'mural/visual-engine'],
    ['FontStyle',           'mural/visual-engine'],
    ['TextDecorations',     'mural/visual-engine'],
    ['FontFamily',          'mural/visual-engine'],
    ['FontManager',         'mural/visual-engine'],
    ['FontSourceKind',      'mural/visual-engine'],
    ['Stretch',             'mural/visual-engine'],
    ['AlignmentX',          'mural/visual-engine'],
    ['AlignmentY',          'mural/visual-engine'],
    ['GradientSpreadMethod', 'mural/visual-engine'],
    ['LineCap',             'mural/visual-engine'],
    ['LineJoin',            'mural/visual-engine'],
    ['FillRule',            'mural/visual-engine'],
    ['SweepDirection',      'mural/visual-engine'],
    ['DropShadowEffect',         'mural/visual-engine'],
    ['MaterialElevationEffect',  'mural/visual-engine'],

    // ── runtime/animation (motion easing curve palette) ────────────────
    ['Easings',             'mural/runtime'],
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
    ['ShellRegion', new Set(['Toolbar', 'StatusBar'])],
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
