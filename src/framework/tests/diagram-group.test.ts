import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
} from '../../runtime/index.js';
import { Group } from '../diagram/group.js';

// Synthetic member VM satisfying the duck-typed contract Group reads
// from (Left / Top / Width / Height as DPs on a Model). No relation to
// the demo's ShapeNodeVM — the framework-side Group is agnostic to
// specific VM classes.
class MemberVM extends Model
{
    public static readonly LeftKey   = Model.RegisterProperty<number>(MemberVM, 'Left',   0,  MetaData.None);
    public static readonly TopKey    = Model.RegisterProperty<number>(MemberVM, 'Top',    0,  MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(MemberVM, 'Width',  0,  MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(MemberVM, 'Height', 0,  MetaData.None);

    constructor(left: number, top: number, w: number, h: number)
    {
        super();
        this.set_property_value(MemberVM.LeftKey,   left);
        this.set_property_value(MemberVM.TopKey,    top);
        this.set_property_value(MemberVM.WidthKey,  w);
        this.set_property_value(MemberVM.HeightKey, h);
    }

    public get Left():   number  { return this.get_property_value(MemberVM.LeftKey); }
    public set Left(v: number)   { this.set_property_value(MemberVM.LeftKey, v); }
    public get Top():    number  { return this.get_property_value(MemberVM.TopKey); }
    public set Top(v: number)    { this.set_property_value(MemberVM.TopKey, v); }
    public get Width():  number  { return this.get_property_value(MemberVM.WidthKey); }
    public set Width(v: number)  { this.set_property_value(MemberVM.WidthKey, v); }
    public get Height(): number  { return this.get_property_value(MemberVM.HeightKey); }
    public set Height(v: number) { this.set_property_value(MemberVM.HeightKey, v); }
}

class GroupVM extends Model
{
    public static readonly MembersKey = Model.RegisterProperty<ObservableCollection<MemberVM> | undefined>(
        GroupVM, 'Members', undefined, MetaData.None);

    constructor(members: MemberVM[])
    {
        super();
        const coll = new ObservableCollection<MemberVM>();
        for (const m of members) coll.Add(m);
        this.set_property_value(GroupVM.MembersKey, coll);
    }

    public get Members(): ObservableCollection<MemberVM> {
        return this.get_property_value(GroupVM.MembersKey) as ObservableCollection<MemberVM>;
    }
}

function freshGroup(members: MemberVM[]): Group {
    Application.current = null;
    new Application();
    const g = new Group();
    g.DataContext = new GroupVM(members);
    return g;
}

describe('Group — bbox derivation from members', () => {

    test('three-member union bbox (top-left + size)', () => {
        // Members:  (10,20 20×30)  (40,15 15×10)  (5,50 12×8)
        // Right edges: 30, 55, 17 → max 55. Bottom edges: 50, 25, 58 → max 58.
        // Union: left ∈ [5, 55], top ∈ [15, 58]  →  Left=5 Top=15 W=50 H=43.
        const a = new MemberVM(10, 20, 20, 30);
        const b = new MemberVM(40, 15, 15, 10);
        const c = new MemberVM( 5, 50, 12,  8);
        const g = freshGroup([a, b, c]);

        assert.equal(g.Left,   5);
        assert.equal(g.Top,   15);
        assert.equal(g.Width, 50);
        assert.equal(g.Height,43);
    });

    test('zero members yields (0,0,0,0)', () => {
        const g = freshGroup([]);
        assert.equal(g.Left,   0);
        assert.equal(g.Top,    0);
        assert.equal(g.Width,  0);
        assert.equal(g.Height, 0);
    });

    test('member Left / Top change re-derives bbox', () => {
        const a = new MemberVM(10, 10, 20, 20);
        const b = new MemberVM(40, 40, 20, 20);
        const g = freshGroup([a, b]);
        assert.equal(g.Left,   10);
        assert.equal(g.Width,  50);

        a.Left = 0;
        // New union: left ∈ [0, 60]  →  Left=0 W=60
        assert.equal(g.Left,   0);
        assert.equal(g.Width, 60);
    });

    test('member Width / Height change re-derives bbox', () => {
        const a = new MemberVM(0, 0, 10, 10);
        const g = freshGroup([a]);
        assert.equal(g.Width,  10);
        assert.equal(g.Height, 10);

        a.Width  = 25;
        a.Height = 18;
        assert.equal(g.Width,  25);
        assert.equal(g.Height, 18);
    });

    test('inserting a member updates bbox + attaches listener', () => {
        const a = new MemberVM(0, 0, 10, 10);
        const g = freshGroup([a]);
        assert.equal(g.Width, 10);

        const b = new MemberVM(20, 0, 10, 10);
        (g.DataContext as GroupVM).Members.Add(b);
        assert.equal(g.Left, 0);
        assert.equal(g.Width, 30);

        // Moving the newly-inserted member should refire bbox recompute.
        b.Left = 50;
        assert.equal(g.Width, 60);
    });

    test('removing a member updates bbox + detaches listener', () => {
        const a = new MemberVM(0, 0, 10, 10);
        const b = new MemberVM(40, 0, 10, 10);
        const g = freshGroup([a, b]);
        assert.equal(g.Width, 50);

        (g.DataContext as GroupVM).Members.RemoveAt(1);
        assert.equal(g.Width, 10);

        // After remove, mutating the gone member shouldn't ping the group.
        // (Hard to assert directly without an internal probe — a smoke
        // check is that Left-update on a yields the expected bbox without
        // throwing or otherwise misbehaving.)
        b.Left = 999;
        assert.equal(g.Width, 10);
    });

    test('clearing the collection collapses bbox to zeros', () => {
        const a = new MemberVM(10, 10, 20, 20);
        const b = new MemberVM(40, 40, 20, 20);
        const g = freshGroup([a, b]);
        assert.equal(g.Width, 50);

        (g.DataContext as GroupVM).Members.Clear();
        assert.equal(g.Left,   0);
        assert.equal(g.Top,    0);
        assert.equal(g.Width,  0);
        assert.equal(g.Height, 0);
    });

    test('flipping DataContext reattaches listeners against the new members', () => {
        const a = new MemberVM(0, 0, 10, 10);
        const g = freshGroup([a]);
        assert.equal(g.Width, 10);

        const b = new MemberVM(0, 0, 100, 100);
        const c = new MemberVM(50, 50, 50, 50);
        g.DataContext = new GroupVM([b, c]);
        assert.equal(g.Width, 100);

        // Old members should no longer affect the new group.
        a.Width = 999;
        assert.equal(g.Width, 100);

        // New members should affect it.
        c.Left = 200;
        assert.equal(g.Width, 250);
    });
});

describe('Group — rigid translate', () => {

    test('Translate(dx, dy) shifts every member by the delta in lock-step', () => {
        const a = new MemberVM(10, 10, 20, 20);
        const b = new MemberVM(40, 40, 20, 20);
        const c = new MemberVM(70, 70, 20, 20);
        const g = freshGroup([a, b, c]);

        g.Translate(5, -3);

        assert.equal(a.Left, 15); assert.equal(a.Top,  7);
        assert.equal(b.Left, 45); assert.equal(b.Top, 37);
        assert.equal(c.Left, 75); assert.equal(c.Top, 67);
    });

    test('Translate updates the group bbox after the shift', () => {
        const a = new MemberVM(0, 0, 10, 10);
        const b = new MemberVM(40, 40, 10, 10);
        const g = freshGroup([a, b]);
        assert.equal(g.Left, 0);
        assert.equal(g.Top,  0);

        g.Translate(100, 50);

        assert.equal(g.Left, 100);
        assert.equal(g.Top,   50);
        assert.equal(g.Width,  50);
        assert.equal(g.Height, 50);
    });

    test('Translate(0, 0) is a no-op', () => {
        const a = new MemberVM(10, 10, 20, 20);
        const g = freshGroup([a]);

        let bboxRefires = 0;
        g.AddPropertyChangedListener(Group.LeftKey, () => bboxRefires++);
        g.Translate(0, 0);
        assert.equal(bboxRefires, 0);
        assert.equal(a.Left, 10);
    });

    test('per-member PropertyChanged listeners stay quiet during the shift cascade', () => {
        // Recomputing bbox per member-change inside the shift would fire
        // Group.Left / Group.Top changes N times instead of once. Pinned via
        // the listener count: a 3-member shift should fire each bbox DP
        // exactly once (the post-shift recompute).
        const a = new MemberVM(0, 0, 10, 10);
        const b = new MemberVM(20, 0, 10, 10);
        const c = new MemberVM(40, 0, 10, 10);
        const g = freshGroup([a, b, c]);

        let leftFires = 0;
        g.AddPropertyChangedListener(Group.LeftKey, () => leftFires++);
        g.Translate(7, 0);
        // The collapse-to-one-fire is the load-bearing property here.
        assert.equal(leftFires, 1, 'bbox Left must fire exactly once per Translate');
        assert.equal(a.Left, 7);
        assert.equal(b.Left, 27);
        assert.equal(c.Left, 47);
    });
});
