// splitter demo bootstrap — registers the SplitterVM-keyed
// DataTemplate with the platform's resource dictionary and hands the
// shell a VM instance on activation.
import { SplitterVM } from './splitter-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'splitter',
    group:    'Controls',
    title:    'Splitter',
    subtitle: 'GridSplitter resizing Grid columns (Star + Star, Min/Max clamps) and standalone Splitter resizing StackPanel siblings.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new SplitterVM();
        return vmInstance;
    },
});
