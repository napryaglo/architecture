#!/usr/bin/env python3
"""
BPMN Model Compiler — bpmn_engine/Compiler/bpmn_compiler.py

Reads a `.bpmn.yaml` source, validates it against the BPMN meta-model
spec (see `adl/meta-models/bpmn/`), and emits a compiled YAML that
downstream visual-engine pieces consume.

What it produces. The compiled output preserves the authored shape and
adds two derived sections:

  - `flow-nodes:` — flat map keyed by node id. Each entry tells you the
    node's `kind` (task / event / gateway), its `lane` and `pool`, plus
    the original authored fields. Renderers can look up any node
    without re-walking the pool/lane tree.

  - `lanes-by-id:` — `<lane-id> -> <pool-id>` lookup. Avoids the same
    re-walk for any code that needs lane→pool resolution.

Validation. Roughly thirty invariants pulled from the spec records.
The compiler reports them all (doesn't stop at the first) so a single
build cycle catches everything. Exit codes mirror `model_compiler.py`:

    0  compiled cleanly (warnings allowed)
    1  validation errors
    2  internal error — file missing, malformed YAML

Usage:
    python bpmn_engine/Compiler/bpmn_compiler.py <source.bpmn.yaml> --output <out.compiled.yaml>
    python bpmn_engine/Compiler/bpmn_compiler.py <project-dir>     # legacy form
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path
import yaml


# ── Spec-bound constants ───────────────────────────────────────────
# Pulled from adl/meta-models/bpmn/enums/. If those enums grow new
# values, mirror the change here.
VALID_TASK_TYPES     = {"none", "user", "service", "manual", "script",
                        "business-rule", "send", "receive"}
VALID_EVENT_TYPES    = {"start", "intermediate", "end"}
VALID_EVENT_TRIGGERS = {"none", "message", "timer", "conditional", "signal",
                        "error", "escalation", "compensation", "link", "terminate"}
VALID_GATEWAY_TYPES  = {"exclusive", "parallel", "inclusive", "event-based",
                        "complex"}
VALID_FLOW_TYPES     = {"sequence", "message"}

# Triggers that REQUIRE direction='catching'|'throwing' on intermediate
# events. Per the spec invariant on `event`.
TRIGGERS_NEEDING_DIRECTION = {"message", "signal", "escalation"}

# Endpoint kinds permitted on each side of a message flow. Captured as
# (task-type, event spec) predicates rather than enum lists because the
# rule blends task-type with event-type+trigger.
def is_message_sender(kind, node):
    if kind == "task":
        return node.get("type") == "send"
    if kind == "event":
        # Throwing message events: end events with message trigger, OR
        # intermediate message events with direction == 'throwing'.
        if node.get("trigger") != "message":
            return False
        et = node.get("event-type")
        if et == "end":
            return True   # end events are always throwing
        if et == "intermediate":
            return node.get("direction") == "throwing"
        return False
    if kind == "pool":
        return True   # pool boundaries can act as anonymous senders
    return False

def is_message_receiver(kind, node):
    if kind == "task":
        return node.get("type") == "receive"
    if kind == "event":
        if node.get("trigger") != "message":
            return False
        et = node.get("event-type")
        if et == "start":
            return True   # start events are always catching
        if et == "intermediate":
            return node.get("direction") == "catching"
        return False
    if kind == "pool":
        return True
    return False


# ── Helpers ────────────────────────────────────────────────────────

def load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def with_explicit_id(records: dict | None) -> dict:
    """Inject `id:` into each value of a dict-form node map. Mirrors
    the architecture compiler's `with_explicit_id` for components. The
    YAML key is the source of truth for ids; the explicit field makes
    the compiled output self-describing."""
    if not isinstance(records, dict):
        return {}
    return {nid: {"id": nid, **{k: v for k, v in (ndef or {}).items() if k != "id"}}
            for nid, ndef in records.items()}


# ── Validators ─────────────────────────────────────────────────────
# Each appends `(severity, ctx, message)` tuples to a shared `issues`
# list rather than returning errors / raising. The compiler reports
# everything in one pass so authors don't have to re-run after each fix.

def err(issues, ctx, msg):    issues.append(("error",   ctx, msg))
def warn(issues, ctx, msg):   issues.append(("warning", ctx, msg))


EXPECTED_META_MODEL = "bpmn"


def validate_meta(bpmn: dict, issues: list) -> str | None:
    meta = bpmn.get("meta")
    if not isinstance(meta, dict):
        err(issues, "meta", "missing or malformed meta block")
        return None
    if not meta.get("id"):
        err(issues, "meta", "missing meta.id")
    # Optional `meta-model:` self-identifier. When present, it must
    # match this compiler's expected meta-model — catches a `.bpmn.yaml`
    # whose author thought they were writing for a different meta-model
    # (or a copy-paste from an architecture model that wasn't fully
    # converted). The field is optional for backward compatibility.
    declared_mm = meta.get("meta-model")
    if declared_mm is not None and declared_mm != EXPECTED_META_MODEL:
        err(issues, "meta:meta-model",
            f"declared meta-model `{declared_mm}` doesn't match the BPMN "
            f"compiler (expected `{EXPECTED_META_MODEL}`). Either fix the "
            f"declaration or run this file through the right compiler.")
    return meta.get("id")


def validate_pools_and_lanes(bpmn: dict, all_node_ids: set, issues: list,
                             ) -> tuple[dict, dict]:
    """Walk pools/lanes, build:
       - node_to_pool: node-id -> pool-id (for cross-pool checks downstream)
       - node_to_lane: node-id -> lane-id (for the flat flow-nodes index)
       Plus check every flow-nodes[] entry resolves and that no node
       lives in two lanes.

       Lane ids are per-pool unique per spec, NOT globally — two pools
       may both have a lane called `self`. We resolve cross-pool checks
       via node_to_pool directly; the lane id alone is just a label."""
    node_to_pool = {}
    node_to_lane = {}

    pools = bpmn.get("pools") or {}
    if not pools:
        err(issues, "pools", "process has no pools — at least one required")
        return node_to_pool, node_to_lane

    pool_ids = set()
    for pid, pdef in pools.items():
        ctx = f"pools:{pid}"
        if pid in pool_ids:
            err(issues, ctx, f"duplicate pool id `{pid}`")
            continue
        pool_ids.add(pid)
        if not isinstance(pdef, dict):
            err(issues, ctx, "pool entry must be a mapping")
            continue
        lanes = pdef.get("lanes") or {}
        if not lanes:
            err(issues, ctx, "pool has no lanes — at least one required")
            continue
        seen_lanes = set()
        for lid, ldef in lanes.items():
            lctx = f"{ctx}:lanes:{lid}"
            if lid in seen_lanes:
                err(issues, lctx, f"duplicate lane id `{lid}` within pool")
                continue
            seen_lanes.add(lid)
            if not isinstance(ldef, dict):
                err(issues, lctx, "lane entry must be a mapping")
                continue
            for nid in ldef.get("flow-nodes") or []:
                if nid in node_to_lane:
                    err(issues, lctx,
                        f"flow node `{nid}` already assigned to lane "
                        f"`{node_to_lane[nid]}` in pool `{node_to_pool[nid]}`")
                    continue
                if nid not in all_node_ids:
                    err(issues, lctx,
                        f"flow-nodes[] entry `{nid}` doesn't resolve "
                        f"to a declared task/event/gateway")
                    continue
                node_to_lane[nid] = lid
                node_to_pool[nid] = pid

    # Inverse: any node declared but never assigned to a lane.
    for nid in all_node_ids:
        if nid not in node_to_lane:
            err(issues, f"flow-nodes:{nid}",
                "node is not referenced by any lane's flow-nodes[] list")
    return node_to_pool, node_to_lane


def validate_tasks(tasks: dict, issues: list):
    for tid, t in tasks.items():
        ctx = f"tasks:{tid}"
        ttype = t.get("type", "none")
        if ttype not in VALID_TASK_TYPES:
            err(issues, ctx, f"unknown task type `{ttype}` "
                             f"(valid: {sorted(VALID_TASK_TYPES)})")
        if t.get("assignee") and ttype in ("service", "script"):
            warn(issues, ctx,
                 f"task type `{ttype}` carries an assignee — usually only "
                 f"`user` or `manual` tasks have one")


def validate_events(events: dict, issues: list,
                    incoming: dict, outgoing: dict):
    """Per the spec invariants on `event`."""
    for eid, e in events.items():
        ctx = f"events:{eid}"
        etype = e.get("event-type")
        if etype not in VALID_EVENT_TYPES:
            err(issues, ctx, f"missing or unknown event-type "
                             f"(valid: {sorted(VALID_EVENT_TYPES)})")
            continue
        trigger = e.get("trigger", "none")
        if trigger not in VALID_EVENT_TRIGGERS:
            err(issues, ctx, f"unknown trigger `{trigger}`")

        # Flow-position invariants.
        if etype == "start" and incoming.get(eid):
            err(issues, ctx, "start event has incoming sequence flow(s) "
                             f"({sorted(incoming[eid])}) — start events "
                             f"are how tokens enter the process; an "
                             f"incoming arrow is a modelling error")
        if etype == "end" and outgoing.get(eid):
            err(issues, ctx, "end event has outgoing sequence flow(s) "
                             f"({sorted(outgoing[eid])}) — end events "
                             f"terminate a flow path")

        # Intermediate events with certain triggers MUST declare direction.
        if etype == "intermediate" and trigger in TRIGGERS_NEEDING_DIRECTION:
            direction = e.get("direction")
            if direction not in ("catching", "throwing"):
                err(issues, ctx,
                    f"intermediate event with `{trigger}` trigger must "
                    f"declare `direction: catching` or `throwing`")


def validate_gateways(gateways: dict, issues: list,
                      incoming: dict, outgoing: dict, flows_by_id: dict):
    for gid, g in gateways.items():
        ctx = f"gateways:{gid}"
        gtype = g.get("type")
        if gtype not in VALID_GATEWAY_TYPES:
            err(issues, ctx, f"missing or unknown gateway type "
                             f"(valid: {sorted(VALID_GATEWAY_TYPES)})")
            continue

        in_degree  = len(incoming.get(gid, []))
        out_degree = len(outgoing.get(gid, []))
        if in_degree == 0:
            err(issues, ctx, "gateway has no incoming sequence flows")
        if out_degree == 0:
            err(issues, ctx, "gateway has no outgoing sequence flows")

        # Parallel gateways forbid conditions on outgoing flows.
        if gtype == "parallel":
            for fid in outgoing.get(gid, []):
                fl = flows_by_id.get(fid)
                if fl and fl.get("condition"):
                    err(issues, ctx,
                        f"parallel gateway: outgoing flow `{fid}` carries "
                        f"a condition — parallel gateways fire all branches "
                        f"unconditionally; the condition would be ignored")

        # Default flow must reference an outgoing flow of THIS gateway.
        default = g.get("default")
        if default is not None:
            outs = set(outgoing.get(gid, []))
            if default not in outs:
                err(issues, ctx,
                    f"`default: {default}` doesn't reference an outgoing "
                    f"sequence flow of this gateway "
                    f"(outgoing: {sorted(outs)})")


def validate_data_objects(data_objects: dict, issues: list):
    # The spec only declares one (warning-level) invariant: orphan check.
    # We don't have data associations modelled yet, so we can't detect
    # orphans — note for now and add the check when associations land.
    for did, d in data_objects.items():
        # Just enum-check the `collection` field if present.
        coll = d.get("collection")
        if coll is not None and not isinstance(coll, bool):
            err(issues, f"data-objects:{did}",
                f"`collection:` must be a boolean (got {type(coll).__name__})")


def validate_flows(flows: list, kind_of_id: dict, node_to_pool: dict,
                   all_pool_ids: set, issues: list,
                   ) -> tuple[dict, dict, dict]:
    """Validate every flow and build the indices the gateway/event
    validators need:
      - incoming: node-id -> [flow-id, ...] (sequence flows only)
      - outgoing: node-id -> [flow-id, ...]
      - flows_by_id: flow-id -> the flow dict (for default-flow lookup)
    Returns (incoming, outgoing, flows_by_id)."""
    incoming, outgoing, flows_by_id = {}, {}, {}
    seen_flow_ids = set()
    auto_idx = 0

    for i, fl in enumerate(flows):
        if not isinstance(fl, dict):
            err(issues, f"flows[{i}]", f"flow entry must be a mapping (got {type(fl).__name__})")
            continue
        fid = fl.get("id")
        if fid is None:
            auto_idx += 1
            fid = f"flow-{auto_idx}"   # synthesise so error messages can name it
            fl_for_index = {**fl, "id": fid}
        else:
            fl_for_index = fl
            if fid in seen_flow_ids:
                err(issues, f"flows[{i}]", f"duplicate flow id `{fid}`")
                continue
            seen_flow_ids.add(fid)
        flows_by_id[fid] = fl_for_index

        ctx = f"flows[{i}]:{fid}"
        ftype = fl.get("type", "sequence")
        if ftype not in VALID_FLOW_TYPES:
            err(issues, ctx, f"unknown flow type `{ftype}` "
                             f"(valid: {sorted(VALID_FLOW_TYPES)})")
            continue

        src = fl.get("from")
        dst = fl.get("to")
        if not src or not dst:
            err(issues, ctx, "flow requires both `from:` and `to:`")
            continue

        # Resolve endpoints. Pool boundaries are also valid endpoints
        # for message flows (anonymous sender/receiver).
        src_kind = kind_of_id.get(src) or ("pool" if src in all_pool_ids else None)
        dst_kind = kind_of_id.get(dst) or ("pool" if dst in all_pool_ids else None)
        if src_kind is None:
            err(issues, ctx, f"`from: {src}` doesn't resolve to any node or pool")
        if dst_kind is None:
            err(issues, ctx, f"`to: {dst}` doesn't resolve to any node or pool")
        if src_kind is None or dst_kind is None:
            continue

        # Pool resolution for cross-pool checks. Pool-boundary endpoints
        # ARE the pool, so their pool is themselves.
        src_pool = src if src_kind == "pool" else node_to_pool.get(src)
        dst_pool = dst if dst_kind == "pool" else node_to_pool.get(dst)

        if ftype == "sequence":
            # Sequence flows stay within a pool.
            if src_pool and dst_pool and src_pool != dst_pool:
                err(issues, ctx,
                    f"sequence flow crosses pool boundary "
                    f"({src_pool} → {dst_pool}) — use `type: message` instead")
            # Source can't be an end event; target can't be a start event.
            if src_kind == "event":
                # We don't have the event dict here without an extra
                # lookup; defer the start/end-direction checks to the
                # event validator via the incoming/outgoing indices.
                pass
            # Update incoming/outgoing indices for downstream validators.
            outgoing.setdefault(src, []).append(fid)
            incoming.setdefault(dst, []).append(fid)

        elif ftype == "message":
            # Message flows MUST cross pools.
            if src_pool and dst_pool and src_pool == dst_pool:
                err(issues, ctx,
                    f"message flow stays within pool `{src_pool}` — "
                    f"use `type: sequence` instead")
            # Endpoint kind/role checks.
            # Look up the node dict for is_message_sender/receiver.
            src_node = kind_of_id.get(src) and _node_by_id.get(src) or {}
            dst_node = kind_of_id.get(dst) and _node_by_id.get(dst) or {}
            if src_kind != "pool" and not is_message_sender(src_kind, src_node):
                err(issues, ctx,
                    f"`from: {src}` ({src_kind}) is not a valid message "
                    f"sender — must be a Send task, throwing message event, "
                    f"or pool boundary")
            if dst_kind != "pool" and not is_message_receiver(dst_kind, dst_node):
                err(issues, ctx,
                    f"`to: {dst}` ({dst_kind}) is not a valid message "
                    f"receiver — must be a Receive task, catching message "
                    f"event, or pool boundary")

    return incoming, outgoing, flows_by_id


# Module-level node dict, populated in main() so the message-flow
# validator can resolve node fields without threading another argument
# through every helper. Lifecycle is one-shot per invocation; not
# concurrency-safe, which is fine for a CLI tool.
_node_by_id: dict = {}


# ── Compiled output ────────────────────────────────────────────────

def build_compiled(bpmn: dict, tasks: dict, events: dict, gateways: dict,
                   data_objects: dict, node_to_pool: dict, node_to_lane: dict,
                   flows_emitted: list) -> dict:
    """Assemble the compiled structure. Original authored sections are
    preserved verbatim with `id:` made explicit; derived sections add
    flat indices for downstream consumers."""
    out = {}
    if "meta" in bpmn:
        out["meta"] = bpmn["meta"]

    out["pools"] = bpmn.get("pools") or {}

    # Flat flow-nodes index — what most renderers will read from.
    # Each entry carries its kind plus the lane/pool it belongs to,
    # resolved here so consumers don't re-walk pools.
    flow_nodes = {}
    for nid, t in tasks.items():
        flow_nodes[nid] = {"kind": "task", "lane": node_to_lane.get(nid),
                           "pool": node_to_pool.get(nid), **t}
    for nid, e in events.items():
        flow_nodes[nid] = {"kind": "event", "lane": node_to_lane.get(nid),
                           "pool": node_to_pool.get(nid), **e}
    for nid, g in gateways.items():
        flow_nodes[nid] = {"kind": "gateway", "lane": node_to_lane.get(nid),
                           "pool": node_to_pool.get(nid), **g}
    out["flow-nodes"] = flow_nodes

    out["tasks"]        = tasks
    out["events"]       = events
    out["gateways"]     = gateways
    out["data-objects"] = data_objects
    out["flows"]        = flows_emitted
    return out


# ── CLI ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("source",
                        help="Path to <process>.bpmn.yaml or to a project "
                             "directory (legacy form — the source is "
                             "resolved as <dir>/<dir>.bpmn.yaml).")
    parser.add_argument("--output",
                        help="Path to write the compiled YAML. Defaults to "
                             "<project>/output/<source-stem>.compiled.yaml "
                             "for the directory form, required otherwise.")
    args = parser.parse_args()

    src_arg = Path(args.source).resolve()
    if src_arg.is_dir():
        project = src_arg
        source  = project / f"{project.name}.bpmn.yaml"
    else:
        source  = src_arg
        project = source.parent
    if not source.exists():
        print(f"ERROR: source not found at {source}", file=sys.stderr)
        return 2
    output = (Path(args.output).resolve() if args.output
              else project / "output" / f"{source.stem}.compiled.yaml")

    try:
        bpmn = load_yaml(source)
    except yaml.YAMLError as e:
        print(f"ERROR: malformed YAML in {source}: {e}", file=sys.stderr)
        return 2

    issues: list[tuple[str, str, str]] = []
    proc_id = validate_meta(bpmn, issues)

    tasks        = with_explicit_id(bpmn.get("tasks"))
    events       = with_explicit_id(bpmn.get("events"))
    gateways     = with_explicit_id(bpmn.get("gateways"))
    data_objects = with_explicit_id(bpmn.get("data-objects"))

    # Global id uniqueness across all flow-node maps. Catches "task and
    # gateway accidentally share an id".
    all_node_ids = set()
    for kind_name, m in (("task", tasks), ("event", events),
                         ("gateway", gateways), ("data-object", data_objects)):
        for nid in m:
            if nid in all_node_ids:
                err(issues, f"{kind_name}:{nid}",
                    f"id `{nid}` is reused across node kinds")
            all_node_ids.add(nid)

    # Pool/lane structure plus node→pool/lane resolution. Lane ids
    # are per-pool unique, NOT global — node_to_pool is the index that
    # downstream cross-pool checks use.
    node_to_pool, node_to_lane = validate_pools_and_lanes(
        bpmn, all_node_ids - set(data_objects), issues)
    pool_ids = set((bpmn.get("pools") or {}).keys())

    # Pre-compute id→kind for flow validation. Data objects don't
    # participate in flow nodes — exclude them.
    kind_of_id = {nid: "task"    for nid in tasks}
    kind_of_id.update({nid: "event"   for nid in events})
    kind_of_id.update({nid: "gateway" for nid in gateways})

    # Module-level cache so the message-flow validator can look up the
    # full node dict without an extra argument. Cleared on each main().
    global _node_by_id
    _node_by_id = {**tasks, **events, **gateways}

    # Flow validation builds the incoming/outgoing/flows_by_id indices
    # the per-kind validators need.
    flows_in = bpmn.get("flows") or []
    incoming, outgoing, flows_by_id = validate_flows(
        flows_in, kind_of_id, node_to_pool, pool_ids, issues)

    validate_tasks(tasks, issues)
    validate_events(events, issues, incoming, outgoing)
    validate_gateways(gateways, issues, incoming, outgoing, flows_by_id)
    validate_data_objects(data_objects, issues)

    # Build the compiled artefact even on error — useful for inspection.
    compiled = build_compiled(bpmn, tasks, events, gateways, data_objects,
                              node_to_pool, node_to_lane, list(flows_by_id.values()))
    output.parent.mkdir(parents=True, exist_ok=True)
    n_lanes = sum(len((p or {}).get("lanes") or {})
                  for p in (bpmn.get("pools") or {}).values())
    with open(output, "w", encoding="utf-8") as f:
        f.write("# Compiled BPMN process — generated by bpmn_compiler.py. "
                "Do not edit by hand.\n")
        f.write(f"# Process:    {proc_id or source.stem}\n")
        f.write(f"# Source:     {source.name}\n")
        f.write(f"# Pools:      {len(bpmn.get('pools') or {})}\n")
        f.write(f"# Lanes:      {n_lanes}\n")
        f.write(f"# Flow nodes: {len(tasks) + len(events) + len(gateways)}\n")
        f.write(f"# Flows:      {len(flows_by_id)}\n\n")
        yaml.safe_dump(compiled, f, sort_keys=False, default_flow_style=False,
                       allow_unicode=True, width=120)

    errors   = [i for i in issues if i[0] == "error"]
    warnings = [i for i in issues if i[0] == "warning"]
    for sev, ctx, msg in issues:
        marker = "E" if sev == "error" else "W"
        print(f"  [{marker}] {ctx}: {msg}")
    if issues:
        print()
    try:
        wrote = output.relative_to(Path.cwd())
    except ValueError:
        wrote = output
    print(f"Wrote: {wrote}")
    print(f"Errors: {len(errors)}    Warnings: {len(warnings)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
