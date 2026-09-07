import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSvgIcon } from '../svg-icon-parser.js';
import { CURRENT_COLOR } from '../icon.js';

// A shape filled by a gradient reference resolves to the gradient's first stop
// color (a faithful solid stand-in) instead of the CURRENT_COLOR sentinel — the
// Azure/Fluent icon convention is a single `fill="url(#g)"` silhouette path.
test('a url(#gradient) fill resolves to the gradient first-stop color', () => {
    const svg = `<svg viewBox="0 0 18 18">
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="18">
            <stop offset="0" stop-color="#0078d4" />
            <stop offset="0.82" stop-color="#5ea0ef" />
        </linearGradient></defs>
        <path d="M0 0h18v18H0Z" fill="url(#g1)" />
    </svg>`;
    const icon = parseSvgIcon(svg);
    assert.equal(icon.Shapes.length, 1);
    const fill = icon.Shapes[0]!.Fill;
    assert.equal(fill?.R, 0);
    assert.equal(fill?.G, 120);
    assert.equal(fill?.B, 212);
});

test('a radialGradient reference resolves the same way', () => {
    const svg = `<svg viewBox="0 0 24 24"><defs>
        <radialGradient id="r"><stop offset="0" stop-color="#112233" /></radialGradient>
        </defs><rect width="24" height="24" fill="url(#r)" /></svg>`;
    const fill = parseSvgIcon(svg).Shapes[0]!.Fill;
    assert.equal(fill?.R, 0x11);
    assert.equal(fill?.G, 0x22);
    assert.equal(fill?.B, 0x33);
});

test('a url() reference to an unknown gradient stays CURRENT_COLOR (no regression)', () => {
    const svg = `<svg viewBox="0 0 18 18"><path d="M0 0h18v18H0Z" fill="url(#nope)" /></svg>`;
    assert.equal(parseSvgIcon(svg).Shapes[0]!.Fill, CURRENT_COLOR);
});

test('solid hex fills are unaffected', () => {
    const svg = `<svg viewBox="0 0 18 18"><path d="M0 0h18v18H0Z" fill="#f2f2f2" /></svg>`;
    const fill = parseSvgIcon(svg).Shapes[0]!.Fill;
    assert.equal(fill?.R, 0xf2);
    assert.equal(fill?.G, 0xf2);
    assert.equal(fill?.B, 0xf2);
});

test('a self-closing <g/> (empty group) does not swallow following shapes', () => {
    // Adobe Illustrator exports an empty layer as `<g id="Layer_1"/>`. It must
    // be treated as an empty group, not an open <g>: otherwise the depth count
    // never balances, findMatchingClose returns -1, and the whole parse bails
    // out emitting zero shapes (the Microsoft Teams icon rendered blank).
    const svg = '<svg viewBox="0 0 10 10"><g id="Layer_1"/><rect width="10" height="10" fill="#f00"/></svg>';
    const icon = parseSvgIcon(svg);
    assert.equal(icon.Shapes.length, 1);
    assert.equal(icon.Shapes[0]!.Fill?.R, 0xff);
});
