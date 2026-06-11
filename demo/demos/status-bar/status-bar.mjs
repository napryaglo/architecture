// status-bar demo — exposes StatusBar / StatusBarItem / StatusBarSeparator.
// Cells dock left / right via DockPanel.Dock and a stretchy middle cell
// pulls the residue width.
import { Application } from '@visualisation-sub/mural/runtime';
import { StatusBarDemo } from './status-bar.mu.js';
import { StatusBarVM } from './status-bar-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'status-bar',
    group:    'Controls',
    title:    'StatusBar',
    subtitle: 'Docked cells with separators; gated commands; LastChildFill stretchy middle.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(StatusBarDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new StatusBarVM();
        return vmInstance;
    },
});
