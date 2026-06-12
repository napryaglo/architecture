// card demo — three M3 Card variants side by side (Filled / Elevated /
// Outlined). Each has a title, body, and a Text Button action so the
// dynamic-binding chain through CardVM is visible.
import { Application } from '@visualisation-sub/mural/runtime';
import { CardDemo } from './card.mu.js';
import { CardVM } from './card-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'card',
    group:    'Controls',
    title:    'Card',
    subtitle: 'Three M3 variants; Variant DP drives container colour, border, and resting elevation.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(CardDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new CardVM();
        return vmInstance;
    },
});
