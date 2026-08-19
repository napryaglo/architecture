import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Matrix, Point, Rect, Size, AlignmentAxis } from '../../../../runtime/index.js';
import { Border } from '../../../../basic/index.js';
import { Diagram } from '../../diagram.js';
import { PersistentGuidesAdorner } from '../persistent-guides-adorner.js';

describe('PersistentGuidesAdorner', () => {
    test('guide lines arrange to non-zero size', () => {
        Application.current = null; new Application();
        const diagram = new Diagram();
        const host = new Border();
        host.Width = 400; host.Height = 300;
        host.Measure(new Size(400, 300)); host.Arrange(new Rect(0, 0, 400, 300));
        const adorner = new PersistentGuidesAdorner(host, diagram);
        diagram.Guides = [
            { axis: AlignmentAxis.X, position: 120, glued: [] },
            { axis: AlignmentAxis.Y, position: 80,  glued: [] },
        ];
        adorner.Measure(new Size(400, 300)); adorner.Arrange(new Rect(0, 0, 400, 300));
        const pool = (adorner as unknown as { _pool: { RenderSize: Size }[] })._pool;
        assert.ok(pool[0].RenderSize.Height > 0 && pool[0].RenderSize.Width > 0);
        assert.ok(pool[1].RenderSize.Width > 0 && pool[1].RenderSize.Height > 0);
    });
    test('positions project through the content->layer (camera) matrix', () => {
        Application.current = null; new Application();
        const diagram = new Diagram();
        const host = new Border();
        host.Width = 400; host.Height = 300;
        host.Measure(new Size(400, 300)); host.Arrange(new Rect(0, 0, 400, 300));
        const adorner = new PersistentGuidesAdorner(host, diagram);
        const m = Matrix.Scale(1.5, 1.5).Multiply(Matrix.Translate(40, 25));
        adorner._setAdornedToLayerMatrix(m);
        diagram.Guides = [{ axis: AlignmentAxis.X, position: 100, glued: [] }];
        adorner.Measure(new Size(400, 300)); adorner.Arrange(new Rect(0, 0, 400, 300));
        const pool = (adorner as unknown as { _pool: { ArrangedRect: Rect }[] })._pool;
        const expX = m.Transform(new Point(100, 0)).X;
        assert.ok(Math.abs(pool[0].ArrangedRect.X - (expX - 0.5)) < 0.6);
    });
});
