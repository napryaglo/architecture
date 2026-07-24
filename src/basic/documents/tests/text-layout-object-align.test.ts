import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutInlines, type FlowItem, type MeasureText, type MeasureObject, type ObjectFragment, type TextFragment } from '../text-layout.js';
import { FontStyle, FontWeight, TextDecorations, type TextMetrics } from '../../../visual-engine/index.js';
import { Run } from '../inlines.js';
import type { Visual } from '../../../runtime/index.js';
import type { RunProps } from '../text-element.js';

// Middle alignment of embedded inline objects (InlineUIContainer): an object's
// box is centred on the surrounding text's vertical middle, not baseline-bottom.
// This is what keeps an inline code-chip sitting centred on the line instead of
// riding above the baseline.

const PROPS: RunProps = {
    family: 'stub', size: 10, weight: FontWeight.Normal, style: FontStyle.Normal,
    foreground: undefined, decorations: TextDecorations.None, link: undefined,
};

// Flat text metrics: ascent 10, descent 2 → text box height 12, centre 4 above baseline.
const measure: MeasureText = (t: string): TextMetrics =>
    ({ Width: [...t].length * 10, Height: 12, Ascent: 10, Descent: 2 } as TextMetrics);

function layoutTextThenObject(objectHeight: number)
{
    const items: FlowItem[] = [
        { kind: 'text', text: 'ab', props: PROPS, source: new Run('ab') },
        { kind: 'object', visual: null as unknown as Visual, source: new Run('') },
    ];
    const measureObject: MeasureObject = () => ({ width: 20, height: objectHeight });
    const r = layoutInlines(items, {
        availableWidth: Number.POSITIVE_INFINITY, wrap: false, letterSpacing: 0,
        lineHeight: Number.NaN, measureText: measure, measureObject,
    });
    const frags = r.lines[0]!.frags;
    const textFrag = frags.find((f) => f.kind === 'text') as TextFragment;
    const objFrag = frags.find((f) => f.kind === 'object') as ObjectFragment;
    return { textFrag, objFrag };
}

const centreOf = (top: number, extent: number): number => top + extent / 2;

describe('layoutInlines — inline object middle alignment', () => {
    test('a taller object is centred on the text vertical middle', () => {
        const { textFrag, objFrag } = layoutTextThenObject(16);
        const textCentre = centreOf(textFrag.y, textFrag.ascent + textFrag.descent);
        const objCentre = centreOf(objFrag.y, objFrag.height);
        assert.equal(objCentre, textCentre, 'object centre aligns to text centre');
        // ascent + descent still spans the full box (hit-testing relies on it)
        assert.equal(objFrag.ascent + objFrag.descent, objFrag.height);
    });

    test('a shorter object is centred too (not dropped to the baseline)', () => {
        const { textFrag, objFrag } = layoutTextThenObject(8);
        const textCentre = centreOf(textFrag.y, textFrag.ascent + textFrag.descent);
        const objCentre = centreOf(objFrag.y, objFrag.height);
        assert.equal(objCentre, textCentre);
    });
});
