#!/usr/bin/env python3
"""Toolchain orchestrator — builds a project described by `<project>/<project>.proj.yaml`.

A project contains one or more *models* (each declaring a `meta-model:` —
`enterprise-architecture` or `bpmn`); each model owns a set of *views*. The
orchestrator dispatches per meta-model:

  - Model compile: `COMPILER_REGISTRY[meta-model]` picks the script (the
    architecture compiler vs the BPMN compiler) and the output suffix.
  - View compile: branches on whether the view declares `model-template:`.
    Template-driven views run the registered generator (e.g.
    `(bpmn, auto-layout) -> bpmn_engine/visual_compiler/visual_compiler.py`)
    against the compiled model directly into a scene YAML, then through the
    renderer. Source-driven views (the architecture default) run the
    existing `view_compiler -> markup_compiler --model -> renderer` chain.
  - Sequence diagrams + scenario tree in the manifest are
    enterprise-architecture-only (BPMN doesn't model scenarios).

Finally generates a viewer manifest (auto-derived from each compiled model)
and, in release mode, a single self-contained `architecture-viewer.html`.

Configurations:
    debug   (default) — outputs land in <project>/output/debug/
                        and the architecture-viewer is served via HTTP
                        (fetches the manifest at runtime).
    release (--release) — outputs land in <project>/output/release/
                          AND a self-contained architecture-viewer.html
                          is generated (manifest + every SVG inlined).

Usage:
    python toolchain/build.py <project-dir>
    python toolchain/build.py <project-dir> --release
"""
from __future__ import annotations
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

TOOLCHAIN = Path(__file__).resolve().parent.parent
PY        = sys.executable

MODEL_COMPILER        = TOOLCHAIN / "modeling_engine" / "Compiler" / "model_compiler.py"
BPMN_COMPILER         = TOOLCHAIN / "bpmn_engine" / "Compiler" / "bpmn_compiler.py"
VIEW_COMPILER         = TOOLCHAIN / "visual_engine" / "markup" / "view_compiler" / "view_compiler.py"
MARKUP_COMPILER       = TOOLCHAIN / "visual_engine" / "markup" / "markup_compiler" / "markup_compiler.py"
BPMN_VISUAL_COMPILER  = TOOLCHAIN / "bpmn_engine" / "visual_compiler" / "visual_compiler.py"
RENDERER              = TOOLCHAIN / "visual_engine" / "renderer" / "render.py"
SEQUENCE_RENDERER     = TOOLCHAIN / "visual_engine" / "sequence_renderer" / "render.py"
DRAWIO_RENDERER       = TOOLCHAIN / "visual_engine" / "drawio_renderer" / "render.py"
VIEWER_DIR            = TOOLCHAIN / "architecture-viewer"

# Meta-model dispatch tables. Keep these explicit rather than importing
# from `adl/meta-models/<mm>/meta-model.yaml` — the orchestrator needs
# to know the script paths anyway, and the spec yaml today is descriptive
# only (no machine-readable executor paths). When a third meta-model
# arrives, register it here.
META_MODEL_ARCH = "enterprise-architecture"
META_MODEL_BPMN = "bpmn"
DEFAULT_META_MODEL = META_MODEL_ARCH

# (meta-model) -> {compiler script, output suffix}. The suffix is what
# distinguishes `<id>.arch.compiled.yaml` from `<id>.bpmn.compiled.yaml`
# — keeps the build dir self-describing without a separate sidecar.
COMPILER_REGISTRY: dict[str, dict] = {
    META_MODEL_ARCH: {"script": MODEL_COMPILER, "suffix": "arch.compiled.yaml"},
    META_MODEL_BPMN: {"script": BPMN_COMPILER,  "suffix": "bpmn.compiled.yaml"},
}

# (meta-model, template-name) -> generator script. A template generator
# takes a compiled model YAML and emits a scene-graph YAML the existing
# renderer consumes — same contract as `markup_compiler`'s output, so
# the renderer step downstream is shared.
TEMPLATE_REGISTRY: dict[tuple[str, str], Path] = {
    (META_MODEL_BPMN, "auto-layout"): BPMN_VISUAL_COMPILER,
}

