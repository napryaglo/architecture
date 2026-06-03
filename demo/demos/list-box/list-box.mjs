// list-box demo — ListBoxVM holds the demo state; its OnViewMounted
// resolves x:named buttons / status line / bound ListBox inside the
// freshly-applied template and wires Sort/Filter + CollectionView
// subscription. On first activation the demo merges its
// ResourceDictionary into Application resources and hands the
// platform a VM instance.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createListBoxResources } from './list-box.mu.js';
import { ListBoxVM } from './list-box-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'list-box',
    group:    'Controls',
    title:    'ListBox',
    subtitle: 'Declarative · Items=[…] convenience · ItemsSource + CollectionView with Sort / Filter toggles.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createListBoxResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new ListBoxVM();
        return vmInstance;
    },
});
