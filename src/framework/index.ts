// Barrel for the framework layer — types that sit between the runtime
// primitives (Visual, Model, Style, Binding, …) and the concrete
// control library. Holds:
//
//   * `Control` — the WPF-parity templated-control base.
//   * `./commands/` — RoutedCommand / CommandBinding / CommandManager /
//     InputBinding / ICommandSource / ApplicationCommands etc.
//   * (Forthcoming as `mv` proceeds) Menu, ToolBar, Diagram, list
//     controls — promoted from the basic primitives layer.

export { Control } from './base/control.js';

// ── Templated-control bases + standalone controls ───────────────────
export { ContentControl } from './base/content-control.js';
export { HeaderedContentControl } from './base/headered-content-control.js';
export {
    ItemsControl,
    type GroupStyleSelector,
    type ItemContainerStyleSelector,
    type ItemTemplateSelector,
} from './base/items-control.js';
export { HeaderedItemsControl } from './base/headered-items-control.js';
export {
    Button,
    ButtonVariant,
    ClickMode,
    type ClickHandler,
} from './buttons/button.js';
export { IconButton } from './buttons/icon-button.js';
export { IconButtonToggle } from './buttons/icon-button-toggle.js';
export { FloatingActionButton, FabSize } from './buttons/fab.js';
export { Card, CardVariant } from './surfaces/card.js';
export {
    ColorPicker,
    ColorPickerVariant,
    MATERIAL_PALETTE,
    hsvToRgb,
    rgbToHsv,
} from './formatting/color-picker.js';
export { ColorScheme, type ColorSchemeOptions, OFFICE_COLOR_SCHEMES } from './formatting/color-scheme.js';
export {
    FontFamilyPicker,
    FontSizePicker,
    DEFAULT_FONT_FAMILIES,
    DEFAULT_FONT_SIZES,
} from './formatting/font-pickers.js';
export { BrushPicker, BrushPickerVariant } from './formatting/brush-picker.js';
export { PenEditor } from './formatting/pen-editor.js';
export { FillEditor, FillEditorVariant } from './formatting/fill-editor.js';
export { ShapeFormatControl } from './formatting/shape-format-control.js';
export { CapOption } from './formatting/cap-option.js';
export { TopAppBar, TopAppBarVariant } from './top-app-bar/top-app-bar.js';
export { BottomAppBar } from './bottom-app-bar/bottom-app-bar.js';
export { NavigationItem } from './navigation/navigation-item.js';
export { NavigationRail } from './navigation/navigation-rail.js';
export { NavigationBar }  from './navigation/navigation-bar.js';
export { ShellBase } from './shell/shell.js';
export { ShellModule, Capability } from './shell/module.js';
export { EditorShell } from './shell/editor-shell.js';
export { ViewerShell } from './shell/viewer-shell.js';
export { ShellSideContentPane } from './shell/shell-side-content-pane.js';
export { NavigationService, NavigationDestination } from './shell/services/navigation-service.js';
export { RailAction } from './shell/rail-action.js';
export { InspectorService } from './shell/services/inspector-service.js';
export { Inspector, type IInspector } from './shell/services/inspector.js';
export { InspectorPanel } from './shell/inspector/inspector-panel.js';
export { InspectorStack } from './shell/inspector/inspector-stack.js';
export { StatusService } from './shell/services/status-service.js';
export { ContentHostService } from './shell/services/content-host-service.js';
export { DocumentsContentHostService, type IDocument } from './shell/services/documents-content-host-service.js';
export { DocumentSelectorService } from './shell/services/document-selector-service.js';
export type { IActivatable } from './shell/services/activatable.js';
export { ApplicationSettings, SettingsStoreKey, type ISettingsStore } from './shell/services/application-settings-service.js';
export { SettingDefinition, SettingKind } from './shell/settings/setting-definition.js';
export { DocumentDefinition } from './shell/documents/document-definition.js';
export { DocumentTypeRegistry } from './shell/documents/document-type-registry.js';
export { CommandDefinition } from './shell/commands/command-definition.js';
export { CommandRegistry } from './shell/commands/command-registry.js';
export { CommandViewModel } from './shell/commands/command-view-model.js';
export { ToolbarService } from './shell/commands/toolbar-service.js';
export { type ICommandTarget, isCommandTarget } from './shell/commands/command-target.js';
export { SettingsLauncherService, SettingsContributionKey, type ISettingsContribution } from './shell/settings/settings-launcher.js';
export { Setting } from './shell/settings/setting.js';
export { ToggleButton } from './buttons/toggle-button.js';
export { Switch } from './toggles/switch.js';
export { Checkbox } from './toggles/checkbox.js';
export { RadioButton } from './toggles/radio-button.js';
export { Chip, ChipVariant } from './markers/chip.js';
export {
    SegmentedButton,
    SegmentedItem,
    SegmentedPosition,
} from './button-groups/segmented-button.js';
export { ButtonGroup } from './button-groups/button-group.js';
export { SplitButton } from './button-groups/split-button.js';
export { FabMenu } from './buttons/fab-menu.js';
export { TabControl, TabItem } from './tabs/tabs.js';
export { SearchBar } from './search-bar/search-bar.js';
export { Divider } from './markers/divider.js';
export { Badge, BadgeVariant } from './markers/badge.js';
export { Tooltip } from './tooltips/tooltip.js';
export {
    PlacementMode,
    ToolTipService,
    TooltipPopupHost,
} from './tooltips/tooltip-service.js';
export { ProgressIndicator, ProgressIndicatorVariant } from './notifications/progress-indicator.js';
export { LoadingIndicator, LoadingIndicatorVariant } from './notifications/loading-indicator.js';
export { Banner } from './notifications/banner.js';
export { Snackbar } from './notifications/snackbar.js';
export { Dialog } from './surfaces/dialog.js';
export { BottomSheet } from './surfaces/bottom-sheet.js';
export { attachTooltip, showSnackbar, showDialog } from './overlay-helpers.js';
export { Drawer, DrawerVariant, ScrimSurface, TemporaryOverlayHost } from './surfaces/drawer.js';
export { ScrollViewer, ScrollViewerLayout } from './surfaces/scroll-viewer.js';
export { GroupItem } from './surfaces/group-item.js';

