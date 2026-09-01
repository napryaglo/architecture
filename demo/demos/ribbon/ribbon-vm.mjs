// ribbon demo view-model.
//
// A thin DiagramDocument subclass whose ONLY job is to give the ribbon demo
// its own DataTemplate key: the demo platform presents a demo's DataContext
// through an implicit `[DataType = …]` template, and the Diagrammer demo
// already owns `[DataType = DiagramDocument]`. Subclassing yields a distinct
// type (RibbonDemoDoc) so the two templates never collide.
//
// There is no command plumbing here on purpose. The whole "command palette"
// the ribbon drives lives on the Diagram CONTROL (Align*/Combine*/Group*/
// text-format RelayCommand DPs); the markup binds each ribbon button to it by
// ElementName (`$canvas.AlignLeftCommand`, …), so the VM only has to supply
// the Nodes collection it inherits from DiagramDocument.
import { DiagramDocument } from '@pragmatic-tech-ai/mural/framework';
export class RibbonDemoDoc extends DiagramDocument {
}
