// Barrel re-exports for the control library. Consumers import from here
// rather than the individual control files.
export { Border } from './border.js';
export {
    Button,
    ClickMode,
    type ClickHandler,
} from './button.js';
export { TextBlock, TextWrapping } from './text-block.js';
export { Canvas } from './canvas.js';
export { Ellipse } from './ellipse.js';
export { Line } from './line.js';
export { ComboBox } from './combo-box.js';
export { DockPanel, Dock } from './dock-panel.js';
export { Drawer, DrawerVariant } from './drawer.js';
export { TreeView, TreeViewItem } from './tree-view.js';
export { ListBox, ListBoxItem, SelectionMode } from './list-box.js';
export {
    TextBox,
    TextEditorSurface,
    type ClipboardSink,
} from './text-box.js';
export { SpinEdit } from './spin-edit.js';
export { Slider, SliderLayout } from './slider.js';
export { PageView } from './page-view.js';
export { StackPanel, Orientation } from './stack-panel.js';
export { UniformGrid } from './uniform-grid.js';
export {
    Grid,
    GridLength,
    ColumnDefinition,
    RowDefinition,
    type GridUnitType,
} from './grid.js';
export { ContentControl } from './content-control.js';
export { ContentPresenter } from './content-presenter.js';
export { DiagramNode } from './diagram-node.js';
export { Diagram } from './diagram.js';
export {
    ControlTemplate,
    TemplateBinding,
    type TemplateFactory,
    type TemplateInstance,
} from './control-template.js';
export {
    DataTemplate,
    HierarchicalDataTemplate,
    TargetedSetter,
    TemplateDataTrigger,
    TemplatePropertyTrigger,
    type DataTemplateFactory,
    type HierarchicalChildSelector,
} from './data-template.js';
export {
    ItemsControl,
    type GroupStyleSelector,
    type ItemContainerStyleSelector,
    type ItemTemplateSelector,
} from './items-control.js';
export { ListReorderBehavior } from './list-reorder-behavior.js';
export {
    Selector,
    type SelectionChangedListener,
} from './selector.js';
export { AlternationConverter } from './alternation-converter.js';
export {
    ItemsPanelTemplate,
    type ItemsPanelFactory,
} from './items-panel-template.js';
// CollectionView is imported here for its module-load side effect —
// it self-registers with ItemsControl so ItemsSource assignments
// can construct a view. Explicit re-export gives consumers the
// types they need to drive view-state (Filter, SortDescriptions, …).
export {
    CollectionView,
    CollectionViewGroup,
    SortDescription,
    GroupDescription,
    type SortDirection,
    type FilterPredicate,
    type CurrentChangedListener,
} from './collection-view.js';
export { GroupItem } from './group-item.js';
export { GroupStyle } from './group-style.js';
export {
    GenerationSession,
    GeneratorDirection,
    GeneratorPosition,
    GeneratorStatus,
    ItemContainerGenerator,
    ItemsChangedAction,
    type ItemsChangedArgs,
} from './item-container-generator.js';
export { ItemsPresenter } from './items-presenter.js';
export { VirtualizingPanel } from './virtualizing-panel.js';
export { VirtualizingStackPanel } from './virtualizing-stack-panel.js';
export { ScrollViewer } from './scroll-viewer.js';
export { ScrollBar, ScrollBarLayout } from './scroll-bar.js';

// Internal helper classes used by the bundled `.template.mu` defaults.
// Re-exported so the package's symbol table — which advertises them to
// the compiler / LSP — can actually resolve them at runtime. Not part
// of the public Controls API; consumer code should treat the
// surrounding control (ComboBox / Drawer / TreeView / ScrollBar) as
// the supported surface.
export {
    ClickableBorder,
    ClickAwayScrim,
    SplitRow,
    ComboBoxPopupHost,
    ComboBoxItemList,
} from './combo-box.js';
export {
    ScrimSurface,
    TemporaryOverlayHost,
} from './drawer.js';
export {
    ClickableRow,
    ChevronTarget,
    CollapsibleStack,
} from './tree-view.js';
