// Barrel re-exports for the Basic control library — primitive Visuals
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
export { TextBlock, TextWrapping } from './text-block.js';
export { Canvas } from './canvas.js';
export { Ellipse } from './ellipse.js';
export { Line } from './line.js';
export { DockPanel, Dock } from './dock-panel.js';
export {
    TextBox,
    TextEditorSurface,
    type ClipboardSink,
} from './text-box.js';
export { SpinEdit } from './spin-edit.js';
export { Slider, SliderLayout } from './slider.js';
export { PageView } from './page-view.js';
export { StackPanel, Orientation } from './stack-panel.js';
export { WrapPanel } from './wrap-panel.js';
export { UniformGrid } from './uniform-grid.js';
export {
    Grid,
    GridLength,
    ColumnDefinition,
    RowDefinition,
    type GridUnitType,
} from './grid.js';
export { ContentPresenter } from './content-presenter.js';
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
export { ListReorderBehavior } from './list-reorder-behavior.js';
export { attachMarqueeSelection } from './marquee-selection-behavior.js';
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
export { VirtualizingWrapPanel } from './virtualizing-wrap-panel.js';
export { ScrollContentPresenter } from './scroll-content-presenter.js';
export { ScrollBar, ScrollBarLayout } from './scroll-bar.js';
export {
    Thumb,
    type DragStartedEventArgs,
    type DragDeltaEventArgs,
    type DragCompletedEventArgs,
} from './thumb.js';
export {
    GridSplitter,
    type GridResizeDirection,
    type GridResizeBehavior,
} from './grid-splitter.js';
export { Splitter } from './splitter.js';

// Drawer / Menu / ContextMenu / Surface-control helpers (ScrimSurface,
// TemporaryOverlayHost, ClickableBorder, ClickAwayScrim, …) live in
// `@visualisation-sub/mural/framework` alongside their owning controls.
