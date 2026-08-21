import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MetaData } from '../../metadata.js';
import { MuralBase } from '../../model.js';
import { TextBlock } from '../../../basic/text-block.js';
import { TemplateBinding } from '../template-binding.js';
import { resolveKey } from '../../model-internals.js';

// A minimal templated-control stand-in: a Visual (TextBlock constructs bare)
// carrying one BindsTwoWayByDefault DP (like SpinEdit.Value / TextBox.Text —
// the editable fields a template hosts) and one plain DP (a display value).
class Probe extends TextBlock
{
    public static readonly EditableKey = MuralBase.RegisterProperty<number>(
        Probe, 'Editable', 0, MetaData.BindsTwoWayByDefault);
    public static readonly DisplayKey = MuralBase.RegisterProperty<number>(
        Probe, 'Display', 0, MetaData.None);

    public get Editable(): number { return this.get_property_value(Probe.EditableKey); }
    public set Editable(v: number) { this.set_property_value(Probe.EditableKey, v); }
    public get Display(): number { return this.get_property_value(Probe.DisplayKey); }
    public set Display(v: number) { this.set_property_value(Probe.DisplayKey, v); }
}

describe('TemplateBinding ($$) writeback', () => {
    test('two-way: editing a BindsTwoWayByDefault target writes back to the templated parent', () => {
        // Mirrors the Size & Position editor: a SpinEdit.Value ($$WidthValue)
        // inside a control's template must push the user's edit back up to the
        // control's own DP — otherwise the field is display-only.
        const parent = new Probe();
        parent.Editable = 100;
        const field = new Probe(); // stands in for the SpinEdit
        field.set_property_value(
            resolveKey(field, undefined, 'Editable'),
            TemplateBinding(parent, 'Editable'),
        );
        // Seeds from the templated parent.
        assert.equal(field.Editable, 100);

        // The user edits the field; the edit must reach the templated parent.
        field.set_property_value(resolveKey(field, undefined, 'Editable'), 250);
        assert.equal(parent.Editable, 250, 'edit wrote back to the templated parent');
    });

    test('one-way: a plain (non-two-way) target stays display-only', () => {
        // A `$$` on an ordinary display DP must NOT become a back-channel —
        // only BindsTwoWayByDefault targets round-trip.
        const parent = new Probe();
        parent.Display = 10;
        const field = new Probe();
        field.set_property_value(
            resolveKey(field, undefined, 'Display'),
            TemplateBinding(parent, 'Display'),
        );
        assert.equal(field.Display, 10);

        field.set_property_value(resolveKey(field, undefined, 'Display'), 99);
        assert.equal(parent.Display, 10, 'display-only $$ does not write back');
    });
});
