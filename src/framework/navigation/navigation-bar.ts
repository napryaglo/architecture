import {
    Model,
    Element, Visual,
} from '../../runtime/index.js';
import { findDataTemplateForType } from '../../basic/templates/data-template.js';
import { Selector } from '../list/selector.js';
import { NavigationItem } from './navigation-item.js';

// Same display-string convention NavigationRail uses.
function displayString(item: unknown): string
{
    if (item === undefined || item === null) return '';
    if (typeof item === 'string') return item;
    if (typeof item === 'object')
    {
        const obj = item as Record<string, unknown>;
        if (typeof obj.Label === 'string') return obj.Label;
        if (typeof obj.Name  === 'string') return obj.Name;
        if (typeof obj.Text  === 'string') return obj.Text;
    }
    return String(item);
}

// Material 3 Navigation Bar — a horizontal strip of 3-5 destination
// icons pinned to the bottom of a mobile-form-factor screen.
// Counterpart to NavigationRail (vertical, desktop) — same per-item
// chrome and selection model, just laid out horizontally with each
// item taking an equal share of the bar's width.
//
// Selector semantics — exactly one selected at a time (Single).
//
// Items model mirrors NavigationRail: composed (NavigationItem
// children declared in markup) or data-driven (ItemsSource binding
// with auto-wrap in NavigationItem containers).
//
// M3 chrome:
//   * Height: 80dp
//   * Background: @Surface
//   * Items area: horizontal UniformGrid (every item gets the same
//     width regardless of label length).
//   * No Header / Footer slots — the bottom-bar pattern doesn't carry
//     them in M3 (unlike Rail).
//
// Limit of 5 items is a spec convention, not enforced — consumers that
// stuff more in get a tighter layout but no runtime error. Anything
// above 7 starts to feel cramped; consider a Rail / Drawer instead.
export class NavigationBar extends Selector
{
    static
    {
        Model.OverrideMetadata(
            NavigationBar, Element.DefaultStyleKeyKey,
            { default_value: NavigationBar },
        );
    }

    constructor()
    {
        super();
        this.applyDefaultStyle();
    }

    protected override validateDeclarativeChild(child: Visual): void
    {
        if (!(child instanceof NavigationItem))
        {
            throw new Error(
                'NavigationBar accepts only NavigationItem children in '
                + 'markup (got ' + child.constructor.name + ').',
            );
        }
    }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof NavigationItem;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        const ni = new NavigationItem();
        this.bindContainerData(ni, item);
        return ni;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        if (container instanceof NavigationItem)
        {
            this.bindContainerData(container, item);
        }
        super.RebindContainerForItemOverride(container, item);
    }

    private bindContainerData(ni: NavigationItem, item: unknown): void
    {
        ni.Tag         = item;
        ni.DataContext = item;
        if (item instanceof Visual)
        {
            ni.Content = item;
        }
        else if (item instanceof Model
              && findDataTemplateForType(item.constructor) !== undefined)
        {
            ni.Content = item;
        }
        else
        {
            ni.Label = displayString(item);
        }
    }
}
