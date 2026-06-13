// fab-menu demo — M3 FabMenu.
//
// The Items (mini-FABs with labels) are constructed here in the
// bootstrap because the VM cannot construct Visuals. Each mini-FAB
// is wired to the VM's matching Command so clicks fire through to
// the demo's read-out.
import { Application, ObservableCollection } from '@visualisation-sub/mural/runtime';
import { StackPanel, TextBlock, Orientation }      from '@visualisation-sub/mural/basic';
import { FloatingActionButton, FabSize }           from '@visualisation-sub/mural/framework';
import { FabMenuDemo } from './fab-menu.mu.js';
import { FabMenuVM }   from './fab-menu-vm.mjs';
import { register }    from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

function buildItems(vm) {
    const items = new ObservableCollection();
    const make = (glyph, label, command) => {
        const row = new StackPanel();
        row.Orientation = Orientation.Horizontal;

        const fab = new FloatingActionButton();
        fab.Size    = FabSize.Small;
        fab.Command = command;
        const icon = new TextBlock();
        icon.Text = glyph;
        fab.Content = icon;
        row.AddChild(fab);

        const tb = new TextBlock();
        tb.Text       = label;
        tb.FontSize   = 13;
        tb.FontWeight = 'Medium';
        row.AddChild(tb);
        items.Add(row);
    };
    make('+',  'Create', vm.CreateCommand);
    make('↑',  'Upload', vm.UploadCommand);
    make('↗',  'Share',  vm.ShareCommand);
    return items;
}

register({
    id:       'fab-menu',
    group:    'Controls',
    title:    'FabMenu',
    subtitle: 'M3 2024 FAB that reveals secondary actions on tap.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(FabMenuDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) {
            vmInstance = new FabMenuVM();
            vmInstance.Items = buildItems(vmInstance);
        }
        return vmInstance;
    },
});
