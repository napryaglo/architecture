@echo off
REM Architecture Viewer — start a local HTTP server at the project root and
REM open the viewer in the default browser. Browsers block fetch() over
REM file://, so the viewer needs a real http:// origin.

setlocal
set PORT=8765
set ROOT=%~dp0..

echo Serving %ROOT% at http://localhost:%PORT%/
start "" "http://localhost:%PORT%/architecture-viewer/"
pushd "%ROOT%"
python -m http.server %PORT%
popd
