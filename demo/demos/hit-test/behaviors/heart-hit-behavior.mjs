export function attachHeartHit(heart, vm) {
    const onDown = () => { vm.IsToggled = !vm.IsToggled; };
    heart.AddRoutedEventListener('MouseLeftButtonDown', onDown);
    return function detach() {
        heart.RemoveRoutedEventListener('MouseLeftButtonDown', onDown);
    };
}
