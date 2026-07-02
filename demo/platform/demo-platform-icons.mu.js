import { ResourceDictionary } from "@visualisation-sub/mural/runtime";
import { ArcSegment, GeometryGroup, LineSegment, PathFigure, PathGeometry, Point, Rect, RectangleGeometry, Size, SweepDirection } from "@visualisation-sub/mural/visual-engine";


const _gate_DemoPlatformIcons = Symbol("DemoPlatformIcons.ctor");
export class DemoPlatformIcons extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_DemoPlatformIcons) {
            throw new Error("DemoPlatformIcons is private — use DemoPlatformIcons.Clone()");
        }
    }
    static Clone() {
        const t = new DemoPlatformIcons(_gate_DemoPlatformIcons);
        t.Set("AnimationIcon", new PathGeometry([new PathFigure(new Point(4, 12), [new ArcSegment(new Point(20, 12), new Size(8, 8), 0, true, SweepDirection.Counterclockwise), new ArcSegment(new Point(4, 12), new Size(8, 8), 0, true, SweepDirection.Counterclockwise)], true)]));
        t.Set("ControlsIcon", new PathGeometry([new PathFigure(new Point(4, 6), [new LineSegment(new Point(20, 6)), new LineSegment(new Point(20, 9)), new LineSegment(new Point(4, 9))], true), new PathFigure(new Point(4, 11), [new LineSegment(new Point(20, 11)), new LineSegment(new Point(20, 14)), new LineSegment(new Point(4, 14))], true), new PathFigure(new Point(4, 16), [new LineSegment(new Point(20, 16)), new LineSegment(new Point(20, 19)), new LineSegment(new Point(4, 19))], true)]));
        t.Set("DemosIcon", new GeometryGroup([new RectangleGeometry(new Rect(4, 4, 7, 7), 0, 0), new RectangleGeometry(new Rect(13, 4, 7, 7), 0, 0), new RectangleGeometry(new Rect(4, 13, 7, 7), 0, 0), new RectangleGeometry(new Rect(13, 13, 7, 7), 0, 0)]));
        t.Set("PatternsIcon", new PathGeometry([new PathFigure(new Point(12, 3), [new LineSegment(new Point(21, 12)), new LineSegment(new Point(12, 21)), new LineSegment(new Point(3, 12))], true)]));
        t.Set("StylesIcon", new PathGeometry([new PathFigure(new Point(12, 4), [new LineSegment(new Point(20, 20)), new LineSegment(new Point(4, 20))], true)]));
        return t;
    }
}
