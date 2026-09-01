# Slice #3a: Container-Host + Geometry-Free View Models (Mural framework)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the container Figure the sole geometry owner and side-endpoint host for content view-models, so `NodeViewModel` becomes geometry-free and `SideConnectableNodeVM` can be deleted — with connector endpoints resolving to containers.

**Architecture:** Content VMs (e.g. Plexus `ArchNodeVM`) keep only identity + content. Their container Figure holds geometry (seeded from the document's `NodeVisualStore` when the container is realized) and is the `ISideEndpointHost`. The Diagram raises a `ContainerBound(container, item)` signal on realize/rebind; the document responds by applying the stored geometry to the container and re-pointing any connector endpoints that reference that node id. Geometry stays the serialization boundary (no live write-back — eager containers make save-time read sufficient, same as slice #2).

**Tech Stack:** TypeScript (Mural framework), `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-20-container-owned-geometry-design.md` (slice #3).

## Global Constraints

- **Mural framework only.** Ends by publishing `@pragmatic-tech-ai/mural@0.15.0` to Verdaccio (localhost:4873). Plexus migration is slice #3b (separate) and will be *broken against 0.15.0* until then — that is expected.
- **Ordering (green at each boundary):** put the container-owns-geometry plumbing in first while VMs still carry geometry (T1–T2), then strip VM geometry + delete `SideConnectableNodeVM` last (T3). No task leaves the Mural suite red.
- **No live per-container write-back.** The store is fed at save (resolve VM node → container, read geometry) and applied at load (Figure nodes directly; VM containers on `ContainerBound`). Live write-back stays a future option; the store already supports it.
- **Store stays on `DiagramDocument`.** A bare `Diagram` (no document) has no store; its `ContainerBound` simply has no subscriber, so geometry is set another way (directly, in tests). Serialize/deserialize remain on the document (headless-capable).
- Tests in `tests/` subfolders; enums over string unions.

## File Structure

- Modify `src/framework/diagram/diagram.ts` — `bindContainer` (drop geometry binds in T3, wire PortProvider/Kind, raise `ContainerBound`); add a `ContainerBound` event.
- Modify `src/framework/diagram/diagram-document.ts` — subscribe to `ContainerBound`; apply store geometry + re-point endpoints; `_serialize` resolves VM nodes to containers.
- Modify `src/framework/diagram/connector.ts` — endpoint→container resolution (`nodeRect` no longer sees VM geometry).
- Modify `src/framework/diagram/node-view-model.ts` — strip geometry DPs (T3).
- Delete `src/framework/diagram/side-connectable-node-vm.ts` (T3); drop its export from `src/framework/index.ts`; remove its `symbol-table.ts` entry if present.
- Update tests: `selection-geometry-mirror.test.ts` and any using `NodeViewModel`/`SideConnectableNodeVM` geometry.

---

### Task 1: `ContainerBound` signal + document applies store geometry to VM containers

**Files:**
- Modify: `src/framework/diagram/diagram.ts` (raise `ContainerBound` in `bindContainer`; add the event surface)
- Modify: `src/framework/diagram/diagram-document.ts` (subscribe; apply store geometry on bind; `_serialize` resolves VM→container)
- Test: `src/framework/diagram/tests/container-bound-geometry.test.ts`

**Interfaces:**
- Consumes: `NodeVisualStore` (`_visuals`), `Generator.ContainerFromItem`, `Figure`, `NodeViewModel`.
- Produces: `Diagram.AddContainerBoundListener(cb: (container: Figure, item: unknown) => void): void` (+ removal); document seeds VM-container geometry from the store on realize.

> **Verify first:** how the document reaches the live `Diagram` — grep diagram-document.ts for `ActiveView`/how it publishes/holds the view, and confirm `this.ActiveView?.Generator.ContainerFromItem(...)` is reachable. Also confirm `bindContainer` is the single choke point for both fresh (`GetContainerForItemOverride`) and recycled (`RebindContainerForItemOverride`) VM containers (it is — both call it).

- [ ] **Step 1: Write the failing test** — a `NodeViewModel` item whose store record positions its container on realize.

```ts
// container-bound-geometry.test.ts (sketch)
// mount a Diagram wired to a DiagramDocument; seed the document's store for id 'v'
// with { left:15, top:25, w:120, h:60 }; add a NodeViewModel (id 'v') to Nodes;
// measure/arrange so the container realizes; assert the container Figure
// (Generator.ContainerFromItem(vm)) has Left===15, Width===120.
```

Model the mount on `selection-geometry-mirror.test.ts` (Canvas ItemsPanel, measure/arrange). Access the document's store via a test seam or drive it through `Save`/`Load` of a v3 payload with a `visuals` entry.

- [ ] **Step 2: Run → fails** (container lands at default geometry, not the stored record).

- [ ] **Step 3: Implement**

In `diagram.ts`: add a listener list + `AddContainerBoundListener`/`RemoveContainerBoundListener`; at the end of `bindContainer(node, item)` (when `item instanceof Model`), raise it: `this._raiseContainerBound(node, item)`. Keep the existing two-way geometry binds for now (removed in T3).

In `diagram-document.ts`: when the document adopts its `Diagram` (ActiveView), subscribe: on `ContainerBound(container, item)`, if `item instanceof NodeViewModel`, `const v = this._visuals.Get(item.Id); if (v) this._visuals.Apply(v, container)`. In `_serialize`, resolve geometry per node: `const fig = v instanceof Figure ? v : (this.ActiveView?.Generator.ContainerFromItem(v) as Figure | undefined); if (fig && id !== '') this._visuals.Set(id, this._visuals.Read(fig))` (skip the store write when no container — headless VM edge).

- [ ] **Step 4: Run → passes; `npm run typecheck`.**

- [ ] **Step 5: Commit** — `feat(diagram): ContainerBound signal; document seeds VM-container geometry from the store`.

---

### Task 2: Connector endpoints resolve to the container Figure

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (on `ContainerBound`, re-point endpoints referencing the node id)
- Possibly: `src/framework/diagram/connector.ts` (confirm `nodeRect`/`asSideSlotHost` work off the container)
- Test: `src/framework/diagram/tests/connector-vm-container.test.ts`

**Interfaces:**
- Consumes: `ConnectorEndpoint` (`Node`, `UnresolvedNodeId`), `Connectors` collection, `ContainerBound`.
- Produces: an endpoint that referenced a VM node id now points at the container Figure once realized.

> **Verify first:** re-read connector-endpoint rehydration (`rehydrateEndpoint`, `byId`) + the absent-node `UnresolvedNodeId` re-bind path (diagram-document.ts ~1101–1139) and `nodeRect`/`asSideSlotHost` in connector.ts (~1351, 1585). The re-point reuses the `UnresolvedNodeId` mechanism.

- [ ] **Step 1: Write the failing test** — a `NodeViewModel` node + a connector whose endpoint references it by id; after realize, the endpoint's `Node` is the container Figure and `nodeRect` returns the container's rect.

- [ ] **Step 2: Run → fails** (endpoint points at the VM / has no rect).

- [ ] **Step 3: Implement** — On load, endpoints to a not-yet-realized VM keep `UnresolvedNodeId` (existing behavior). Extend the `ContainerBound` handler: when a container binds for `item` with id X, scan `this.Connectors` for endpoints whose `UnresolvedNodeId === X` (or whose `Node === item`) and set `endpoint.Node = container`. For Figure nodes (own container) resolution is unchanged. Confirm `asSideSlotHost`/`nodeRect` operate on the container (they duck-type `GetSideSlot`/`Left..Height`, which the Figure has).

- [ ] **Step 4: Run → passes; typecheck.**

- [ ] **Step 5: Commit** — `feat(diagram): connector endpoints resolve to the container Figure for VM nodes`.

---

### Task 3: Strip `NodeViewModel` geometry; delete `SideConnectableNodeVM`; wire container PortProvider/Kind

**Files:**
- Modify: `src/framework/diagram/node-view-model.ts` (remove Left/Top/Width/Height/SizeToContent/UserSized DPs + accessors; keep Id, Parent)
- Modify: `src/framework/diagram/diagram.ts` (`bindContainer`: remove the two-way geometry binds; wire `container.PortProvider`/`Kind` from the VM)
- Delete: `src/framework/diagram/side-connectable-node-vm.ts`; remove its `index.ts` export + any `symbol-table.ts` entry
- Update tests: `selection-geometry-mirror.test.ts` (+ any other geometry-on-VM users) to set geometry on the container/store

**Interfaces:**
- Consumes: T1 (container store-fed) + T2 (connectors→container) in place.
- Produces: `NodeViewModel` = `{ Id, Parent }`; container is the sole `ISideEndpointHost`.

- [ ] **Step 1: Update the tests to the new model (failing tests)** — In `selection-geometry-mirror.test.ts`, the VM-node cases set geometry on the container (`Generator.ContainerFromItem(vm)`) or via the store, not `vm.Left`. Grep for other `NodeViewModel`/`SideConnectableNodeVM` geometry users and update.

- [ ] **Step 2: Run → fails** (`vm.Left` no longer exists after the strip / SideConnectable import gone).

- [ ] **Step 3: Implement**
  - `node-view-model.ts`: delete the six geometry DPs + accessors; keep `IdKey`/`Id` and `Parent`. Update the header comment.
  - `diagram.ts` `bindContainer`: delete the `Figure.LeftKey`/`TopKey`/`WidthKey`/`HeightKey`/`SizeToContentKey`/`UserSizedKey` two-way binds. After `Content`/`DataContext`/`Tag`, wire ports: if the VM exposes a `PortProvider` (or a `Kind` that maps to one), set `node.PortProvider`/`node.Kind` from it (duck-typed). Raise `ContainerBound` (unchanged).
  - Delete `side-connectable-node-vm.ts`; remove its export from `index.ts`; remove `symbol-table.ts` entry if any. Its `ISideEndpointHost` role is already the container Figure's.

- [ ] **Step 4: Run the updated tests + `npm run typecheck`** — no dangling `NodeViewModel.Left`/`SideConnectableNodeVM` references (grep).

- [ ] **Step 5: Commit** — `refactor(diagram): geometry-free NodeViewModel; delete SideConnectableNodeVM (container is the host)`.

---

### Task 4: Full verification + publish `mural@0.15.0`

- [ ] **Step 1: Straggler grep** — `grep -rn "SideConnectableNodeVM\|NodeViewModel).*\.Left\|\.Left = .*vm" src` → none unexpected.
- [ ] **Step 2:** `npm run typecheck` clean; `npm run build:templates` compiles.
- [ ] **Step 3:** `npm test` — full suite green.
- [ ] **Step 4: Publish** — `npm version minor` (→ 0.15.0), `npm publish` (Verdaccio). Confirm the registry is localhost:4873 before publishing.
- [ ] **Step 5: Commit** the version bump.

---

## Self-review notes

- **Spec coverage:** container = side-endpoint host (T3 delete + bindContainer PortProvider), VM geometry-free (T3), container store-fed geometry (T1), connectors → container (T2), publish (T4). Live write-back explicitly deferred (Global Constraints). ✔
- **Ordering / green boundaries:** plumbing first (T1 store-apply while VM keeps geometry; T2 connectors), removal last (T3 strip + delete). The mirror test only breaks at T3, where it's updated. ✔
- **Cross-repo:** 0.15.0 intentionally breaks Plexus until slice #3b — flagged in Global Constraints; Plexus is NOT touched here.
- **Verification points flagged inline** (ActiveView access, `ContainerBound` choke point, endpoint re-bind path) — confirm against source during execution rather than assume.
- **Risk:** the connector endpoint→container re-point (T2) is the subtle part; the dedicated `connector-vm-container.test.ts` exercises the VM-node connector path that Mural otherwise lacks (Plexus is where it lives in anger).
