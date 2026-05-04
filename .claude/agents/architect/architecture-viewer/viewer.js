// Architecture Viewer — load a project manifest, render the active
// model's selected view inline, support zoom/pan/fullscreen.
//
// Manifest URL is taken from the ?manifest= query param, defaulting to
// ./manifest.json. Paths inside the manifest are resolved relative to
// the manifest URL.
//
// Manifest schema:
//   { "title": "<project title>",
//     "default": { "model": "<model.id>", "view": "<view.id>" },
//     "models": [
//       { "id": "<model.id>", "label": "<display>",
//         "views":     [ { "id", "label", "handle", "dom-id", "src" } ],
//         "scenarios": [ { "id", "label", "sequences": [ { "id", "label" } ] } ]
//       }
//     ] }
//
// URL state: ?view=<model.id>/<view.id> selects the active model+view.

const MIN_Z = 0.5;
const MAX_Z = 5.0;
const STEP  = 0.2;

const stage         = document.getElementById('stage');
const sizer         = document.getElementById('sizer');
const list          = document.getElementById('view-list');
const titleEl       = document.getElementById('manifest-title');
const labelEl       = document.getElementById('current-view-label');
const modelPicker   = document.getElementById('model-picker');
const zoomLabel     = document.getElementById('zoom-label');
const zoomToast     = document.getElementById('zoom-toast');
const emptyMsg      = document.getElementById('empty-msg');
const errorMsg      = document.getElementById('error-msg');
const scenarioList  = document.getElementById('scenario-list');
const scenarioEmpty = document.getElementById('scenario-empty');

let manifestBase = null;          // URL the manifest itself was loaded from (used as base for view src)
let models       = [];            // [{ id, label, views:[...], scenarios:[...] }, ...]
let modelById    = new Map();
let currentModelId = null;
// Stage content — the thing currently rendered in the central canvas.
// Two kinds: a model's authored view, or an auto-generated sequence diagram.
//   { kind: "view",    modelId, viewId }
//   { kind: "diagram", modelId, scenarioId, sequenceId }
let stageContent = null;
// scenarioTree mirrors the active model's scenarios for the right rail;
// rebuilt on every model switch.
let scenarioTree = [];

let zoom    = 1;
let panX    = 0;
let panY    = 0;
let toastTimer = null;

let dragging    = false;
let dragMoved   = false;
let dragOriginX = 0, dragOriginY = 0;
let dragPanX    = 0, dragPanY    = 0;

// ── Bootstrap ────────────────────────────────────────────────────────────
// `window.__INLINE_DATA__`, when present (set by the release-bundle script
// before this file runs), supplies manifest + per-view SVG content directly,
// so the viewer works under file:// without a server. The dev/debug build
// leaves it undefined and falls back to fetching from the network.
const INLINE = (typeof window !== 'undefined' ? window.__INLINE_DATA__ : null) || null;

async function init() {
  if (!INLINE && location.protocol === 'file:') {
    showError(
      "Browsers block fetch() under file://. Run architecture-viewer/serve.bat " +
      "(or: python -m http.server 8765 from the project root) and open " +
      "http://localhost:8765/architecture-viewer/ instead."
    );
    return;
  }

  let manifest;
  if (INLINE && INLINE.manifest) {
    manifest = INLINE.manifest;
  } else {
    const manifestUrl = new URL(
      new URLSearchParams(location.search).get('manifest') || 'manifest.json',
      location.href,
    );
    manifestBase = manifestUrl;
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (e) {
      showError(`Failed to load manifest from ${manifestUrl.pathname}: ${e.message}`);
      return;
    }
  }

  if (manifest.title) titleEl.textContent = manifest.title;
  models    = Array.isArray(manifest.models) ? manifest.models : [];
  modelById = new Map(models.map(m => [m.id, m]));

  if (models.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }

  populateModelPicker();

  // Resolve the initial (model, view) from the URL, falling back to the
  // manifest's `default`, then to the first model's first view. If a
  // requested handle doesn't resolve we don't crash — we just fall back.
  const requested = parseViewHandle(new URLSearchParams(location.search).get('view'));
  const initial   = resolveInitialSelection(requested, manifest.default);
  if (!initial) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  await selectModelAndView(initial.modelId, initial.viewId, /*pushUrl=*/ false);
}

