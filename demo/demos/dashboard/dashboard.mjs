// dashboard demo — DashboardVM is empty; the .mu file declares a
// DataTemplate keyed on DashboardVM with three styled Borders + when()
// triggers. The factory hands the platform a VM instance; the demo's
// view dictionary is merged app-global in platform.mu (§ 27).
import { DashboardVM } from './dashboard-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'dashboard',
    group:    'Styles & Triggers',
    title:    'Dashboard',
    subtitle: 'Three Border cards with property triggers (IsMouseOver / IsPressed).',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new DashboardVM();
        return vmInstance;
    },
});
