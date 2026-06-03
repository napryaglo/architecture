// dashboard demo — DashboardVM is empty; the .mu file declares a
// DataTemplate keyed on DashboardVM with three styled Borders + when()
// triggers. On first activation the demo merges its ResourceDictionary
// into Application resources and hands the platform a VM instance.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createDashboardResources } from './dashboard.mu.js';
import { DashboardVM } from './dashboard-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'dashboard',
    group:    'Styles & Triggers',
    title:    'Dashboard',
    subtitle: 'Three Border cards with property triggers (IsMouseOver / IsPressed).',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createDashboardResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DashboardVM();
        return vmInstance;
    },
});
