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
export { TopAppBar, TopAppBarVariant } from './top-app-bar/top-app-bar.js';
export { ToggleButton } from './toggle-button.js';
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
export {
    ClickableBorder,
    ClickAwayScrim,
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
export { Diagram } from './diagram/diagram.js';
export { DiagramNode } from './diagram/diagram-node.js';