function parseViewHandle(handle) {
  if (!handle || typeof handle !== 'string') return null;
  const slash = handle.indexOf('/');
  if (slash < 0) return null;
  return { modelId: handle.slice(0, slash), viewId: handle.slice(slash + 1) };
}

function resolveInitialSelection(requested, fallbackDefault) {
  // requested: {modelId, viewId} | null
  if (requested) {
    const m = modelById.get(requested.modelId);
    if (m && m.views && m.views.some(v => v.id === requested.viewId)) {
      return requested;
    }
  }
  if (fallbackDefault &&
      modelById.has(fallbackDefault.model) &&
      modelById.get(fallbackDefault.model).views.some(v => v.id === fallbackDefault.view)) {
    return { modelId: fallbackDefault.model, viewId: fallbackDefault.view };
  }
  // First model's first view — we already know models.length > 0, but a
  // model with no views is possible.
  for (const m of models) {
    if (m.views && m.views.length > 0) {
      return { modelId: m.id, viewId: m.views[0].id };
    }
  }
  return null;
}

function populateModelPicker() {
  modelPicker.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    modelPicker.appendChild(opt);
  }
  modelPicker.disabled = (models.length <= 1);
  modelPicker.addEventListener('change', () => {
    const m = modelById.get(modelPicker.value);
    if (!m || !m.views || m.views.length === 0) return;
    selectModelAndView(m.id, m.views[0].id);
  });
}

// ── Model + view + sequence-diagram selection ────────────────────────────

// Bring `currentModelId` up to date, rebuilding the sidebar + scenario rail
// (and clearing press state) when the user has switched models. Common to
// both `selectModelAndView` and `selectSequenceDiagram` so neither has to
// duplicate the rebuild logic.
function ensureModelActive(model) {
  if (model.id === currentModelId) return;
  currentModelId = model.id;
  if (modelPicker.value !== model.id) modelPicker.value = model.id;
  scenarioTree = (model.scenarios || []).map(s => ({
    id:        s.id,
    label:     s.label || s.id,
    sequences: (Array.isArray(s.sequences) ? s.sequences : [])
      .filter(q => q && q.id)
      .map(q => ({
        id:     q.id,
        label:  q.label || q.id,
        src:    q.src || null,
        handle: q.handle || null,
      })),
  }));
  pressedSequences = new Set();        // press state is scenario-tree-scoped
  buildSidebar(model);
  rebuildScenarioRail();
}

async function selectModelAndView(modelId, viewId, pushUrl = true) {
  const model = modelById.get(modelId);
  if (!model) return;
  const view  = (model.views || []).find(v => v.id === viewId);
  if (!view)  return;

  ensureModelActive(model);
  stageContent = { kind: "view", modelId, viewId };
  updateActiveStates();
  labelEl.textContent = view.label || view.id || '';

  if (pushUrl) {
    const url = new URL(location.href);
    url.searchParams.set('view', `${modelId}/${viewId}`);
    history.replaceState(null, '', url);
  }

  resetZoom();
  await loadStageSvg(view);
  // applyScenarioFilter colours the just-loaded view against the current
  // press state. For diagrams there's nothing to colour, but we still call
  // it so the rail's visual states stay in sync.
  applyScenarioFilter();
}

