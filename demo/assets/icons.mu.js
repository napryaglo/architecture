import { ResourceDictionary } from "@visualisation-sub/mural/runtime";
import { EllipseGeometry, GeometryGroup, LineGeometry, LineSegment, PathFigure, PathGeometry, Point, Rect, RectangleGeometry } from "@visualisation-sub/mural/visual-engine";


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
        t.Set("alignCenter", new GeometryGroup([new RectangleGeometry(new Rect(11, 3, 2, 18), 0, 0), new RectangleGeometry(new Rect(5, 4, 14, 5), 0, 0), new RectangleGeometry(new Rect(7, 13, 10, 5), 0, 0)]));
        t.Set("alignLeft", new GeometryGroup([new RectangleGeometry(new Rect(3, 3, 2, 18), 0, 0), new RectangleGeometry(new Rect(7, 4, 14, 5), 0, 0), new RectangleGeometry(new Rect(7, 13, 10, 5), 0, 0)]));
        t.Set("alignMiddle", new GeometryGroup([new RectangleGeometry(new Rect(3, 11, 18, 2), 0, 0), new RectangleGeometry(new Rect(4, 5, 5, 14), 0, 0), new RectangleGeometry(new Rect(13, 7, 5, 10), 0, 0)]));
        t.Set("alignRight", new GeometryGroup([new RectangleGeometry(new Rect(19, 3, 2, 18), 0, 0), new RectangleGeometry(new Rect(3, 4, 14, 5), 0, 0), new RectangleGeometry(new Rect(7, 13, 10, 5), 0, 0)]));
        t.Set("alignTop", new GeometryGroup([new RectangleGeometry(new Rect(3, 3, 18, 2), 0, 0), new RectangleGeometry(new Rect(4, 7, 5, 14), 0, 0), new RectangleGeometry(new Rect(13, 7, 5, 10), 0, 0)]));
        t.Set("distributeHorizontal", new GeometryGroup([new RectangleGeometry(new Rect(3, 4, 4, 16), 0, 0), new RectangleGeometry(new Rect(10, 4, 4, 16), 0, 0), new RectangleGeometry(new Rect(17, 4, 4, 16), 0, 0)]));
        t.Set("distributeVertical", new GeometryGroup([new RectangleGeometry(new Rect(4, 3, 16, 4), 0, 0), new RectangleGeometry(new Rect(4, 10, 16, 4), 0, 0), new RectangleGeometry(new Rect(4, 17, 16, 4), 0, 0)]));
        t.Set("group", new GeometryGroup([new RectangleGeometry(new Rect(2, 2, 20, 20), 0, 0), new RectangleGeometry(new Rect(5, 6, 6, 6), 0, 0), new RectangleGeometry(new Rect(13, 12, 6, 6), 0, 0)]));
        t.Set("home", new PathGeometry([new PathFigure(new Point(12, 3), [new LineSegment(new Point(2, 12)), new LineSegment(new Point(4, 12)), new LineSegment(new Point(4, 21)), new LineSegment(new Point(10, 21)), new LineSegment(new Point(10, 14)), new LineSegment(new Point(14, 14)), new LineSegment(new Point(14, 21)), new LineSegment(new Point(20, 21)), new LineSegment(new Point(20, 12)), new LineSegment(new Point(22, 12))], true)]));
        t.Set("search", new GeometryGroup([new EllipseGeometry(new Point(10, 10), 6, 6), new LineGeometry(new Point(14.5, 14.5), new Point(20, 20))]));
        t.Set("star", new PathGeometry([new PathFigure(new Point(12, 2), [new LineSegment(new Point(15, 9)), new LineSegment(new Point(22, 9)), new LineSegment(new Point(16.5, 13.5)), new LineSegment(new Point(18.5, 21)), new LineSegment(new Point(12, 17)), new LineSegment(new Point(5.5, 21)), new LineSegment(new Point(7.5, 13.5)), new LineSegment(new Point(2, 9)), new LineSegment(new Point(9, 9))], true)]));
        t.Set("ungroup", new GeometryGroup([new RectangleGeometry(new Rect(3, 4, 8, 8), 0, 0), new RectangleGeometry(new Rect(13, 12, 8, 8), 0, 0)]));
        return t;
    }
}