// ── Input management ────────────────────────────────────────────────
export { InputManager } from './input-manager.js';

// ── Commands infrastructure ─────────────────────────────────────────
export {
    RoutedCommand,
    KeyGesture,
    type InputGesture,
} from './commands/routed-command.js';
export {
    CommandBinding,
    ExecutedRoutedEventArgs,
    CanExecuteRoutedEventArgs,
    type CommandBindingOptions,
    type ExecutedRoutedEventHandler,
    type CanExecuteRoutedEventHandler,
} from './commands/command-binding.js';
export { CommandManager } from './commands/command-manager.js';
export {
    InputBinding,
    KeyBinding,
    MouseBinding,
    MouseAction,
} from './commands/input-binding.js';
export {
    CommandSourceHelper,
    type ICommandSource,
} from './commands/command-source.js';
export {
    ApplicationCommands,
    EditingCommands,
    NavigationCommands,
    MediaCommands,
} from './commands/command-library.js';

// ── List controls ───────────────────────────────────────────────────
export {
    Selector,
    MarqueeBoundsPolicy,
    type SelectionChangedListener,
} from './list/selector.js';
export { ComboBox } from './list/combo-box.js';
export { TreeView, TreeViewItem } from './list/tree-view.js';
export { ListBox, ListBoxItem, SelectionMode } from './list/list-box.js';
export { ClickableBorder } from '../basic/clickable-border.js';
export { ClickAwayScrim } from '../basic/click-away-scrim.js';
export {
    SplitRow,
    ComboBoxPopupHost,
    ComboBoxItemList,
} from './list/combo-box.js';
export {
    ClickableRow,
    ChevronTarget,
    CollapsibleStack,
} from './list/tree-view.js';

// ── Diagram ─────────────────────────────────────────────────────────
export {
    Diagram,
    attachCanvasDropBehavior,
    TOOLBOX_NODE_KIND_FORMAT,
    type IDiagramViewHost,
    type ItemDroppedArgs,
    type ItemDroppedListener,
} from './diagram/diagram.js';
export {
    DiagramDocument,
    DiagramStorageKey,
    type DiagramStorage,
} from './diagram/diagram-document.js';
export { DiagramEditingContext, DiagramCommandId } from './diagram/diagram-command-contexts.js';
export { DiagramInspector } from './diagram/diagram-inspector.js';
export { Figure } from './diagram/figure.js';
export { Group } from './diagram/group.js';
export { ToolboxShape, TOOLBOX_PREVIEW_SIZE } from './diagram/toolbox-shape.js';
export {
    SHAPE_CATALOG,
    SHAPE_CATALOG_MAP,
    GeometryCombineMode,
    buildNodeGeometry,
    scaleGeometry,
    translateGeometry,
    normalizeToUnit,
    mergeShapes,
    type ShapeCatalogEntry,
    type NormalizedGeometry,
    type CombinableShape,
} from './diagram/shape-catalog.js';
export {
    attachStandardDiagramMutations,
    type DiagramMutator,
} from './diagram/behaviors/attach-standard-mutations.js';
export { Connector, AnchorClip } from './diagram/connector.js';
export { connectorCapOptions } from './diagram/caps/connector-cap-options.js';
export { ConnectorEndpoint, type ConnectorEndpointInit } from './diagram/connector-endpoint.js';
export { Port, PortSide, PortCoordSpace, PortResolver, type PortInit, type IPortHost } from './diagram/port.js';
export { ConnectorEnd, RoutingMode, type ResolvedAnchor, type RouteSpec, type IRouter, type ResolvedPortSide } from './diagram/routing/router.js';
export {
    ConnectorCreateBehavior,
    attachConnectorCreate,
    type ConnectorCreatedArgs,
    type ConnectorCreatedListener,
} from './diagram/behaviors/connector-create-behavior.js';
export {
    ConnectorEditAdorner,
    attachConnectorEditAdorner,
} from './diagram/behaviors/connector-edit-adorner.js';
export { DiagramLayer, DiagramLayersPanel } from './diagram/diagram-layers-panel.js';
