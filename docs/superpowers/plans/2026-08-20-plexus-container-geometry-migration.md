# Slice #3b: Plexus Migration to Container-Owned Geometry (+ mural store API)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate Plexus's `ArchNodeVM` + its drop/layout/serialize paths onto the container-owned-geometry model (mural 0.15.0), so content VMs carry no geometry and the container Figure + document store own it. Adds one small additive mural API (write node geometry into the store by id) needed by the drop path, published as mural 0.16.0.

**Architecture:** `ArchNodeVM` becomes pure content + Id (reparented off the deleted `SideConnectableNodeVM` onto `NodeViewModel`). Its container Figure is the geometry owner + side-endpoint host. Drop factories, which run BEFORE the container realizes, write geometry into the document's `NodeVisualStore` by id via a new `DiagramDocument.SetNodeVisual(id, v)`; mural's existing `ContainerBound` (slice 3a) seeds the container on realize. The layout pipeline resolves each node's container via the public `Generator.ContainerFromItem` and applies positions/reads sizes there. The serializer is geometry-free.

**Tech Stack:** TypeScript. Mural (`node:test`), Plexus (vitest, Electron/electron-vite).

**Spec:** `docs/superpowers/specs/2026-08-20-container-owned-geometry-design.md` (slice #3, Plexus half). Slice #3a plan: `2026-08-20-container-host-geometry-free-vms.md`.

## Global Constraints

- **Two repos.** T1 is mural (`c:\Users\Eugene\Projects\architecture-agent\Mural`, branch `feat/container-owned-geometry`), ending with **publish `@pragmatic-lab/mural@0.16.0` to Verdaccio (localhost:4873) — confirm the registry before publishing; never public npm**. T2–T6 are Plexus (`c:\Users\Eugene\Projects\architecture-agent\Plexus`), consuming `^0.16.0` from Verdaccio. Plexus is the app — it is NOT published.
- **Publish only on the user's go** (mural 0.16.0 is the one publish here).
- **Tests in `tests/` subfolders; enums over string unions.**
- Mural test runner: `npx tsx --conditions=development --test --test-force-exit <files>`. Plexus tests: `npm test` (vitest) or `npx vitest run <file>`.
- Bash cwd resets to the repo parent — prefix commands with `cd <repo> &&`.

## File Structure

**Mural (T1):**
- Modify `src/framework/diagram/diagram-document.ts` — public `SetNodeVisual`/`GetNodeVisual`.
- Modify `src/framework/index.ts` — export `NodeVisual` (type) + `NodeVisualStore`.
- Test `src/framework/diagram/tests/set-node-visual.test.ts`.

**Plexus (T2–T6), all under `src/renderer/src/modules/`:**
- `architecture-projects/services/arch-node-vm.ts` — reparent + strip geometry.
- `architecture-projects/services/arch-node-serializer.ts` — geometry-free.
- `architecture-projects/services/arch-instance-drop-factory.ts`, `arch-model-instance-drop-factory.ts`, `arch-scenario-drop-factory.ts` — store geometry via `SetNodeVisual`.
- `diagram/layout/diagram-graph-adapter.ts` + `diagram/layout/layout-pipeline-service.ts` — resolve containers for VM nodes.
- `package.json` — `@pragmatic-lab/mural: ^0.16.0`.
- Tests: the 7 files listed in section F of the inventory.

---

### Task 1: Mural — `DiagramDocument.SetNodeVisual` store API + export; publish 0.16.0

**Files:**
- Modify: `Mural/src/framework/diagram/diagram-document.ts`
- Modify: `Mural/src/framework/index.ts`
- Test: `Mural/src/framework/diagram/tests/set-node-visual.test.ts`

**Interfaces:**
- Produces: `DiagramDocument.SetNodeVisual(id: string, v: NodeVisual): void` — stores the record AND, if the node's container is already realized, applies it immediately; otherwise `ContainerBound` seeds it on realize. `DiagramDocument.GetNodeVisual(id: string): NodeVisual | undefined`. Barrel exports `NodeVisual`, `NodeVisualStore`.
- Consumes: `_visuals` (NodeVisualStore), `ActiveView?.Generator.ContainerFromItem`, `Figure`, `NodeViewModel`.

- [ ] **Step 1: Write the failing test** — seed via `SetNodeVisual('v', {left:15,top:25,w:120,h:60})` BEFORE mounting a view + adding a VM (id 'v') → after realize the container is at (15,25,120,60); and calling `SetNodeVisual` AFTER realize applies to the live container immediately. Model the mount on `container-bound-geometry.test.ts`.

```ts
// set-node-visual.test.ts (sketch)
// (a) doc.SetNodeVisual('v', {left:15,top:25,w:120,h:60}); add VM 'v'; mount; measure
//     → ContainerFromItem(vm).Left === 15
// (b) after realize: doc.SetNodeVisual('v', {left:99,...}) → container.Left === 99 now
```

- [ ] **Step 2: Run → fails** (`SetNodeVisual` undefined).

- [ ] **Step 3: Implement** in `diagram-document.ts`:

```ts
public SetNodeVisual(id: string, v: NodeVisual): void
{
    this._visuals.Set(id, v);
    // Apply to the live container now if the node is realized; else ContainerBound
    // seeds it on realize (the drop path — container not built yet).
    const view = this.ActiveView;
    if (view === undefined) return;
    for (let i = 0; i < this.Nodes.Count; i++)
    {
        const n = this.Nodes.Get(i)!;
        if ((n as { Id?: string }).Id !== id) continue;
        const fig = n instanceof Figure ? n : view.Generator.ContainerFromItem(n) as Figure | undefined;
        if (fig !== undefined) this._visuals.Apply(v, fig);
        break;
    }
}
public GetNodeVisual(id: string): NodeVisual | undefined { return this._visuals.Get(id); }
```

In `index.ts`, add `export { NodeVisualStore, type NodeVisual } from './diagram/node-visual-store.js';`.

- [ ] **Step 4: Run → passes; `npm run typecheck`; `npm test` (full mural suite green).**

- [ ] **Step 5: Commit** — `feat(diagram): public SetNodeVisual/GetNodeVisual store API + export NodeVisual`.

- [ ] **Step 6: Publish** — confirm `npm config get registry` is `http://localhost:4873/`; `npm version minor` (→ 0.16.0); `npm publish`; commit the bump. (This is the plan's one publish — gate on the user's go per Global Constraints.)

---

### Task 2: Plexus — bump mural ^0.16.0; reparent `ArchNodeVM`, strip geometry

**Files:**
- Modify: `Plexus/package.json` (`@pragmatic-lab/mural: ^0.16.0`), then install from Verdaccio.
- Modify: `Plexus/src/renderer/src/modules/architecture-projects/services/arch-node-vm.ts`
- Update test: `.../services/tests/arch-node-vm.test.ts`; delete/rewrite `.../tests/arch-node-vm-side-host.test.ts` (the side-endpoint host is the container now, not the VM).

**Interfaces:**
- Consumes: mural `NodeViewModel` (Id + Parent only), 0.16.0.
- Produces: `ArchNodeVM extends NodeViewModel` with content DPs only (`Label`, `Descriptor`, `IconSize`, `Concept`, `HasWiki`, `EntityId`), no geometry.

- [ ] **Step 1: Bump + install** — set `^0.16.0` in package.json; `cd Plexus && npm install @pragmatic-lab/mural@0.16.0 --registry http://localhost:4873/` (or `npm install` if the range resolves). Confirm `node -p "require('@pragmatic-lab/mural/package.json').version"` is 0.16.0.

- [ ] **Step 2: Update the tests to the new model (failing)** — `arch-node-vm.test.ts`: drop the default-Width/Height assertions; assert `Label/Concept/IconSize` round-trip and that geometry props are absent. `arch-node-vm-side-host.test.ts`: this asserted the VM is a side-endpoint host (GetSideSlot/Ports) — that role moved to the container Figure. Delete the file (covered by mural's `m4-vm-ports` on the Figure host), or rewrite to assert `ArchNodeVM` is NOT a host (no `GetSideSlot`).

- [ ] **Step 3: Run → fails** (still extends SideConnectableNodeVM / geometry present).

- [ ] **Step 4: Implement** — change `import { DiagramSettings, SideConnectableNodeVM, ToolboxVisualDescriptor }` → `import { DiagramSettings, NodeViewModel, ToolboxVisualDescriptor }`; `extends SideConnectableNodeVM` → `extends NodeViewModel`; delete `this.Width = 72; this.Height = 56; this.SizeToContent = true` from the ctor (keep `this.IconSize = DiagramSettings.ShapeDefaultSize()`). Update the class comment (the container is the side-endpoint host + geometry owner now; the tile's default 72×56 + content-fit come from the drop store record + the container's `SizeToContent`).

- [ ] **Step 5: Run the updated tests + `cd Plexus && npx tsc --noEmit` (or the project's typecheck).**

- [ ] **Step 6: Commit** — `refactor(arch): ArchNodeVM is content+Id (reparent off deleted SideConnectableNodeVM)`.

---

### Task 3: Plexus — geometry-free `arch-node-serializer`

**Files:**
- Modify: `.../architecture-projects/services/arch-node-serializer.ts`
- Update test: `.../services/tests/arch-node-serialize.test.ts`

**Interfaces:**
- Consumes: mural `NodeSerializer` (`deserialize(data)` — single arg; `serialize(node)` content-only).
- Produces: an arch serializer whose `deserialize(data)` builds a geometry-free `ArchNodeVM` (document assigns Id + applies geometry from `visuals`); `serialize` returns content-only data.

- [ ] **Step 1: Update the test to the new model (failing)** — `arch-node-serialize.test.ts`: the round-trip must go through a `DiagramDocument` Save/Load (so the `visuals` section carries geometry) OR assert `deserialize({})` returns a geometry-free `ArchNodeVM`. Drop the direct `deserialize(data, base)` 2-arg calls and the "Width/Height come back" assertions on the VM; if geometry round-trip is asserted, assert it on the container after mount, or assert the `visuals` record via Save. `UserSized` now lives in mural's `visuals` section (container's `_visuals.Read`), not the arch `data`.

- [ ] **Step 2: Run → fails** (2-arg deserialize / geometry writes).

- [ ] **Step 3: Implement**:

```ts
// imports: drop NodeBaseRecord
serialize: (_node: unknown): Record<string, unknown> => ({}),   // content-only; geometry is in `visuals`
deserialize: (_data: Record<string, unknown>): ArchNodeVM => new ArchNodeVM(),
```

(If any non-geometry content field is genuinely needed in `data`, keep it; but `userSized` moves out — the container's store record carries it.) Keep the `registerArchNodeSerializer()` side-effect + its type tag.

- [ ] **Step 4: Run the updated test + typecheck.**

- [ ] **Step 5: Commit** — `refactor(arch): geometry-free arch-node serializer (deserialize(data) only)`.

---

### Task 4: Plexus — drop factories write geometry to the store

**Files:**
- Modify: `arch-instance-drop-factory.ts`, `arch-model-instance-drop-factory.ts`, `arch-scenario-drop-factory.ts`
- Update tests: the three matching `tests/*-drop-factory.test.ts`

**Interfaces:**
- Consumes: `DiagramDocument.SetNodeVisual` (T1). `context.Mutator` IS the document (already cast to `IDocument` in these files) — cast to `DiagramDocument` to reach `SetNodeVisual`.
- Produces: a dropped `ArchNodeVM` whose geometry is in the document store (applied to its container on realize).

- [ ] **Step 1: Update the tests to the new model (failing)** — each drop test currently asserts `vm.Left === X`. After the drop, assert the geometry via `(doc as DiagramDocument).GetNodeVisual(vm.Id)` (`{left:X, top:Y, ...}`), OR mount a view and assert `Generator.ContainerFromItem(vm).Left === X`. `GetNodeVisual` is the simpler, view-free assertion.

- [ ] **Step 2: Run → fails** (`vm.Left` gone / geometry not on the VM).

- [ ] **Step 3: Implement** — in each factory, replace `vm.Left = X; vm.Top = Y` with a store write BEFORE `AddNode` so `ContainerBound` sees it on realize:

```ts
const doc = context.Mutator as unknown as DiagramDocument;
vm.Id = entity.id;
doc.SetNodeVisual(vm.Id, { left: X, top: Y, w: 72, h: 56 });
context.Mutator.AddNode(vm);
```

(`arch-scenario-drop-factory` loops planned nodes: `doc.SetNodeVisual(nd.id, { left: nd.left, top: nd.top, w: 72, h: 56 })`.) Use the 72×56 tile default the old ctor carried. Import `DiagramDocument` + `type NodeVisual` from `@pragmatic-lab/mural/framework` as needed.

- [ ] **Step 4: Run the updated tests + typecheck.**

- [ ] **Step 5: Commit** — `refactor(arch): drop factories set container geometry via the document store`.

---

### Task 5: Plexus — layout pipeline + graph adapter resolve containers

**Files:**
- Modify: `diagram/layout/diagram-graph-adapter.ts`, `diagram/layout/layout-pipeline-service.ts`
- Update tests: `diagram/layout/tests/layout-pipeline-service.test.ts`, `diagram/layout/tests/repro-saved-stack.test.ts`

**Interfaces:**
- Consumes: `Diagram.Generator.ContainerFromItem` (public), container `Figure` geometry (Left/Top/Width/Height), `doc.ActiveView`.
- Produces: layout reads/writes geometry on the geometry-owning Figure per node (the node itself if a Figure, else its container), never on a content VM.

> **Verify first:** re-read `layout-pipeline-service.ts` around the `applyPositions` (≈328) + node-collection filter (≈264) and `diagram-graph-adapter.ts` `FigureLike`/`nodeSize` (≈17, ≈145). Confirm the pipeline has access to the live `Diagram` (ActiveView / the view it lays out) to resolve containers; if it only has the document, thread the view in (the document exposes `ActiveView`).

- [ ] **Step 1: Update the tests (failing)** — `layout-pipeline-service.test.ts` + `repro-saved-stack.test.ts` construct `ArchNodeVM`s with `Left/Top/Width/Height`. Rewrite so nodes are laid out through their containers (mount a diagram, let containers realize, seed sizes on containers or via `SetNodeVisual`), and assert final positions on the containers (`Generator.ContainerFromItem(vm)`), not on the VM.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Implement** — introduce a resolver `geometryFigure(node): Figure | undefined` = `node instanceof Figure ? node : view.Generator.ContainerFromItem(node)`. `applyPositions` sets `fig.Left/fig.Top` on the resolved container. `nodeSize`/`FigureLike`/`SizedLike` read from the resolved container. The node-collection filter keeps every node that resolves to a geometry Figure (drop the `typeof n.Left === 'number'` VM test). Content VMs without a realized container are skipped (logged if the pipeline logs skips).

- [ ] **Step 4: Run the updated tests + typecheck.**

- [ ] **Step 5: Commit** — `refactor(layout): resolve container Figures for VM nodes (geometry off the container)`.

---

### Task 6: Plexus — full verification

- [ ] **Step 1: Straggler grep** — `cd Plexus && grep -rn "SideConnectableNodeVM\|\.Left =\|\.Top =\|NodeBaseRecord\|deserialize(.*,.*base" src --include=*.ts | grep -v tests` → none unexpected; also grep tests for leftover `vm.Left`/`vm.Width` assertions.
- [ ] **Step 2:** Plexus typecheck clean (`npx tsc --noEmit` / project script).
- [ ] **Step 3:** `cd Plexus && npm test` — full vitest suite green.
- [ ] **Step 4: Commit** any residual test fixups. (No Plexus publish.)

---

## Self-review notes

- **Spec coverage:** ArchNodeVM content-only (T2), geometry-free serializer (T3), drops → store (T4), layout → containers (T5), mural store API + publish (T1), verify (T6). ✔
- **Ordering / green boundaries:** mural API + publish first (T1) so Plexus can consume it; then Plexus bumps and migrates class → serializer → drops → layout, each independently testable. ✔
- **Cross-repo:** mural 0.16.0 is additive (SetNodeVisual/export) — does NOT break 0.15.0 consumers. Plexus moves from broken-against-0.15.0 to green-against-0.16.0 across T2–T6.
- **Key risk:** the drop path timing (container not realized at drop) — solved by writing to the store pre-`AddNode` so slice-3a's `ContainerBound` seeds the container. The `set-node-visual.test.ts` (T1) pins both the before-realize (store-seed) and after-realize (immediate-apply) paths.
- **Verification flagged inline** (layout pipeline's access to the live view) — confirm against source in T5.
