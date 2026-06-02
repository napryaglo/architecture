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
export { ComboBox } from './combo-box.js';
export { DockPanel, Dock } from './dock-panel.js';
export { Drawer, DrawerVariant } from './drawer.js';
export { TreeView, TreeViewItem } from './tree-view.js';
export { PageView } from './page-view.js';
export { StackPanel, Orientation } from './stack-panel.js';
export { ContentControl } from './content-control.js';
export { ContentPresenter } from './content-presenter.js';
export {
    ControlTemplate,
    TemplateBinding,
    type TemplateFactory,
    type TemplateInstance,
} from './control-template.js';
export { DataTemplate, type DataTemplateFactory } from './data-template.js';
export { ItemsControl, type ItemsPanelFactory } from './items-control.js';
export { ItemContainerGenerator } from './item-container-generator.js';
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
