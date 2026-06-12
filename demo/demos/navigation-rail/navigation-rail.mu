import NavigationRailVM from "./navigation-rail-vm.mjs"

// navigation-rail.mu — M3 NavigationRail showcase. A vertical
// destination strip on the left bound to a VM-owned Destinations
// collection; SelectedDataItem rides two-way to the VM's
// SelectedItem; the right pane shows the currently-active label.
//
// Composed-markup is exercised below by giving each NavigationItem a
// Label + an Icon TextBlock — the data-driven shape with string Items
// is covered by unit tests in src/framework/tests/navigation.test.ts
// to avoid this demo paying double for the same coverage.

resources NavigationRailDemo {

    DataTemplate x:key="NavigationRailTemplate" [DataType=NavigationRailVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant,
                BorderThickness=(1)]{
            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="NavigationRail — M3 vertical destination strip with selectable items.",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                // Rail (left) + active-label readout (right)
                DockPanel [LastChildFill=true] {
                    NavigationRail [DockPanel.Dock=Left,
                                    SelectedDataItem=$SelectedItem] {
                        NavigationItem [Label="Home"] {
                            TextBlock [Text="🏠", FontSize=22]
                        }
                        NavigationItem [Label="Search"] {
                            TextBlock [Text="🔍", FontSize=22]
                        }
                        NavigationItem [Label="Library"] {
                            TextBlock [Text="📚", FontSize=22]
                        }
                        NavigationItem [Label="Settings"] {
                            TextBlock [Text="⚙", FontSize=22]
                        }
                    }

                    StackPanel [Orientation=Vertical,
                                VerticalAlignment=Center,
                                HorizontalAlignment=Center] {
                        TextBlock [Text="Active destination",
                                   FontSize=12,
                                   Foreground=@OnSurfaceVariant,
                                   HorizontalAlignment=Center]
                        TextBlock [Text=$ActiveLabel,
                                   FontSize=40, FontWeight=Bold,
                                   Foreground=@OnSurface,
                                   HorizontalAlignment=Center,
                                   Margin=(0,8,0,0)]
                    }
                }
            }
        }
    }
}
