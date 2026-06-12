// Barrel re-exports for the basic control library — primitive Visuals
// (Border, Canvas, layout panels, TextBlock, …) and the templating
// primitives that the framework controls build on. Consumers import
// from here rather than the individual control files.
//
// Templated controls (ContentControl, ItemsControl, Button, ToggleButton,
// ScrollViewer, Drawer, GroupItem, ListBox, TreeView, ComboBox, Menu /
// ContextMenu / MenuButton, ToolBar, Diagram, Selector base) live in
// `@visualisation-sub/mural/framework`.

export { Adorner, AdornerLayer, AdornerDecorator } from '../runtime/index.js';
export { ValidationErrorAdorner } from './validation-error-adorner.js';
export { Border } from './border.js';
export { TextBlock, TextAlignment, TextWrapping } from './text-block.js';
export { Canvas } from './panels/canvas.js';
export { Ellipse } from './shapes/ellipse.js';
export { Image } from './image.js';
export { Line } from './shapes/line.js';
export { Rectangle } from './shapes/rectangle.js';
export { DockPanel, Dock } from './panels/dock-panel.js';
export {
    TextBox,
    TextEditorSurface,
    type ClipboardSink,
} from './text-box.js';
export { SpinEdit } from './spin-edit.js';
export { Slider, SliderLayout } from './slider.js';
export { PageView } from './page-view.js';
export { StackPanel, Orientation } from './panels/stack-panel.js';
export { WrapPanel } from './panels/wrap-panel.js';
export { UniformGrid } from './panels/uniform-grid.js';
export {
    Grid,
    GridLength,
    ColumnDefinition,
    RowDefinition,
    type GridUnitType,
} from './panels/grid.js';
export { ContentPresenter } from './templates/content-presenter.js';
export {
    ControlTemplate,
    TemplateBinding,
    type TemplateFactory,
    type TemplateInstance,
} from './templates/control-template.js';
export {
    DataTemplate,
    HierarchicalDataTemplate,
    TargetedSetter,
    TemplateDataTrigger,
    TemplateMultiDataTrigger,
    TemplatePropertyTrigger,
    type DataTemplateFactory,
    type HierarchicalChildSelector,
    type TemplateDataTriggerCondition,
} from './templates/data-template.js';
export { ListReorderBehavior } from './behaviors/list-reorder-behavior.js';
export { LogBehavior } from './behaviors/log-behavior.js';
export { attachMarqueeSelection } from './behaviors/marquee-selection-behavior.js';
export { AlternationConverter } from './alternation-converter.js';
export {
    ItemsPanelTemplate,
    type ItemsPanelFactory,
} from './panels/items-panel-template.js';
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
} from './collections/collection-view.js';
export { GroupStyle } from './collections/group-style.js';
export {
    GenerationSession,
    GeneratorDirection,
    GeneratorPosition,
    GeneratorStatus,
    ItemContainerGenerator,
    ItemsChangedAction,
    type ItemsChangedArgs,
} from './collections/item-container-generator.js';
export { ItemsPresenter } from './templates/items-presenter.js';
export { VirtualizingPanel } from './panels/virtualisation/virtualizing-panel.js';
export { VirtualizingStackPanel } from './panels/virtualisation/virtualizing-stack-panel.js';
export { VirtualizingWrapPanel } from './panels/virtualisation/virtualizing-wrap-panel.js';
export { ScrollContentPresenter } from './scroll/scroll-content-presenter.js';
export { ScrollBar, ScrollBarLayout } from './scroll/scroll-bar.js';
export {
    Thumb,
    type DragStartedEventArgs,
    type DragDeltaEventArgs,
    type DragCompletedEventArgs,
} from './scroll/thumb.js';
export {
    GridSplitter,
    type GridResizeDirection,
    type GridResizeBehavior,
} from './grid-splitter.js';
export { Splitter } from './splitter.js';

// Drawer / Menu / ContextMenu / Surface-control helpers (ScrimSurface,
// TemporaryOverlayHost, ClickableBorder, ClickAwayScrim, …) live in
// `@visualisation-sub/mural/framework` alongside their owning controls.
