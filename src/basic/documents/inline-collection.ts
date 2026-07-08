import { ObservableCollection } from '../../runtime/index.js';
import { Inline, type InlineHost } from './text-element.js';

// InlineCollection — the ordered children of a Span (or the top-level
// content of a TextBlock). Beyond a plain ObservableCollection it does
// two things on every mutation: fixes up each child's Parent back-pointer
// (so tree changes can bubble and, later, offsets can map back to
// elements), and notifies the owning host so the TextBlock re-measures.
export class InlineCollection extends ObservableCollection<Inline>
{
    constructor(private readonly owner: InlineHost)
    {
        super([]);
        this.Subscribe((c) =>
        {
            switch (c.kind)
            {
                case 'inserted': for (const it of c.items) it.Parent = this.owner; break;
                case 'removed':  for (const it of c.items) it.Parent = undefined; break;
                case 'replaced': c.oldItem.Parent = undefined; c.newItem.Parent = this.owner; break;
                case 'cleared':  /* items already detached logically */ break;
                case 'moved':    break;
            }
            this.owner.onInlineTreeChanged();
        });
    }
}
