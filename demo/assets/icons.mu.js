import { ResourceDictionary } from "@pragmatic-lab/mural/runtime";
import { EllipseGeometry, GeometryGroup, LineGeometry, LineSegment, PathFigure, PathGeometry, Point, Rect, RectangleGeometry } from "@pragmatic-lab/mural/visual-engine";


const _gate_Icons = Symbol("Icons.ctor");
export class Icons extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_Icons) {
            throw new Error("Icons is private — use Icons.Clone()");
        }
    }
    static Clone() {
        const t = new Icons(_gate_Icons);
        const _inc0 = new GeometryGroup([new RectangleGeometry(new Rect(11, 3, 2, 18), 0, 0), new RectangleGeometry(new Rect(5, 4, 14, 5), 0, 0), new RectangleGeometry(new Rect(7, 13, 10, 5), 0, 0)]);
        t.Set("alignCenter", _inc0);
        const _inc1 = new GeometryGroup([new RectangleGeometry(new Rect(3, 3, 2, 18), 0, 0), new RectangleGeometry(new Rect(7, 4, 14, 5), 0, 0), new RectangleGeometry(new Rect(7, 13, 10, 5), 0, 0)]);
        t.Set("alignLeft", _inc1);
        const _inc2 = new GeometryGroup([new RectangleGeometry(new Rect(3, 11, 18, 2), 0, 0), new RectangleGeometry(new Rect(4, 5, 5, 14), 0, 0), new RectangleGeometry(new Rect(13, 7, 5, 10), 0, 0)]);
        t.Set("alignMiddle", _inc2);
        const _inc3 = new GeometryGroup([new RectangleGeometry(new Rect(19, 3, 2, 18), 0, 0), new RectangleGeometry(new Rect(3, 4, 14, 5), 0, 0), new RectangleGeometry(new Rect(7, 13, 10, 5), 0, 0)]);
        t.Set("alignRight", _inc3);
        const _inc4 = new GeometryGroup([new RectangleGeometry(new Rect(3, 3, 18, 2), 0, 0), new RectangleGeometry(new Rect(4, 7, 5, 14), 0, 0), new RectangleGeometry(new Rect(13, 7, 5, 10), 0, 0)]);
        t.Set("alignTop", _inc4);
        const _inc5 = new GeometryGroup([new RectangleGeometry(new Rect(3, 4, 4, 16), 0, 0), new RectangleGeometry(new Rect(10, 4, 4, 16), 0, 0), new RectangleGeometry(new Rect(17, 4, 4, 16), 0, 0)]);
        t.Set("distributeHorizontal", _inc5);
        const _inc6 = new GeometryGroup([new RectangleGeometry(new Rect(4, 3, 16, 4), 0, 0), new RectangleGeometry(new Rect(4, 10, 16, 4), 0, 0), new RectangleGeometry(new Rect(4, 17, 16, 4), 0, 0)]);
        t.Set("distributeVertical", _inc6);
        const _inc7 = new GeometryGroup([new RectangleGeometry(new Rect(2, 2, 20, 20), 0, 0), new RectangleGeometry(new Rect(5, 6, 6, 6), 0, 0), new RectangleGeometry(new Rect(13, 12, 6, 6), 0, 0)]);
        t.Set("group", _inc7);
        const _inc8 = new PathGeometry([new PathFigure(new Point(12, 3), [new LineSegment(new Point(2, 12)), new LineSegment(new Point(4, 12)), new LineSegment(new Point(4, 21)), new LineSegment(new Point(10, 21)), new LineSegment(new Point(10, 14)), new LineSegment(new Point(14, 14)), new LineSegment(new Point(14, 21)), new LineSegment(new Point(20, 21)), new LineSegment(new Point(20, 12)), new LineSegment(new Point(22, 12))], true)]);
        t.Set("home", _inc8);
        const _inc9 = new GeometryGroup([new EllipseGeometry(new Point(10, 10), 6, 6), new LineGeometry(new Point(14.5, 14.5), new Point(20, 20))]);
        t.Set("search", _inc9);
        const _inc10 = new PathGeometry([new PathFigure(new Point(12, 2), [new LineSegment(new Point(15, 9)), new LineSegment(new Point(22, 9)), new LineSegment(new Point(16.5, 13.5)), new LineSegment(new Point(18.5, 21)), new LineSegment(new Point(12, 17)), new LineSegment(new Point(5.5, 21)), new LineSegment(new Point(7.5, 13.5)), new LineSegment(new Point(2, 9)), new LineSegment(new Point(9, 9))], true)]);
        t.Set("star", _inc10);
        const _inc11 = new GeometryGroup([new RectangleGeometry(new Rect(3, 4, 8, 8), 0, 0), new RectangleGeometry(new Rect(13, 12, 8, 8), 0, 0)]);
        t.Set("ungroup", _inc11);
        return t;
    }
}