async function selectSequenceDiagram(modelId, scenarioId, sequenceId) {
  const model = modelById.get(modelId);
  if (!model) return;
  const scenario = (model.scenarios || []).find(s => s.id === scenarioId);
  if (!scenario) return;
  const sequence = (scenario.sequences || []).find(q => q.id === sequenceId);
  if (!sequence || !sequence.src) return;

  ensureModelActive(model);
  stageContent = { kind: "diagram", modelId, scenarioId, sequenceId };
  updateActiveStates();
  // Display label: scenario · sequence so the user knows what they're
  // looking at when the diagram swaps in.
  labelEl.textContent = `${scenario.label} · ${sequence.label}`;

  resetZoom();
  await loadStageSvg(sequence);
  applyScenarioFilter();
}

// Sync sidebar `.view-item.active` and rail `.sequence-row.showing-diagram`
// markers to whatever stageContent currently is.
function updateActiveStates() {
  const inView    = stageContent && stageContent.kind === "view";
  const inDiagram = stageContent && stageContent.kind === "diagram";

  list.querySelectorAll('.view-item').forEach(btn => {
    btn.classList.toggle('active',
      inView && btn.dataset.viewId === stageContent.viewId);
  });

  scenarioList.querySelectorAll('.sequence-row').forEach(row => {
    row.classList.toggle('showing-diagram',
      inDiagram
        && row.dataset.scenario === stageContent.scenarioId
        && row.dataset.sequence === stageContent.sequenceId);
  });
}

function cycleView(step) {
  const model = modelById.get(currentModelId);
  if (!model || !model.views || model.views.length === 0) return;
  // Find the currently displayed view, falling back to the first view when
  // we're in diagram mode (so arrow keys recover into the architecture).
  const fromId = stageContent && stageContent.kind === "view"
                   ? stageContent.viewId
                   : model.views[0].id;
  const idx  = model.views.findIndex(v => v.id === fromId);
  const next = idx + step;
  if (next < 0 || next >= model.views.length) return;
  selectModelAndView(model.id, model.views[next].id);
}

