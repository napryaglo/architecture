// Barrel for the framework layer — types that sit between the runtime
// primitives (Visual, Model, Style, Binding, …) and the concrete
// control library. Holds:
//
//   * `Control` — the WPF-parity templated-control base.
//   * `./commands/` — RoutedCommand / CommandBinding / CommandManager /
//     InputBinding / ICommandSource / ApplicationCommands etc.
//   * (Forthcoming as `mv` proceeds) Menu, ToolBar, Diagram, list
//     controls — promoted from the basic primitives layer.

export { Control } from './control.js';

// ── Templated-control bases + standalone controls ───────────────────
export { ContentControl } from './content-control.js';
export {
    ItemsControl,
    type GroupStyleSelector,
    type ItemContainerStyleSelector,
    type ItemTemplateSelector,
} from './items-control.js';
export {
    Button,
    ButtonVariant,
    ClickMode,
    type ClickHandler,
} from './button.js';
export { IconButton } from './icon-button.js';
export { IconButtonToggle } from './icon-button-toggle.js';
export { FloatingActionButton, FabSize } from './fab.js';
export { Card, CardVariant } from './card.js';
export {
    ColorPicker,
    ColorPickerVariant,
    MATERIAL_PALETTE,
    hsvToRgb,
    rgbToHsv,
} from './color-picker.js';
export { BrushPicker, BrushPickerVariant } from './brush-picker.js';
export { PenEditor } from './pen-editor.js';
export { FillEditor, FillEditorVariant } from './fill-editor.js';
export { ShapeFormatControl } from './shape-format-control.js';
export { TopAppBar, TopAppBarVariant } from './top-app-bar/top-app-bar.js';
export { NavigationItem } from './navigation/navigation-item.js';
export { NavigationRail } from './navigation/navigation-rail.js';
export { NavigationBar }  from './navigation/navigation-bar.js';
export { ToggleButton } from './toggle-button.js';
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
export { FabMenu } from './fab-menu.js';
export { TabControl, TabItem } from './tabs/tabs.js';
export { SearchBar } from './search-bar.js';
export { Divider } from './markers/divider.js';
export { Badge, BadgeVariant } from './markers/badge.js';
export { Tooltip } from './tooltips/tooltip.js';
export {
    PlacementMode,
    ToolTipService,
    TooltipPopupHost,
} from './tooltips/tooltip-service.js';
export { ProgressIndicator, ProgressIndicatorVariant } from './notifications/progress-indicator.js';
export { Banner } from './notifications/banner.js';
export { Snackbar } from './notifications/snackbar.js';
export { Dialog } from './dialog.js';
export { BottomSheet } from './bottom-sheet.js';
export { attachTooltip, showSnackbar, showDialog } from './overlay-helpers.js';
export { Drawer, DrawerVariant, ScrimSurface, TemporaryOverlayHost } from './drawer.js';
export { ScrollViewer, ScrollViewerLayout } from './scroll-viewer.js';
export { GroupItem } from './group-item.js';

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
    MouseGesture,
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
    type ItemDroppedArgs,
    type ItemDroppedListener,
} from './diagram/diagram.js';
export { Figure } from './diagram/figure.js';
export { Group } from './diagram/group.js';