# Meta-models that produce scenarios. Drives the sequence-diagram pass
# and the manifest's scenario tree — both arch-only today.
META_MODELS_WITH_SCENARIOS = {META_MODEL_ARCH}

# Single-view mode supports these output formats. SVG is the renderer's
# native output; DRAWIO is a separate emit pass over the compiled scene
# graph plus the compiled model (needed for labels). Adding a new target
# means writing an emitter and registering it in `EMIT_SINGLE_VIEW`.
SINGLE_VIEW_FORMATS = ("svg", "drawio")

# Slug regex for sequence ids — must match `model_compiler._slug_sequence_id`
# so the manifest's sequence ids agree with the ones the model_compiler stamps
# on connectors.
SLUG_NON_ALNUM = re.compile(r"[^a-z0-9]+")
# `view $<id>` directive in a .view file — one per file, near the top.
VIEW_DECL_RE   = re.compile(r"^\s*view\s+\$([A-Za-z_][\w\-]*)", re.MULTILINE)


def run(args, label):
    print(f"  -> {label}")
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(f"FAILED: {label} (exit {result.returncode})")


def load_descriptor(project_dir: Path) -> dict:
    descriptor = project_dir / f"{project_dir.name}.proj.yaml"
    if not descriptor.exists():
        raise SystemExit(f"ERROR: project descriptor not found: {descriptor}")
    return yaml.safe_load(descriptor.read_text(encoding="utf-8")) or {}


