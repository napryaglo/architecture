import { ObservableCollection } from '../runtime/index.js';

// One group in a grouped CollectionView. Produced by CollectionView's
// Refresh whenever GroupDescriptions is non-empty; reachable via
// CollectionView.Groups or as a row in a GroupStyle-wired
// ItemsControl (where each CollectionViewGroup becomes a GroupItem
// container).
//
// `Name` is the group key (whatever GroupDescription.key returned for
// the first item that landed in this bucket). `Items` is the bucket's
// live ObservableCollection — recreated on each Refresh, so
// subscribers should re-bind after a re-projection.
//
// Hierarchical grouping (groups-of-groups) would require an
// additional `IsBottomLevel` flag plus nested sub-Groups; not
// implemented today.
//
// Lives in its own file (rather than alongside CollectionView) to
// break a module-init cycle: ItemsControl needs to `instanceof`-check
// this class to enter its grouped-rendering path, and
// CollectionView's module already imports from items-control to
// register a constructor handle for ItemsSource auto-projection.
export class CollectionViewGroup
{
    public readonly Items: ObservableCollection<unknown>
        = new ObservableCollection<unknown>();

    constructor(
        public readonly Name: unknown,
        // Zero-based nesting level: 0 = outermost group, 1 = first
        // nested level, etc. Set by CollectionView.buildGroups during
        // recursive construction.
        public readonly Level: number = 0,
        // `true` when `Items` holds raw data records (leaf level);
        // `false` when `Items` holds sub-groups (CollectionViewGroup
        // instances). ItemsControl's grouped-rendering path consults
        // this — bottom-level groups render via ItemTemplate, non-
        // bottom groups recurse through nested GroupItems.
        public readonly IsBottomLevel: boolean = true,
    ) {}

    public get ItemCount(): number { return this.Items.Count; }
}