function buildSidebar(model) {
  list.innerHTML = '';
  for (const v of (model.views || [])) {
    const li  = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'view-item';
    btn.textContent = v.label || v.id;
    btn.title = btn.textContent;
    btn.dataset.viewId = v.id;
    btn.addEventListener('click', () => selectModelAndView(model.id, v.id));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function loadStageSvg(srcInfo) {
  hideError();
  sizer.innerHTML = '';
  if (!srcInfo || !srcInfo.src) {
    showError('Source has no src');
    return;
  }
  let text;
  if (INLINE && INLINE.views && INLINE.views[srcInfo.src] != null) {
    // Sequence diagrams are bundled into the same `views` map as authored
    // views in release mode — both are SVG paths keyed by their relative src.
    text = INLINE.views[srcInfo.src];
  } else {
    const url = new URL(srcInfo.src, manifestBase);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (e) {
      showError(`Failed to load ${url.pathname}: ${e.message}`);
      return;
    }
  }
  sizer.innerHTML = stripXmlProlog(text);
  const svg = sizer.querySelector('svg');
  if (!svg) {
    showError('Loaded file is not an SVG');
    return;
  }
  fitSizerToSvg(svg);
}

// A connector group declares its scenario membership via either
// `data-flows` (JSON list of {scenario, sequence, step} from the model
// lookup — preferred, multi-membership capable) or the legacy single-
// membership trio `data-scenario` / `data-sequence` / `data-step`. Returns
// a normalised list of flow dicts.
function flowsForConnector(g) {
  if (g.dataset.flows) {
    try {
      const arr = JSON.parse(g.dataset.flows);
      if (Array.isArray(arr)) return arr;
    } catch (_) { /* malformed JSON — fall through to legacy form */ }
  }
  if (g.dataset.scenario) {
    return [{
      scenario: g.dataset.scenario,
      sequence: g.dataset.sequence || null,
      step:     g.dataset.step != null ? parseFloat(g.dataset.step) : null,
    }];
  }
  return [];
}

// CSS selector for any connector with scenario metadata. Matches both the
// flows form and the legacy single-attr form; dedup is automatic since
// querySelectorAll returns each element once.
const CONNECTOR_SELECTOR = 'g[data-flows], g[data-scenario]';

// Render the right rail directly from the active model's scenarios in the
// manifest — no SVG inspection needed since the manifest is auto-derived
// from the compiled model and is the source of truth. Called once per
// model switch (not per view switch), so press state survives view changes.
function rebuildScenarioRail() {
  scenarioList.innerHTML = '';

  if (scenarioTree.length === 0) {
    scenarioEmpty.classList.remove('hidden');
    return;
  }
  scenarioEmpty.classList.add('hidden');

  for (const sc of scenarioTree) {
    const sequences = sc.sequences && sc.sequences.length > 0
      ? sc.sequences
      // Scenarios with no declared sequences still get one selectable leaf
      // representing "the whole scenario", so users can at least filter on
      // the scenario level. The diagram trigger is hidden for it (no src).
      : [{ id: '_all', label: sc.label, src: null }];

    const group = document.createElement('li');
    group.className = 'scenario-group';

    const header = document.createElement('div');
    header.className = 'scenario-header';
    header.innerHTML =
      `<span class="scenario-twisty" aria-hidden="true">▾</span>` +
      `<span class="scenario-name">${escapeHtml(sc.label)}</span>`;
    header.addEventListener('click', () => {
      group.classList.toggle('collapsed');
    });
    group.appendChild(header);

    const subList = document.createElement('ul');
    subList.className = 'sequence-list';
    for (const q of sequences) {
      const row = document.createElement('li');
      row.className = 'sequence-row';
      row.dataset.scenario = sc.id;
      row.dataset.sequence = q.id;

      const filterBtn = document.createElement('button');
      filterBtn.type = 'button';
      filterBtn.className = 'sequence-item';
      filterBtn.textContent = q.label;
      filterBtn.dataset.scenario = sc.id;
      filterBtn.dataset.sequence = q.id;
      filterBtn.setAttribute('aria-pressed', 'false');
      filterBtn.title = 'Toggle highlight on connectors that belong to this sequence';
      row.appendChild(filterBtn);

      // Diagram-trigger button. Only shown when the sequence has a backing
      // diagram src — sentinel `_all` rows for unstructured scenarios skip it.
      if (q.src) {
        const diagramBtn = document.createElement('button');
        diagramBtn.type = 'button';
        diagramBtn.className = 'sequence-diagram-btn';
        diagramBtn.dataset.scenario = sc.id;
        diagramBtn.dataset.sequence = q.id;
        diagramBtn.title = 'Show sequence diagram';
        diagramBtn.setAttribute('aria-label',
          `Show sequence diagram: ${q.label}`);
        // Inline SVG icon: two short lifelines with an arrow between them.
        diagramBtn.innerHTML =
          '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">' +
            '<line x1="3" y1="2" x2="3" y2="12" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5"/>' +
            '<line x1="11" y1="2" x2="11" y2="12" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5"/>' +
            '<line x1="3" y1="7" x2="9.5" y2="7" stroke="currentColor" stroke-width="1.4"/>' +
            '<polygon points="11,7 8.5,5.5 9.4,7 8.5,8.5" fill="currentColor"/>' +
          '</svg>';
        row.appendChild(diagramBtn);
      }

      subList.appendChild(row);
    }
    group.appendChild(subList);
    scenarioList.appendChild(group);
  }
  // Re-apply the visual states for the current stage selection.
  updateActiveStates();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Composite key "scenarioId|sequenceId" for the press-state set. The leaf
// "_all" sentinel matches every connector of its scenario regardless of
// data-sequence — used when the scenario has no sequence detail.
let pressedSequences = new Set();
const PRESS_KEY = (sc, seq) => `${sc}|${seq}`;

const SVG_NS = 'http://www.w3.org/2000/svg';
// Connector pulse — a bright dash slides from the start of each highlighted
// connector to its end. One pulse per connector, all running simultaneously
// (no step-order coupling, unlike the older single-dot-per-scenario approach).
const PULSE_COLOR        = '#FFFFFF';
const PULSE_STROKE_WIDTH = 3;
const PULSE_LEN_PX       = 22;     // visible "head" length in path units
const PULSE_DUR_S        = 1.3;

function pathFromConnector(group) {
  const polyline = group.querySelector('polyline');
  if (polyline) {
    const pts = (polyline.getAttribute('points') || '').trim().split(/\s+/);
    if (pts.length < 2) return null;
    return 'M ' + pts[0] + pts.slice(1).map(p => ' L ' + p).join('');
  }
  const line = group.querySelector('line');
  if (line) {
    return `M ${line.getAttribute('x1')} ${line.getAttribute('y1')} L ${line.getAttribute('x2')} ${line.getAttribute('y2')}`;
  }
  return null;
}

// Per-connector pulse: a short bright dash slides from the start of the
// connector's path to its end via stroke-dashoffset animation. The pulse
// renders as an overlay <path> on top of the highlighted (orange) connector
// so the static highlight + the moving pulse coexist visibly.
function addConnectorPulse(svg, group) {
  const pathStr = pathFromConnector(group);
  if (!pathStr) return;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathStr);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', PULSE_COLOR);
  path.setAttribute('stroke-width', String(PULSE_STROKE_WIDTH));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('opacity', '0.95');
  path.classList.add('connector-pulse');
  // Append at SVG root so the pulse renders above the connector layer
  // regardless of where the connector group sits in the document order.
  svg.appendChild(path);

  // Now that the path is in the DOM we can ask for its measured length.
  const len = path.getTotalLength();
  if (!isFinite(len) || len <= 0) {
    path.remove();
    return;
  }
  // Cap segment to 90% of the path so very short connectors still show
  // motion rather than a dash that always covers the whole line.
  const seg = Math.min(PULSE_LEN_PX, len * 0.9);

  // Pattern: one visible segment, then a gap longer than the path so only
  // the leading dash ever shows. dashoffset slides the segment from a
  // pre-start position (off-screen) to a post-end position (also
  // off-screen), giving a clean enter/exit cycle.
  path.setAttribute('stroke-dasharray', `${seg} ${len + seg}`);
  const anim = document.createElementNS(SVG_NS, 'animate');
  anim.setAttribute('attributeName', 'stroke-dashoffset');
  anim.setAttribute('from', `${seg}`);
  anim.setAttribute('to',   `${-len}`);
  anim.setAttribute('dur',  `${PULSE_DUR_S}s`);
  anim.setAttribute('repeatCount', 'indefinite');
  path.appendChild(anim);
}

// Decide which pressed sequence keys a connector matches. Walks every flow
// the connector belongs to (a single physical line may participate in
// multiple sequences) and returns the press-keys it satisfies.
//   - exact match: a flow's (scenario, sequence) pair is pressed
//   - `_all` match: any pressed `<scenario>|_all` key matches every flow
//     of that scenario
//   - unsequenced fallback: a flow with no `sequence` field matches any
//     pressed sequence under its scenario (so .view files annotated only
//     at scenario granularity still light up usefully)
function connectorMatches(g) {
  const matched = [];
  const seen    = new Set();
  for (const f of flowsForConnector(g)) {
    if (!f.scenario) continue;
    const allKey = PRESS_KEY(f.scenario, '_all');
    if (pressedSequences.has(allKey) && !seen.has(allKey)) {
      matched.push(allKey); seen.add(allKey);
    }
    if (f.sequence) {
      const seqKey = PRESS_KEY(f.scenario, f.sequence);
      if (pressedSequences.has(seqKey) && !seen.has(seqKey)) {
        matched.push(seqKey); seen.add(seqKey);
      }
    } else {
      pressedSequences.forEach(key => {
        const [pSc] = key.split('|');
        if (pSc === f.scenario && !seen.has(key)) {
          matched.push(key); seen.add(key);
        }
      });
    }
  }
  return matched;
}

function applyScenarioFilter() {
  const svg = sizer.querySelector('svg');
  if (!svg) return;
  const empty = pressedSequences.size === 0;

  // Clear any previous pulses and component glow — regenerated below.
  svg.querySelectorAll('.connector-pulse').forEach(el => el.remove());
  svg.querySelectorAll('.component-glow').forEach(el => el.classList.remove('component-glow'));

  const involved = new Set();   // ids of components touched by highlighted connectors
  svg.querySelectorAll(CONNECTOR_SELECTOR).forEach(g => {
    const highlight = !empty && connectorMatches(g).length > 0;
    g.classList.toggle('connector-highlight', highlight);
    g.classList.toggle('connector-dim',       !empty && !highlight);
    if (highlight) {
      // One pulse per highlighted connector — the pulse traverses the
      // arrow's own length, independent of step order or sequence
      // grouping. All highlighted arrows pulse simultaneously.
      addConnectorPulse(svg, g);
      if (g.dataset.source) involved.add(g.dataset.source);
      if (g.dataset.target) involved.add(g.dataset.target);
    }
  });

  // Glow only `data-kind="component"` participants — actors and blocks (which
  // are containers/principals, not the things doing work) stay unstyled per
  // the rule "highlight components and connectors only".
  involved.forEach(id => {
    const el = svg.querySelector(`#${CSS.escape(id)}`);
    if (el && el.dataset.kind === 'component') el.classList.add('component-glow');
  });

  scenarioList.querySelectorAll('.sequence-item').forEach(btn => {
    const pressed = pressedSequences.has(PRESS_KEY(btn.dataset.scenario, btn.dataset.sequence));
    btn.classList.toggle('active', pressed);
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
}

scenarioList.addEventListener('click', e => {
  // Diagram-trigger button comes first — it's a sibling of the filter
  // button, so a click on it would otherwise also bubble through to the
  // generic `.sequence-item` handler if we matched in the wrong order.
  const diagramBtn = e.target.closest && e.target.closest('.sequence-diagram-btn');
  if (diagramBtn) {
    selectSequenceDiagram(
      currentModelId,
      diagramBtn.dataset.scenario,
      diagramBtn.dataset.sequence,
    );
    return;
  }
  const item = e.target.closest && e.target.closest('.sequence-item');
  if (!item) return;
  const key = PRESS_KEY(item.dataset.scenario, item.dataset.sequence);
  if (pressedSequences.has(key)) pressedSequences.delete(key);
  else                           pressedSequences.add(key);
  applyScenarioFilter();
});

function stripXmlProlog(text) {
  return text.replace(/<\?xml[^?]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/i, '');
}

// Size the sizer to the SVG's intrinsic dimensions, scaled to fit the stage
// while preserving aspect ratio. The SVG itself is set to 100%/100% so it
// scales with the sizer; zoom is then a CSS scale on the sizer.
function fitSizerToSvg(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal;
  let w = parseFloat(svg.getAttribute('width'))  || (vb && vb.width)  || 1280;
  let h = parseFloat(svg.getAttribute('height')) || (vb && vb.height) || 720;
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  const pad = 40;
  const sw = stage.clientWidth  - pad;
  const sh = stage.clientHeight - pad;
  const scale = Math.min(sw / w, sh / h, 1);
  sizer.style.width  = Math.round(w * scale) + 'px';
  sizer.style.height = Math.round(h * scale) + 'px';
  applyTransform();
}

window.addEventListener('resize', () => {
  const svg = sizer.querySelector('svg');
  if (svg) fitSizerToSvg(svg);
});

// ── Zoom / pan ──────────────────────────────────────────────────────────
function applyTransform() {
  sizer.style.transform = `scale(${zoom}) translate(${panX}px, ${panY}px)`;
  zoomLabel.textContent = Math.round(zoom * 100) + '%';
  const canPan = zoom > 1.01;
  stage.classList.toggle('pannable', canPan && !dragging);
  stage.classList.toggle('panning',  dragging);
}

function clampPan() {
  const sizerW = sizer.clientWidth, sizerH = sizer.clientHeight;
  const maxX = sizerW * (zoom - 1) / 2 / zoom;
  const maxY = sizerH * (zoom - 1) / 2 / zoom;
  panX = Math.max(-maxX, Math.min(maxX, panX));
  panY = Math.max(-maxY, Math.min(maxY, panY));
}

function showToast(text) {
  zoomToast.textContent = text;
  zoomToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => zoomToast.classList.remove('show'), 900);
}

function setZoom(newZoom, pivotClientX, pivotClientY) {
  newZoom = Math.max(MIN_Z, Math.min(MAX_Z, newZoom));
  if (Math.abs(newZoom - zoom) < 0.001) return;

  if (pivotClientX !== undefined) {
    const r = stage.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    panX += (pivotClientX - cx) * (1 / newZoom - 1 / zoom);
    panY += (pivotClientY - cy) * (1 / newZoom - 1 / zoom);
  }

  zoom = newZoom;
  if (zoom <= 1.001) { zoom = 1; panX = 0; panY = 0; }
  clampPan();
  applyTransform();
  showToast(Math.round(zoom * 100) + '%');
}

function resetZoom() {
  zoom = 1; panX = 0; panY = 0;
  applyTransform();
}

// Buttons
document.getElementById('zoom-in-btn'   ).addEventListener('click', () => setZoom(zoom + STEP));
document.getElementById('zoom-out-btn'  ).addEventListener('click', () => setZoom(zoom - STEP));
document.getElementById('zoom-reset-btn').addEventListener('click', () => { resetZoom(); showToast('100%'); });

// Wheel zoom
stage.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  setZoom(zoom * factor, e.clientX, e.clientY);
}, { passive: false });

// LMB drag-to-pan
const PAN_THRESHOLD = 4;

stage.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  dragging    = true;
  dragMoved   = false;
  dragOriginX = e.clientX;
  dragOriginY = e.clientY;
  dragPanX    = panX;
  dragPanY    = panY;
});

