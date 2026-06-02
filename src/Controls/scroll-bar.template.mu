// Default template for ScrollBar — Material-flavoured flat track with
// a rounded thumb. Sized by the parent on the long axis; the
// constructor's MeasureOverride pins the cross axis to the
// SCROLLBAR_THICKNESS constant.
//
// Template parts:
//   * PART_Track — the resting-state Border filling the whole bar; the
//                  consumer-visible "rail" surface.
//   * PART_Thumb — the draggable Border. ScrollBar wires IsMouseOver
//                  and drag-state listeners to swap Background between
//                  rest / hover / pressed tints.

ResourceDictionary {
    template x:key="DefaultScrollBar"[targettype=ScrollBar]{
        ScrollBarLayout x:name="PART_Layout"{
            Border x:name="PART_Track"
                  [ Background      = #f1f5f9,
                    CornerRadius    = 4,
                    BorderThickness = (0) ]
            Border x:name="PART_Thumb"
                  [ Background      = #cbd5e1,
                    CornerRadius    = 4,
                    BorderThickness = (0) ]
        }
    }
}
