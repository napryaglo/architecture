import type { Style } from '../runtime/index.js';
import type { DataTemplate } from './data-template.js';
import type { ItemsPanelTemplate } from './items-panel-template.js';

// Per-level styling for grouped ItemsControls. Mirrors
// System.Windows.Controls.GroupStyle — a small bag of optional knobs
// that an ItemsControl consults when its projected items are
// CollectionViewGroups.
//
//   * HeaderTemplate     — DataTemplate to render the group header.
//                          Receives the CollectionViewGroup as its
//                          DataContext (so $Name binds to the group's
//                          key).
//   * ContainerStyle     — Style applied to each GroupItem container
//                          (target type GroupItem).
//   * Panel              — ItemsPanelTemplate for the layout panel
//                          INSIDE each GroupItem (the panel that hosts
//                          the group's leaf items). Defaults to the
//                          enclosing ItemsControl's ItemsPanel.
//
// All fields optional. A GroupStyle with everything undefined still
// switches the ItemsControl into grouped-rendering mode — group
// boundaries become visible because each CollectionViewGroup is
// wrapped in its own GroupItem (each with its own items panel) even
// without explicit chrome.
export class GroupStyle
{
    constructor(
        public HeaderTemplate: DataTemplate       | undefined = undefined,
        public ContainerStyle: Style              | undefined = undefined,
        public Panel:          ItemsPanelTemplate | undefined = undefined,
    ) {}
}
