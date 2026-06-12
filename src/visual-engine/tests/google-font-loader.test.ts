import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFontFaces } from '../text/google-font-loader.js';

// Only the parser is unit-tested — the loader's actual fetch path
// depends on network reachability to Google Fonts, which is too fragile
// for a unit test. The end-to-end fetch + parse + register flow is
// exercised by the demo:gfont script.

describe('parseFontFaces', () => {
    test('extracts weight, style, url from a Google Fonts CSS response', () => {
        const css = `
            @font-face {
              font-family: 'Inter';
              font-style: normal;
              font-weight: 400;
              src: url(https://fonts.gstatic.com/foo.ttf) format('truetype');
            }
            @font-face {
              font-family: 'Inter';
              font-style: italic;
              font-weight: 700;
              src: url(https://fonts.gstatic.com/bar.ttf) format('truetype');
            }
        `;
        const faces = parseFontFaces(css);
        assert.equal(faces.length, 2);
        assert.deepEqual(faces[0], {
            weight: 'normal',
            style:  'normal',
            url:    'https://fonts.gstatic.com/foo.ttf',
        });
        assert.deepEqual(faces[1], {
            weight: 'bold',
            style:  'italic',
            url:    'https://fonts.gstatic.com/bar.ttf',
        });
    });

    test('weight ≥ 600 is bold; < 600 is normal', () => {
        const css = `
            @font-face { font-weight: 100; src: url(a.ttf); }
            @font-face { font-weight: 500; src: url(b.ttf); }
            @font-face { font-weight: 600; src: url(c.ttf); }
            @font-face { font-weight: 900; src: url(d.ttf); }
        `;
        const faces = parseFontFaces(css);
        assert.deepEqual(faces.map(f => f.weight), ['normal', 'normal', 'bold', 'bold']);
    });

    test('deduplicates identical (weight, style, url) combos across blocks', () => {
        // Google sometimes emits multiple @font-face for the same variant
        // (different unicode-range subsets pointing at the same TTF). We
        // shouldn't fetch the same binary twice.
        const css = `
            @font-face { font-weight: 400; font-style: normal; src: url(a.ttf); }
            @font-face { font-weight: 400; font-style: normal; src: url(a.ttf); }
            @font-face { font-weight: 400; font-style: normal; src: url(b.ttf); }
        `;
        const faces = parseFontFaces(css);
        assert.equal(faces.length, 2);
        assert.equal(faces[0]!.url, 'a.ttf');
        assert.equal(faces[1]!.url, 'b.ttf');
    });

    test('blocks without a url are skipped (defensive)', () => {
        const css = `
            @font-face { font-weight: 400; }
            @font-face { font-weight: 400; src: url(real.ttf); }
        `;
        const faces = parseFontFaces(css);
        assert.equal(faces.length, 1);
        assert.equal(faces[0]!.url, 'real.ttf');
    });

    test('accepts url(...) with single, double, and no quotes', () => {
        const css = `
            @font-face { font-weight: 400; src: url("a.ttf"); }
            @font-face { font-weight: 500; src: url('b.ttf'); }
            @font-face { font-weight: 600; src: url(c.ttf); }
        `;
        const faces = parseFontFaces(css);
        assert.deepEqual(faces.map(f => f.url), ['a.ttf', 'b.ttf', 'c.ttf']);
    });

    test('empty CSS yields zero faces', () => {
        assert.equal(parseFontFaces('').length, 0);
        assert.equal(parseFontFaces('/* no faces */').length, 0);
    });
});
