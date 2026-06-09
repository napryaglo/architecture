// tree-view demo — TreeViewVM holds the data tree + the
// HierarchicalDataTemplate wiring; OnViewMounted resolves the bound
// TreeView by name and sets its ItemTemplate / ItemsSource.
import { Application } from '@visualisation-sub/mural/runtime';
import { TreeViewDemo } from './tree-view.mu.js';
import { TreeViewVM } from './tree-view-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'tree-view',
    group:    'Controls',
    title:    'TreeView',
    subtitle: 'Composed markup (left) vs. HierarchicalDataTemplate over a recursive data tree (right).',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(TreeViewDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new TreeViewVM();
        return vmInstance;
    },
});
