// CarouselVM — backs the carousel demo. A small list of hero cards plus an
// ActiveIndex the prev/next chevrons page through (bound TwoWay), echoed as
// a "card N of M" caption.
import { Model, MetaData, ObservableCollection } from '@visualisation-sub/mural/runtime';
// One hero card. The DataTemplate in carousel.mu renders it by this type.
export class CarouselCard extends Model {
    static TitleKey = Model.RegisterProperty(CarouselCard, 'Title', '', MetaData.None);
    static SubtitleKey = Model.RegisterProperty(CarouselCard, 'Subtitle', '', MetaData.None);
    get Title() { return this.get_property_value(CarouselCard.TitleKey); }
    get Subtitle() { return this.get_property_value(CarouselCard.SubtitleKey); }
    constructor(title, subtitle) {
        super();
        this.set_property_value(CarouselCard.TitleKey, title);
        this.set_property_value(CarouselCard.SubtitleKey, subtitle);
    }
}
const CARDS = [
    ['Aurora', 'Northern lights over the fjords'],
    ['Basalt', 'Volcanic coastlines of the south'],
    ['Cirrus', 'High cloudscapes at golden hour'],
    ['Delta', 'River braids from the air'],
    ['Ember', 'Desert dunes at dusk'],
    ['Frost', 'Alpine ridgelines in winter'],
];
export class CarouselVM extends Model {
    static ItemsKey = Model.RegisterProperty(CarouselVM, 'Items', undefined, MetaData.None);
    static ActiveIndexKey = Model.RegisterProperty(CarouselVM, 'ActiveIndex', 0, MetaData.None);
    static CaptionKey = Model.RegisterProperty(CarouselVM, 'Caption', '', MetaData.None);
    get Items() { return this.get_property_value(CarouselVM.ItemsKey); }
    get ActiveIndex() { return this.get_property_value(CarouselVM.ActiveIndexKey); }
    set ActiveIndex(v) { this.set_property_value(CarouselVM.ActiveIndexKey, v); }
    get Caption() { return this.get_property_value(CarouselVM.CaptionKey); }
    set Caption(v) { this.set_property_value(CarouselVM.CaptionKey, v); }
    constructor() {
        super();
        const items = new ObservableCollection();
        for (const [t, s] of CARDS)
            items.Add(new CarouselCard(t, s));
        this.set_property_value(CarouselVM.ItemsKey, items);
        this.refresh();
    }
    refresh() {
        this.Caption = `Card ${this.ActiveIndex + 1} of ${this.Items?.Count ?? 0}`;
    }
    OnPropertyChanged(descriptor, oldValue, newValue) {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'ActiveIndex')
            this.refresh();
    }
}
