// TreeViewVM — two-pane TreeView showcase: a composed-markup tree on
// the left and a HierarchicalDataTemplate-driven tree on the right.
//
// The right pane carries a JS itemsSelector closure that can't be
// expressed in `.mu` markup yet, so OnViewMounted resolves the bound
// TreeView via FindName and wires its ItemTemplate / ItemsSource
// post-build.
import { Model } from '@visualisation-sub/mural/runtime';
import { HierarchicalDataTemplate } from '@visualisation-sub/mural/basic';
import { TreeView, TreeViewItem } from '@visualisation-sub/mural/framework';
const FS = {
    Name: 'project',
    children: [
        { Name: 'README.md' },
        {
            Name: 'src',
            children: [
                { Name: 'index.ts' },
                {
                    Name: 'compiler',
                    children: [
                        { Name: 'parser.ts' },
                        { Name: 'emitter.ts' },
                        { Name: 'types.ts' },
                    ],
                },
                {
                    Name: 'runtime',
                    children: [
                        { Name: 'app.ts' },
                        { Name: 'logger.ts' },
                    ],
                },
            ],
        },
        {
            Name: 'tests',
            children: [
                { Name: 'parser.test.ts' },
                { Name: 'emitter.test.ts' },
            ],
        },
        { Name: 'package.json' },
    ],
};
export class TreeViewVM extends Model {
    OnViewMounted(view) {
        const tv = view.FindName('bound');
        if (!(tv instanceof TreeView))
            throw new Error('tree-view.mu missing x:name="bound" TreeView');
        // The template's `factory` argument is required by DataTemplate
        // but currently unused for TreeView containers — Header is set
        // from the data via the Label/Name/Text convention, and the row
        // chrome comes from DefaultTreeViewItem. Pass a placeholder TVI
        // so HierarchicalDataTemplate construction stays valid.
        const tpl = new HierarchicalDataTemplate((_data) => new TreeViewItem(), 
        // The selector receives untyped item data from the DataTemplate
        // pipeline; narrow it to the local FsNode shape to read children.
        (data) => (data && typeof data === 'object' ? data.children : undefined));
        tv.ItemTemplate = tpl;
        tv.ItemsSource = [FS];
        // First-load convenience: expand the root so the tree isn't a
        // single line on open. The container is realized synchronously
        // when ItemsSource fires the inserted change.
        const root = tv.RootItems[0];
        if (root !== undefined)
            root.IsExpanded = true;
    }
}
