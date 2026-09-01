// CarouselVM — backs the carousel demo. A small list of hero cards plus an
// ActiveIndex the prev/next chevrons page through (bound TwoWay), echoed as
// a "card N of M" caption.
import { MuralBase, MetaData, ObservableCollection, type PropertyDescriptor } from '@pragmatic-tech-ai/mural/runtime';

// One hero card. The DataTemplate in carousel.mu renders it by this type.
export class CarouselCard extends MuralBase
{
    static TitleKey    = MuralBase.RegisterProperty<string>(CarouselCard, 'Title', '', MetaData.None);
    static SubtitleKey = MuralBase.RegisterProperty<string>(CarouselCard, 'Subtitle', '', MetaData.None);

    get Title():    string { return this.get_property_value(CarouselCard.TitleKey); }
    get Subtitle(): string { return this.get_property_value(CarouselCard.SubtitleKey); }

    constructor(title: string, subtitle: string)
    {
        super();
        this.set_property_value(CarouselCard.TitleKey, title);
        this.set_property_value(CarouselCard.SubtitleKey, subtitle);
    }
}

const CARDS: ReadonlyArray<readonly [string, string]> = [
    ['Aurora',   'Northern lights over the fjords'],
    ['Basalt',   'Volcanic coastlines of the south'],
    ['Cirrus',   'High cloudscapes at golden hour'],
    ['Delta',    'River braids from the air'],
    ['Ember',    'Desert dunes at dusk'],
    ['Frost',    'Alpine ridgelines in winter'],
];

export class CarouselVM extends MuralBase
{
    static ItemsKey       = MuralBase.RegisterProperty<ObservableCollection<CarouselCard>>(CarouselVM, 'Items', undefined as unknown as ObservableCollection<CarouselCard>, MetaData.None);
    static ActiveIndexKey = MuralBase.RegisterProperty<number>(CarouselVM, 'ActiveIndex', 0, MetaData.None);
    static CaptionKey     = MuralBase.RegisterProperty<string>(CarouselVM, 'Caption', '', MetaData.None);

    get Items():       ObservableCollection<CarouselCard> { return this.get_property_value(CarouselVM.ItemsKey); }
    get ActiveIndex(): number { return this.get_property_value(CarouselVM.ActiveIndexKey); }
    set ActiveIndex(v: number) { this.set_property_value(CarouselVM.ActiveIndexKey, v); }
    get Caption():     string { return this.get_property_value(CarouselVM.CaptionKey); }
    set Caption(v:     string) { this.set_property_value(CarouselVM.CaptionKey, v); }

    constructor()
    {
        super();
        const items = new ObservableCollection<CarouselCard>();
        for (const [t, s] of CARDS) items.Add(new CarouselCard(t, s));
        this.set_property_value(CarouselVM.ItemsKey, items);
        this.refresh();
    }

    private refresh(): void
    {
        this.Caption = `Card ${this.ActiveIndex + 1} of ${this.Items?.Count ?? 0}`;
    }

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'ActiveIndex') this.refresh();
    }
}