def validate_descriptor(desc: dict, project_dir: Path) -> None:
    """Schema-level checks: model ids unique within project, view ids unique
    within each model, required fields present. Also cross-checks each model
    source's `meta.meta-model` against the descriptor's `models[].meta-model`
    when both are set — the two must agree, otherwise the project is
    self-contradicting before any compiler even runs."""
    model_ids = set()
    for m in desc.get("models") or []:
        mid = m.get("id")
        if not mid:
            raise SystemExit("ERROR: each model must have an `id:`")
        if mid in model_ids:
            raise SystemExit(f"ERROR: duplicate model id `{mid}`")
        model_ids.add(mid)
        if not m.get("source"):
            raise SystemExit(f"ERROR: model `{mid}` is missing `source:`")
        view_ids = set()
        for v in m.get("views") or []:
            vid = v.get("id")
            if not vid:
                raise SystemExit(f"ERROR: model `{mid}` has a view with no `id:`")
            if vid in view_ids:
                raise SystemExit(f"ERROR: model `{mid}` has duplicate view id `{vid}`")
            view_ids.add(vid)
            # `source:` and `model-template:` are mutually exclusive per the
            # view spec invariant (adl/meta-models/*/concepts/{view,bpmn-view}.yaml).
            # A view is either hand-authored (DSL source) or
            # framework-generated (template) — both being set is ambiguous
            # about which wins, so reject before any compile work happens.
            if v.get("source") and v.get("model-template"):
                raise SystemExit(
                    f"ERROR: model `{mid}` view `{vid}` declares both "
                    f"`source:` and `model-template:` — they are mutually "
                    f"exclusive. Pick one."
                )

        # Cross-check meta-model between descriptor and file. The file is
        # authoritative for "what meta-model does this content follow"; the
        # descriptor declaration exists so the orchestrator can pick a
        # compiler without parsing every source first. Disagreement means
        # one of them is wrong — fail loudly rather than silently dispatch
        # the wrong compiler.
        desc_mm = m.get("meta-model")
        src = project_dir / m["source"]
        if src.exists():
            try:
                src_doc = yaml.safe_load(src.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError as e:
                raise SystemExit(f"ERROR: model `{mid}` source `{src}` is not valid YAML: {e}")
            file_mm = ((src_doc.get("meta") or {}) if isinstance(src_doc, dict) else {}).get("meta-model")
            if desc_mm and file_mm and desc_mm != file_mm:
                raise SystemExit(
                    f"ERROR: model `{mid}`: descriptor declares "
                    f"`meta-model: {desc_mm}` but source file `{src}` declares "
                    f"`meta.meta-model: {file_mm}`. Reconcile the two."
                )


def model_source(project_dir: Path, model: dict) -> Path:
    return project_dir / model["source"]


def view_source(project_dir: Path, model: dict, view: dict) -> Path:
    """Resolve a view file path. Default convention is
    `<project>/models/<model.id>/views/<view.id>.view`; explicit `view.source:`
    overrides for unusual layouts."""
    if "source" in view:
        return project_dir / view["source"]
    return project_dir / "models" / model["id"] / "views" / f"{view['id']}.view"


def validate_view_binding(view_path: Path, expected_meta_id: str) -> None:
    """A view file's `view $<id>` directive must match the model's `meta.id`.
    This is the tight-coupling rule: a view dropped into the wrong model
    folder errors instead of silently rendering with the wrong scenarios."""
    text = view_path.read_text(encoding="utf-8")
    m = VIEW_DECL_RE.search(text)
    if not m:
        raise SystemExit(f"ERROR: {view_path} has no `view $<id>` declaration")
    actual = m.group(1)
    if actual != expected_meta_id:
        raise SystemExit(
            f"ERROR: {view_path}: `view ${actual}` does not match its model's "
            f"meta.id `{expected_meta_id}`"
        )


def slug_sequence_id(title: str, fallback_idx: int) -> str:
    if isinstance(title, str) and title.strip():
        slug = SLUG_NON_ALNUM.sub("-", title.lower()).strip("-")
        if slug:
            return slug
    return f"seq-{fallback_idx + 1}"


def model_meta_model(model: dict) -> str:
    """Resolve a model's meta-model. Descriptor wins (the orchestrator
    needs to pick a compiler before parsing the source); when absent,
    default to `enterprise-architecture` for back-compat with descriptors
    written before the meta-model field existed. The cross-check in
    `validate_descriptor` already catches descriptor/source disagreement,
    so by the time this is called either the value is consistent or
    we've exited."""
    return model.get("meta-model") or DEFAULT_META_MODEL


def compile_model(project_dir: Path, model: dict, build_dir: Path) -> tuple[Path, dict]:
    """Run the meta-model's compiler on a single model. Returns the
    compiled YAML path plus the loaded compiled dict (used by the manifest
    gen and downstream view passes). Compiler choice + output suffix come
    from `COMPILER_REGISTRY[meta-model]` — adding a third meta-model is a
    one-line registry entry."""
    src = model_source(project_dir, model)
    if not src.exists():
        raise SystemExit(f"ERROR: model source not found: {src}")
    mm = model_meta_model(model)
    entry = COMPILER_REGISTRY.get(mm)
    if entry is None:
        raise SystemExit(
            f"ERROR: model `{model['id']}` declares meta-model `{mm}` "
            f"which has no registered compiler "
            f"(known: {sorted(COMPILER_REGISTRY)})"
        )
    out_dir  = build_dir / model["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    compiled = out_dir / f"{model['id']}.{entry['suffix']}"
    run([PY, entry["script"], str(src), "--output", str(compiled)],
        f"{entry['script'].stem} {model['id']}")
    compiled_doc = yaml.safe_load(compiled.read_text(encoding="utf-8")) or {}
    return compiled, compiled_doc


def compile_sequence_diagrams(model: dict, compiled_model_path: Path,
                              compiled_arch: dict, build_dir: Path) -> None:
    """Auto-generate one sequence-diagram SVG per (scenario, sequence) tuple
    in the model. Outputs land at
    `<build>/<model.id>/sequences/<scenario.id>/<sequence.id>.svg`. The
    manifest generator picks them up from disk via the same naming.

    Skipped for meta-models that don't carry scenarios (BPMN today). The
    sequence-diagram concept is enterprise-architecture-specific."""
    if model_meta_model(model) not in META_MODELS_WITH_SCENARIOS:
        return
    mid = model["id"]
    out_root = build_dir / mid / "sequences"
    for sid, sdef in (compiled_arch.get("scenarios") or {}).items():
        if not isinstance(sdef, dict):
            continue
        scen_dir = out_root / sid
        scen_dir.mkdir(parents=True, exist_ok=True)
        seen_seq_ids = {}
        for j, raw in enumerate(sdef.get("sequences") or []):
            inner = raw.get("sequence") if isinstance(raw, dict) and "sequence" in raw else raw
            if not isinstance(inner, dict):
                continue
            title = inner.get("Title") or inner.get("title")
            if not title:
                continue
            seq_id = slug_sequence_id(title, j)
            # Disambiguate slug collisions consistently with the model
            # compiler. Both ends generate the same disambiguated id this way.
            if seq_id in seen_seq_ids:
                seen_seq_ids[seq_id] += 1
                seq_id = f"{seq_id}-{seen_seq_ids[seq_id]}"
            else:
                seen_seq_ids[seq_id] = 1
            svg_path = scen_dir / f"{seq_id}.svg"
            run([PY, SEQUENCE_RENDERER, str(compiled_model_path),
                 "--scenario", sid, "--sequence", seq_id,
                 "-o", str(svg_path)],
                f"sequence_renderer {mid}/{sid}/{seq_id}")


def compile_one_view(project_dir: Path, model: dict, view: dict,
                     compiled_model_path: Path, expected_meta_id: str,
                     build_dir: Path) -> tuple[Path | None, Path, Path]:
    """Compile ONE view. Two paths:

    Template-driven (view declares `model-template:`): look up the
    registered generator for `(meta-model, template-name)` and run it
    against the compiled model directly into a scene YAML, then renderer.
    No view_compiler / markup_compiler involvement — the template IS the
    view definition. The .view file at the conventional path is not
    consulted (descriptor's `model-template:` is authoritative).

    Source-driven (no `model-template:`): the existing chain
    `view_compiler -> markup_compiler --model -> renderer`. Hand-authored
    .view DSL.

    Returns `(intermediate, scene-or-compiled-markup, svg)` paths. The
    first slot is `None` for template-driven views (no markup
    intermediate) and the markup path for source-driven views, kept so
    single-view mode can also emit drawio from the compiled markup.
    Mutual exclusion of `source:` and `model-template:` is enforced in
    `validate_descriptor`."""
    vid = view["id"]
    out_dir  = build_dir / model["id"] / "views" / vid
    out_dir.mkdir(parents=True, exist_ok=True)
    svg      = out_dir / f"{vid}.svg"
    label = f"{model['id']}/{vid}"

    template_name = view.get("model-template")
    if template_name:
        mm = model_meta_model(model)
        gen_script = TEMPLATE_REGISTRY.get((mm, template_name))
        if gen_script is None:
            raise SystemExit(
                f"ERROR: view `{label}` declares model-template "
                f"`{template_name}` for meta-model `{mm}`, but no generator "
                f"is registered for that combination "
                f"(known: {sorted(TEMPLATE_REGISTRY)})"
            )
        scene = out_dir / f"{vid}.scene.yaml"
        run([PY, gen_script, str(compiled_model_path), "-o", str(scene)],
            f"{gen_script.stem} {label}")
        run([PY, RENDERER, str(scene), "-o", str(svg)],
            f"render {label}")
        # No markup intermediate — return the scene as the second slot.
        return (None, scene, svg)

    # Source-driven path.
    src = view_source(project_dir, model, view)
    if not src.exists():
        raise SystemExit(f"ERROR: view source not found: {src}")
    validate_view_binding(src, expected_meta_id)

    markup   = out_dir / f"{vid}.gen.markup"
    compiled = out_dir / f"{vid}.gen_compiled.markup"
    run([PY, VIEW_COMPILER,   src,    "-o", markup],   f"view_compiler {label}")
    run([PY, MARKUP_COMPILER, markup, "-o", compiled,
         "--model", str(compiled_model_path)],         f"markup_compiler {label}")
    run([PY, RENDERER,        compiled, "-o", svg],    f"render {label}")
    return (markup, compiled, svg)


def compile_views(project_dir: Path, model: dict,
                  compiled_model_path: Path, compiled_arch: dict,
                  build_dir: Path) -> None:
    """For each view of a model: enforce the view-binding rule, then run
    view_compiler -> markup_compiler --model -> render. Outputs land at
    `<build>/<model.id>/views/<view.id>/<view.id>.svg`."""
    expected_meta_id = (compiled_arch.get("meta") or {}).get("id")
    if not expected_meta_id:
        raise SystemExit(f"ERROR: model `{model['id']}` has no meta.id in its compiled output")

    for view in model.get("views") or []:
        compile_one_view(project_dir, model, view, compiled_model_path,
                         expected_meta_id, build_dir)


def build_scenario_tree(arch: dict, model_id: str) -> list[dict]:
    """Pull (scenario, sequences) out of a compiled architecture for the
    manifest. Sequence ids are slugged from Title; this must match the
    model_compiler's slug so the manifest entries align with the slugs the
    compiler stamped on each connector's `flows`. Each sequence also carries
    `src` (path to the auto-generated sequence diagram SVG) and `handle` (the
    URL identifier the viewer uses to address the diagram)."""
    out = []
    for sid, sdef in (arch.get("scenarios") or {}).items():
        if not isinstance(sdef, dict):
            continue
        sequences = []
        seen = {}
        for j, raw in enumerate(sdef.get("sequences") or []):
            inner = raw.get("sequence") if isinstance(raw, dict) and "sequence" in raw else raw
            if not isinstance(inner, dict):
                continue
            title = inner.get("Title") or inner.get("title")
            if not title:
                continue
            seq_id = slug_sequence_id(title, j)
            if seq_id in seen:
                seen[seq_id] += 1
                seq_id = f"{seq_id}-{seen[seq_id]}"
            else:
                seen[seq_id] = 1
            sequences.append({
                "id":     seq_id,
                "label":  str(title),
                "src":    f"{model_id}/sequences/{sid}/{seq_id}.svg",
                "handle": f"{model_id}/sequences/{sid}/{seq_id}",
                "dom-id": f"{model_id}__seq__{sid}__{seq_id}",
            })
        out.append({
            "id":        sid,
            "label":     sdef.get("label", sid),
            "sequences": sequences,
        })
    return out


def generate_manifest(descriptor: dict, model_archs: dict[str, dict],
                      manifest_path: Path) -> dict:
    """Auto-derive viewer-manifest.json. Curated bits (model order, view list
    + labels) come from the descriptor; scenario trees come from each model's
    compiled architecture."""
    models_out = []
    for m in descriptor.get("models") or []:
        mid = m["id"]
        compiled = model_archs[mid]
        views_out = [
            {
                "id":     v["id"],
                "label":  v.get("label", v["id"]),
                "handle": f"{mid}/{v['id']}",
                "dom-id": f"{mid}__{v['id']}",
                "src":    f"{mid}/views/{v['id']}/{v['id']}.svg",
            }
            for v in (m.get("views") or [])
        ]
        # Scenario tree is enterprise-architecture-specific. BPMN models
        # carry an empty list — the manifest schema stays uniform so the
        # viewer doesn't need a meta-model branch.
        if model_meta_model(m) in META_MODELS_WITH_SCENARIOS:
            scenarios = build_scenario_tree(compiled, mid)
        else:
            scenarios = []
        models_out.append({
            "id":        mid,
            "label":     m.get("label", mid),
            "views":     views_out,
            "scenarios": scenarios,
        })

    default = None
    if models_out and models_out[0]["views"]:
        default = {"model": models_out[0]["id"], "view": models_out[0]["views"][0]["id"]}

    manifest = {
        "title":   descriptor.get("title", descriptor.get("id", "Architecture")),
        "default": default,
        "models":  models_out,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def copy_manifest_to_viewer(manifest_path: Path, build_dir: Path) -> None:
    """Mirror the freshly-built manifest into the toolchain's
    architecture-viewer/ so the dev server's default URL works without query
    params. The src paths in the canonical manifest are relative to the
    build dir; rewrite them to be relative to the viewer dir for the mirror.
    The copy is gitignored (the canonical artifact lives under
    <project>/output/<config>/)."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    # `..` segments back up from architecture-viewer/ to repo root, then
    # forward into the project's build dir. os.path.relpath is the cleanest
    # way to compute this regardless of repo layout.
    import os
    rel_prefix = Path(os.path.relpath(build_dir, VIEWER_DIR)).as_posix()
    for m in manifest.get("models") or []:
        for v in m.get("views") or []:
            if "src" in v:
                v["src"] = f"{rel_prefix}/{v['src']}"
        for s in m.get("scenarios") or []:
            for q in s.get("sequences") or []:
                if "src" in q:
                    q["src"] = f"{rel_prefix}/{q['src']}"
    (VIEWER_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8")


def generate_release_bundle(manifest: dict, build_dir: Path) -> None:
    """Bundle the architecture-viewer into a single self-contained HTML so
    it works under file:// without a server. Inlines viewer.css/js, the
    manifest, and every model's view SVGs keyed by their relative `src`."""
    css_text  = (VIEWER_DIR / "viewer.css").read_text(encoding="utf-8")
    js_text   = (VIEWER_DIR / "viewer.js").read_text(encoding="utf-8")
    html_text = (VIEWER_DIR / "index.html").read_text(encoding="utf-8")

    # Inline both authored-view SVGs and auto-generated sequence diagrams so
    # the bundle works under file:// without any out-of-document fetches.
    inline_views = {}
    for m in manifest.get("models") or []:
        for v in m.get("views") or []:
            svg_path = build_dir / v["src"]
            if svg_path.exists():
                inline_views[v["src"]] = svg_path.read_text(encoding="utf-8")
        for s in m.get("scenarios") or []:
            for q in s.get("sequences") or []:
                src = q.get("src")
                if not src:
                    continue
                svg_path = build_dir / src
                if svg_path.exists():
                    inline_views[src] = svg_path.read_text(encoding="utf-8")

    inline_data = {"manifest": manifest, "views": inline_views}
    inline_payload = (
        '<script>\n'
        f'window.__INLINE_DATA__ = {json.dumps(inline_data)};\n'
        '</script>\n'
        '<script>\n'
        f'{js_text}\n'
        '</script>'
    )
    # Strip the original script tag from <head> and append the inlined
    # payload right before </body>. Inlining in place would lose the
    # `defer` semantics of the original tag — module-level
    # `document.getElementById` calls in viewer.js would run before the
    # DOM body is parsed, returning null and leaving an empty viewer
    # shell.
    bundled = (
        html_text
        .replace('<link rel="stylesheet" href="viewer.css"/>',
                 f'<style>\n{css_text}\n</style>')
        .replace('<script src="viewer.js" defer></script>', '')
        .replace('</body>', f'{inline_payload}\n</body>')
    )
    out = build_dir / "architecture-viewer.html"
    out.write_text(bundled, encoding="utf-8")
    print(f"  wrote {out.relative_to(build_dir.parent.parent)} "
          f"({out.stat().st_size:,} bytes)")


def build_single_view(project_dir: Path, descriptor: dict, build_dir: Path,
                      view_handle: str, formats: list[str]) -> None:
    """Compile exactly one view in the requested formats. Skips the manifest,
    sequence diagrams, and release bundle — purely a "this one diagram, in
    these formats" path. Used by `--view <model.id>/<view.id>`."""
    parts = view_handle.split("/", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise SystemExit("ERROR: --view requires the form `<model.id>/<view.id>`")
    model_id, view_id = parts

    model = next((m for m in (descriptor.get("models") or []) if m.get("id") == model_id), None)
    if model is None:
        raise SystemExit(f"ERROR: model `{model_id}` not in descriptor")
    view = next((v for v in (model.get("views") or []) if v.get("id") == view_id), None)
    if view is None:
        raise SystemExit(f"ERROR: view `{view_id}` not in model `{model_id}`")

    print(f"single-view build: {model_id}/{view_id}    formats: {', '.join(formats)}")

    # Model compile is mandatory — markup_compiler --model needs the
    # compiled architecture for the (from,to) → flows index.
    print("[1/2] model")
    compiled_model_path, arch = compile_model(project_dir, model, build_dir)
    expected_meta_id = (arch.get("meta") or {}).get("id")
    if not expected_meta_id:
        raise SystemExit(f"ERROR: model `{model_id}` has no meta.id in compiled output")

    print("[2/2] view + format emit")
    markup, intermediate, svg = compile_one_view(
        project_dir, model, view, compiled_model_path, expected_meta_id, build_dir)

    out_dir = svg.parent
    rel = lambda p: p.relative_to(project_dir)
    for fmt in formats:
        if fmt == "svg":
            # Always emitted by compile_one_view — just report it.
            print(f"  -> svg     : {rel(svg)}")
        elif fmt == "drawio":
            # The drawio renderer consumes a compiled markup; template-
            # driven views go straight from compiled model to scene yaml
            # without producing a markup, so drawio export isn't available
            # for them today. Fail loudly rather than emit a broken file.
            if markup is None:
                raise SystemExit(
                    f"ERROR: drawio export not supported for template-driven "
                    f"view `{model_id}/{view_id}` — drawio_renderer needs a "
                    f"compiled markup, but template views skip that stage."
                )
            drawio_path = out_dir / f"{view_id}.drawio"
            run([PY, DRAWIO_RENDERER, str(intermediate),
                 "--model", str(compiled_model_path),
                 "-o",      str(drawio_path),
                 "--name",  f"{model_id}/{view_id}"],
                f"drawio_renderer {model_id}/{view_id}")
            print(f"  -> drawio  : {rel(drawio_path)}")
        else:
            raise SystemExit(f"ERROR: unsupported --format `{fmt}` "
                             f"(supported: {', '.join(SINGLE_VIEW_FORMATS)})")

    print("\nsingle-view build OK.")


def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("project", help="Path to the project directory (contains <name>.proj.yaml)")
    parser.add_argument("--release", action="store_true",
                        help="Build the self-contained viewer bundle. "
                             "Ignored in --view (single-view) mode.")
    parser.add_argument("--view",
                        help="Single-view mode: build only this view. "
                             "Form: <model.id>/<view.id>. Skips manifest, "
                             "sequence diagrams, and release bundle.")
    parser.add_argument("--format", action="append", default=None,
                        choices=SINGLE_VIEW_FORMATS,
                        help="Output format for --view mode. Repeat for "
                             "multiple. Defaults to svg if omitted.")
    args = parser.parse_args()

    project_dir = Path(args.project).resolve()
    if not project_dir.is_dir():
        raise SystemExit(f"ERROR: project directory not found: {project_dir}")

    descriptor = load_descriptor(project_dir)
    validate_descriptor(descriptor, project_dir)

    # ── Single-view mode ─────────────────────────────────────────
    # Lives in its own branch because the full project build does
    # several things (manifest, sequence diagrams, release bundle)
    # that don't make sense for a one-view-one-format request.
    if args.view:
        if args.release:
            print("WARNING: --release ignored in --view mode (single-view "
                  "doesn't produce a viewer bundle).")
        formats = args.format or ["svg"]
        # Single-view always builds into the debug subtree — there's no
        # "release single view" distinction since the bundling is what
        # release adds and we skip it here.
        output_root = project_dir / (descriptor.get("build", {}).get("output") or "output")
        build_dir   = output_root / "debug"
        build_dir.mkdir(parents=True, exist_ok=True)
        build_single_view(project_dir, descriptor, build_dir, args.view, formats)
        return

    # ── Full project build ───────────────────────────────────────
    config = "release" if args.release else "debug"
    output_root = project_dir / (descriptor.get("build", {}).get("output") or "output")
    build_dir   = output_root / config
    build_dir.mkdir(parents=True, exist_ok=True)

    n_models = len(descriptor.get("models") or [])
    total_steps = 2 + (1 if args.release else 0)   # models, manifest, [release bundle]
    print(f"build config: {config}    project: {descriptor.get('id', project_dir.name)}    "
          f"models: {n_models}")

    print(f"[1/{total_steps}] models + views + sequence diagrams")
    model_archs = {}
    for m in descriptor.get("models") or []:
        compiled_path, arch = compile_model(project_dir, m, build_dir)
        model_archs[m["id"]] = arch
        compile_views(project_dir, m, compiled_path, arch, build_dir)
        compile_sequence_diagrams(m, compiled_path, arch, build_dir)

    print(f"[2/{total_steps}] viewer manifest")
    manifest_path = build_dir / "viewer-manifest.json"
    manifest = generate_manifest(descriptor, model_archs, manifest_path)
    copy_manifest_to_viewer(manifest_path, build_dir)
    print(f"  wrote {manifest_path.relative_to(project_dir)}")

    if args.release:
        print(f"[3/{total_steps}] release bundle")
        generate_release_bundle(manifest, build_dir)

    print("\nbuild OK.")


if __name__ == "__main__":
    main()
