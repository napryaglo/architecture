// carousel demo — M3 multi-browse Carousel: a row of hero cards paged by
// prev/next chevrons, with ActiveIndex bound TwoWay to a caption.
import { CarouselVM } from './carousel-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'carousel',
    group:    'Controls',
    title:    'Carousel',
    subtitle: 'M3 multi-browse hero-card scroller — snap-to-card paging.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new CarouselVM();
        return vmInstance;
    },
});
