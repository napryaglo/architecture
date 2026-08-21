// TreeViewVM — two-pane TreeView showcase: a composed-markup tree on
// the left and a HierarchicalDataTemplate-driven tree on the right.
//
// The right pane carries a JS itemsSelector closure that can't be
// expressed in `.mu` markup yet, so OnViewMounted resolves the bound
// TreeView via FindName and wires its ItemTemplate / ItemsSource
// post-build.
import { MuralBase } from '@pragmatic-lab/mural/runtime';
import { HierarchicalDataTemplate, TextBlock } from '@pragmatic-lab/mural/basic';
import { TreeView } from '@pragmatic-lab/mural/framework';
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
export class TreeViewVM extends MuralBase {
    OnViewMounted(view) {
        const tv = view.FindName('bound');
        if (!(tv instanceof TreeView))
            throw new Error('tree-view.mu missing x:name="bound" TreeView');
        // The template's `factory` produces each row's header content —
        // TreeView applies it and hosts the Visual in the row. Here that's
        // a simple Name label; a real app would compose an icon + label
        // (that's exactly what per-item chrome now enables).
        const tpl = new HierarchicalDataTemplate((data) => new TextBlock(data.Name), 
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