window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = e.clientX - dragOriginX;
  const dy = e.clientY - dragOriginY;
  if (!dragMoved && Math.hypot(dx, dy) > PAN_THRESHOLD) dragMoved = true;
  if (dragMoved && zoom > 1.01) {
    panX = dragPanX + dx / zoom;
    panY = dragPanY + dy / zoom;
    clampPan();
    applyTransform();
    stage.classList.add('panning');
    stage.classList.remove('pannable');
  }
});

window.addEventListener('mouseup', e => {
  if (!dragging || e.button !== 0) return;
  dragging  = false;
  dragMoved = false;
  stage.classList.remove('panning');
  stage.classList.toggle('pannable', zoom > 1.01);
});

stage.addEventListener('dblclick', () => { resetZoom(); showToast('100%'); });

// Keyboard
document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom + STEP); }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom - STEP); }
  if (e.key === '0') { e.preventDefault(); resetZoom(); showToast('100%'); }
  if (e.key === 'f' || e.key === 'F') toggleFs();
  // Arrow keys cycle the active model's view list. Cross-model navigation
  // happens via the model-picker dropdown — we don't auto-jump to the next
  // model when you arrow off the last view (it'd be confusing when scenarios
  // and pressed state reset under you).
  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    cycleView(+1);
  }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    cycleView(-1);
  }
});

// Fullscreen
function toggleFs() {
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen().catch(() => {});
}
document.getElementById('fs-btn').addEventListener('click', toggleFs);
document.addEventListener('fullscreenchange', () => {
  const svg = sizer.querySelector('svg');
  if (svg) setTimeout(() => fitSizerToSvg(svg), 50);
});

// ── Errors ──────────────────────────────────────────────────────────────
function showError(text) {
  errorMsg.textContent = text;
  errorMsg.classList.remove('hidden');
}
function hideError() {
  errorMsg.classList.add('hidden');
}

init();
