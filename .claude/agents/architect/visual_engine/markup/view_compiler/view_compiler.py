#!/usr/bin/env python3
"""view_compiler.py - compile view-level markup into lower-level markup."""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

import yaml


# Location colour palette is sourced from design_system/colors_and_type.css —
# soft variants for fills, full-strength for strokes. See that file for
# semantic names. Mapping: physical → warning, cloud/paas → cyan,
# cloud/saas → brand-green, logical-grouping → plum, default → neutral.
LOCATION_TYPE_DEFAULTS = {
    "physical":         {"kind": "top-level",        "fill": "#FBF1D8", "stroke": "#C68A0E"},
    "cloud/paas":       {"kind": "top-level",        "fill": "#E2F1F4", "stroke": "#3AA6B9"},
    "cloud/saas":       {"kind": "top-level",        "fill": "#E2F3E9", "stroke": "#2EA862"},
    "logical-grouping": {"kind": "logical-grouping", "fill": "#EEEAF5", "stroke": "#7C6BAD"},
}
DEFAULT_LOCATION_VISUAL = {"kind": "top-level", "fill": "#F4F4F2", "stroke": "#8A8780"}

LIBRARY_FOLDER = {
    "visual-library":     "visual_libraries",
    "technology-library": "technology_library",
}

LAYOUT_KEYWORDS = {"hstack", "vstack", "grid", "ugrid", "canvas", "group", "dock", "wpf-grid"}

DEFAULT_IMPORTS = {
    "visual-library":     "visual_libraries/Default",
    "technology-library": "technology_library/microsoft",
}


# ---- Lexer ----

class Token:
    __slots__ = ("type", "value", "line", "col")
    def __init__(self, type_, value, line, col):
        self.type, self.value, self.line, self.col = type_, value, line, col
    def __repr__(self):
        return f"Tok({self.type}, {self.value!r}, {self.line}:{self.col})"


TOKEN_SPEC = [
    ("COMMENT_BLOCK", r"/\*.*?\*/"),
    ("COMMENT_LINE",  r"//[^\n]*"),
    ("NEWLINE",       r"\n"),
    ("WS",            r"[ \t\r]+"),
    ("STRING",        r'"(?:[^"\\]|\\.)*"'),
    ("HEXCOLOR",      r"#[0-9A-Fa-f]{3,8}\b"),
    ("NUMBER",        r"-?\d+(?:\.\d+)?"),
    ("DOLLAR_IDENT",  r"\$[A-Za-z_][\w\-]*"),
    ("IDENT",         r"[A-Za-z_][\w\-]*"),
    ("LBRACE",        r"\{"),
    ("RBRACE",        r"\}"),
    ("LBRACK",        r"\["),
    ("RBRACK",        r"\]"),
    ("LPAREN",        r"\("),
    ("RPAREN",        r"\)"),
    # 4-char orthogonal-with-arrows must come before their 3-char prefixes.
    ("ORTHO_HV_BIDI",   r"<-\|>"),
    ("ORTHO_VH_BIDI",   r"<\|->"),
    ("ARROW_BIDI",      r"<-->"),
    # 3-char orthogonal-with-arrow ops must precede their 2-char prefixes
    # (`-|`, `|-`); arrow-bearing straight ops come next.
    ("ORTHO_HV_TARGET", r"-\|>"),
    ("ORTHO_HV_SOURCE", r"<-\|"),
    ("ORTHO_VH_TARGET", r"\|->"),
    ("ORTHO_VH_SOURCE", r"<\|-"),
    ("ARROW_RIGHT",     r"-->"),
    ("ARROW_LEFT",      r"<--"),
    ("LINE_HV",         r"-\|"),
    ("LINE_VH",         r"\|-"),
    ("LINE",            r"--"),
    ("DOT",           r"\."),
    ("COMMA",         r","),
    ("EQUALS",        r"="),
]
_TOKEN_RE = re.compile(
    "|".join(f"(?P<{n}>{p})" for n, p in TOKEN_SPEC),
    re.DOTALL,
)


def tokenize(text):
    tokens = []
    line = 1
    col = 1
    pos = 0
    while pos < len(text):
        m = _TOKEN_RE.match(text, pos)
        if not m:
            raise SyntaxError(f"unrecognised character at line {line}:{col}: {text[pos]!r}")
        kind = m.lastgroup
        value = m.group()
        if kind in ("WS", "NEWLINE", "COMMENT_LINE", "COMMENT_BLOCK"):
            nl = value.count("\n")
            if nl:
                line += nl
                col = len(value) - value.rfind("\n")
            else:
                col += len(value)
        else:
            tokens.append(Token(kind, value, line, col))
            col += len(value)
        pos = m.end()
    tokens.append(Token("EOF", "", line, col))
    return tokens


# ---- Parser ----

class Parser:
    def __init__(self, tokens):
        self.toks = tokens
        self.i = 0

    def peek(self, k=0):
        return self.toks[self.i + k] if self.i + k < len(self.toks) else self.toks[-1]

    def eat(self, type_=None, value=None):
        t = self.peek()
        if type_ and t.type != type_:
            raise SyntaxError(f"expected {type_}, got {t}")
        if value is not None and t.value != value:
            raise SyntaxError(f"expected {value!r}, got {t}")
        self.i += 1
        return t

    def at_keyword(self, name):
        t = self.peek()
        return t.type == "IDENT" and t.value == name

    def parse_file(self):
        imports = []
        theme = None
        while True:
            if self.at_keyword("import"):
                self.eat("IDENT")
                kind = self.eat("IDENT").value
                pt = self.peek()
                if pt.type == "STRING":
                    path = self.eat().value[1:-1]
                else:
                    path = self.eat("IDENT").value
                imports.append({"kind": kind, "path": path})
            elif self.at_keyword("theme"):
                self.eat("IDENT")
                theme = self.eat("IDENT").value
            elif self.at_keyword("view"):
                view = self.parse_view()
                if self.peek().type != "EOF":
                    raise SyntaxError(f"unexpected trailing token: {self.peek()}")
                return {"imports": imports, "theme": theme, "view": view}
            elif self.peek().type == "EOF":
                raise SyntaxError("missing `view` block")
            else:
                raise SyntaxError(f"unexpected token in preamble: {self.peek()}")

    def parse_view(self):
        self.eat("IDENT", "view")
        model_id = None
        if self.peek().type == "DOLLAR_IDENT":
            model_id = self.eat().value[1:]
        attrs = self.parse_attrs() if self.peek().type == "LBRACK" else {}
        self.eat("LBRACE")
        children = self.parse_body()
        self.eat("RBRACE")
        return {"model_id": model_id, "attrs": attrs, "children": children}

    def parse_body(self):
        children = []
        while self.peek().type != "RBRACE":
            children.append(self.parse_element())
        return children

    def parse_element(self):
        t = self.peek()
        if t.type == "DOLLAR_IDENT":
            return self.parse_id_ref()
        if t.type == "IDENT" and t.value == "connectors":
            return self.parse_connectors_block()
        if t.type == "IDENT" and t.value in LAYOUT_KEYWORDS:
            return self.parse_layout_block()
        raise SyntaxError(f"expected $id, layout keyword, or 'connectors', got {t}")

    def parse_connectors_block(self):
        """Parse `connectors { stmt* }` — a dedicated section for connector
        statements. Each stmt: <target> <operator> <target> [attrs]."""
        self.eat("IDENT")  # 'connectors'
        self.eat("LBRACE")
        statements = []
        while self.peek().type != "RBRACE":
            statements.append(self.parse_connector_stmt())
        self.eat("RBRACE")
        return {"kind": "connectors", "statements": statements}

    def parse_connector_stmt(self):
        """A single connector: <src> <op> <dst> [attrs]
        where <src>/<dst> = $id[.anchor]. <op> is one of:
          straight:    --   -->   <--   <-->
          HV (─┐):     -|   -|>   <-|   <-|>
          VH (│─):     |-   |->   <|-   <|->"""
        src = self.parse_endpoint()
        op_tok = self.peek()
        op_token_to_type = {
            "LINE":             "straight-none",
            "ARROW_RIGHT":      "straight-target",
            "ARROW_LEFT":       "straight-source",
            "ARROW_BIDI":       "straight-both",
            "LINE_HV":          "orthogonal-hv",
            "ORTHO_HV_TARGET":  "orthogonal-hv-target",
            "ORTHO_HV_SOURCE":  "orthogonal-hv-source",
            "ORTHO_HV_BIDI":    "orthogonal-hv-both",
            "LINE_VH":          "orthogonal-vh",
            "ORTHO_VH_TARGET":  "orthogonal-vh-target",
            "ORTHO_VH_SOURCE":  "orthogonal-vh-source",
            "ORTHO_VH_BIDI":    "orthogonal-vh-both",
        }
        if op_tok.type not in op_token_to_type:
            raise SyntaxError(
                "expected connector operator "
                "(-- --> <-- <--> -| -|> <-| <-|> |- |-> <|- <|->), "
                f"got {op_tok}")
        op_kind = op_token_to_type[op_tok.type]
        self.eat()
        dst = self.parse_endpoint()
        attrs = self.parse_attrs() if self.peek().type == "LBRACK" else {}
        return {
            "kind": "connector",
            "from": src,
            "to":   dst,
            "op":   op_kind,
            "attrs": attrs,
        }

    def parse_endpoint(self):
        """Parse $id[.anchor]. Anchor optional (defaults applied at compile)."""
        target = self.eat("DOLLAR_IDENT").value[1:]
        anchor = None
        if self.peek().type == "DOT":
            self.eat("DOT")
            anchor = self.eat("IDENT").value
        return {"target": target, "anchor": anchor}

    def parse_id_ref(self):
        rid = self.eat("DOLLAR_IDENT").value[1:]
        layout_kw, layout_args, attrs, cell = None, None, {}, None
        while True:
            t = self.peek()
            if t.type == "IDENT" and t.value in LAYOUT_KEYWORDS and layout_kw is None:
                layout_kw, layout_args = self._maybe_layout()
            elif t.type == "LBRACK":
                # Multiple `[...]` blocks merge — useful when attributes
                # belong to different concerns (placement vs layout vs style).
                attrs.update(self.parse_attrs())
            elif t.type == "IDENT" and t.value == "at" and cell is None:
                cell = self._maybe_cell_pos()
            else:
                break
        children = self._maybe_body()
        return {
            "kind": "ref", "id": rid,
            "layout": layout_kw, "layout_args": layout_args,
            "attrs": attrs, "cell": cell, "children": children,
        }

    def parse_layout_block(self):
        layout_kw, layout_args = self._maybe_layout(required=True)
        attrs, cell = {}, None
        while True:
            t = self.peek()
            if t.type == "LBRACK":
                attrs.update(self.parse_attrs())
            elif t.type == "IDENT" and t.value == "at" and cell is None:
                cell = self._maybe_cell_pos()
            else:
                break
        children = self._maybe_body(required=True)
        return {
            "kind": "layout",
            "layout": layout_kw, "layout_args": layout_args,
            "attrs": attrs, "cell": cell, "children": children,
        }

    def _maybe_layout(self, required=False):
        t = self.peek()
        if not (t.type == "IDENT" and t.value in LAYOUT_KEYWORDS):
            if required:
                raise SyntaxError(f"expected layout keyword, got {t}")
            return None, None
        kw = self.eat("IDENT").value
        args = None
        if kw in ("grid", "ugrid") and self.peek().type == "LPAREN":
            self.eat("LPAREN")
            cols = int(self.eat("NUMBER").value)
            self.eat("COMMA")
            rows = int(self.eat("NUMBER").value)
            self.eat("RPAREN")
            args = {"cols": cols, "rows": rows}
        return kw, args

    def _maybe_cell_pos(self):
        """Optional `at ...` placement. Returns one of:
           None
           {"kind": "cell", "col": int, "row": int}
           {"kind": "anchor-ref", "target": id, "anchor": name}        # legacy full
           {"kind": "axis-anchors", "h": {…} | None, "v": {…} | None}  # per-axis
        """
        if not self.at_keyword("at"):
            return None
        self.eat("IDENT")  # 'at'
        t = self.peek()
        if t.type == "LPAREN":
            self.eat("LPAREN")
            col = int(self.eat("NUMBER").value)
            self.eat("COMMA")
            row = int(self.eat("NUMBER").value)
            self.eat("RPAREN")
            return {"kind": "cell", "col": col, "row": row}
        if t.type == "DOLLAR_IDENT":
            target = self.eat("DOLLAR_IDENT").value[1:]
            anchor = "center"
            if self.peek().type == "DOT":
                self.eat("DOT")
                anchor = self.eat("IDENT").value
            return {"kind": "anchor-ref", "target": target, "anchor": anchor}
        if t.type == "IDENT" and t.value in ("horizontal", "vertical"):
            h, v = None, None
            while (self.peek().type == "IDENT"
                   and self.peek().value in ("horizontal", "vertical")):
                axis = self.eat("IDENT").value
                target = self.eat("DOLLAR_IDENT").value[1:]
                target_anchor = "center"
                if self.peek().type == "DOT":
                    self.eat("DOT")
                    target_anchor = self.eat("IDENT").value
                own_anchor = "center"
                distance = None
                # Optional `[anchor = NAME, distance = N]` block immediately after
                # the target binds to *this* axis. Only consume if the first key
                # is `anchor`; other brackets are element attrs and stay with
                # the outer parser.
                if (self.peek().type == "LBRACK"
                        and self.peek(1).type == "IDENT"
                        and self.peek(1).value == "anchor"):
                    bracket_attrs = self.parse_attrs()
                    own_anchor = bracket_attrs["anchor"]
                    distance = bracket_attrs.get("distance")
                    extra = [k for k in bracket_attrs if k not in ("anchor", "distance")]
                    if extra:
                        raise SyntaxError(
                            f"per-axis own-anchor bracket may only contain "
                            f"`anchor = NAME` and optional `distance = N`; "
                            f"got extra keys {extra}")
                record = {"target": target, "target_anchor": target_anchor,
                          "own_anchor": own_anchor}
                if distance is not None:
                    record["distance"] = distance
                if axis == "horizontal":
                    if h is not None:
                        raise SyntaxError("`horizontal` specified twice in `at`")
                    h = record
                else:
                    if v is not None:
                        raise SyntaxError("`vertical` specified twice in `at`")
                    v = record
            return {"kind": "axis-anchors", "h": h, "v": v}
        raise SyntaxError(
            f"`at` must be followed by (col, row), $id[.anchor], or "
            f"horizontal/vertical $id[.anchor]; got {t}")

    def _maybe_body(self, required=False):
        # None = no body (auto-expand for refs), [] = explicit empty, list = explicit
        if self.peek().type == "LBRACE":
            self.eat("LBRACE")
            kids = self.parse_body()
            self.eat("RBRACE")
            return kids
        if required:
            raise SyntaxError(f"expected '{{', got {self.peek()}")
        return None

    def parse_attrs(self):
        self.eat("LBRACK")
        attrs = {}
        while self.peek().type != "RBRACK":
            name = self.eat("IDENT").value
            if self.peek().type == "EQUALS":
                self.eat("EQUALS")
                attrs[name] = self.parse_value()
            else:
                attrs[name] = True
            if self.peek().type == "COMMA":
                self.eat("COMMA")
        self.eat("RBRACK")
        return attrs

    def parse_value(self):
        t = self.peek()
        if t.type == "NUMBER":
            v = self.eat().value
            return float(v) if "." in v else int(v)
        if t.type == "STRING":
            return self.eat().value[1:-1]
        if t.type == "HEXCOLOR":
            return self.eat().value
        if t.type == "IDENT":
            v = self.eat().value
            if v == "true":  return True
            if v == "false": return False
            return v
        if t.type == "LPAREN":
            # Tuple value. Single element parses as scalar; 4-element form is
            # WPF-Thickness order (top, right, bottom, left) and lowers to a
            # dict that the markup compiler's `edges()` already understands.
            self.eat("LPAREN")
            nums = [self.parse_value()]
            while self.peek().type == "COMMA":
                self.eat("COMMA")
                nums.append(self.parse_value())
            self.eat("RPAREN")
            if len(nums) == 1:
                return nums[0]
            if len(nums) == 4:
                return {"top": nums[0], "right": nums[1],
                        "bottom": nums[2], "left": nums[3]}
            raise SyntaxError(
                f"tuple value must have 1 or 4 elements (top, right, bottom, left); "
                f"got {len(nums)}")
        raise SyntaxError(f"unexpected value token: {t}")


# ---- AST -> YAML-form dict ----

def imports_to_dict(imports_ast):
    out = {}
    for imp in imports_ast:
        kind = imp["kind"]
        path = imp["path"]
        if "/" in path:
            full_path = path
        elif kind in LIBRARY_FOLDER:
            full_path = f"{LIBRARY_FOLDER[kind]}/{path}"
        else:
            full_path = path
        out[kind] = full_path
    return out


def _op_to_routing_arrow(op_kind):
    """Map the parser's combined operator-kind back into separate
    `routing` and `arrow-end` markup fields. The line-shape ops (`--`, `-->`,
    `<--`, `<-->`) leave `routing` as None so the connector style's setter
    (currently `orthogonal-auto`) decides the actual shape; the orthogonal
    ops keep their routing explicit. Arrow-bearing orthogonal variants
    (`-|>`, `<-|`, `<-|>`, `|->`, `<|-`, `<|->`) carry the same routing as
    their plain counterpart, plus the arrow direction."""
    return {
        "straight-none":          (None,             "none"),
        "straight-target":        (None,             "target"),
        "straight-source":        (None,             "source"),
        "straight-both":          (None,             "both"),
        "orthogonal-hv":          ("orthogonal-hv", "none"),
        "orthogonal-hv-target":   ("orthogonal-hv", "target"),
        "orthogonal-hv-source":   ("orthogonal-hv", "source"),
        "orthogonal-hv-both":     ("orthogonal-hv", "both"),
        "orthogonal-vh":          ("orthogonal-vh", "none"),
        "orthogonal-vh-target":   ("orthogonal-vh", "target"),
        "orthogonal-vh-source":   ("orthogonal-vh", "source"),
        "orthogonal-vh-both":     ("orthogonal-vh", "both"),
    }.get(op_kind, (None, "none"))


def translate_connectors_block(node):
    """Expand a connectors-block AST node into a list of
    {connector: {...}} markup dicts. One entry per statement."""
    out = []
    for stmt in node["statements"]:
        routing, arrow_end = _op_to_routing_arrow(stmt["op"])
        from_ep = {"target": stmt["from"]["target"]}
        if stmt["from"].get("anchor"):
            from_ep["anchor"] = stmt["from"]["anchor"]
        to_ep = {"target": stmt["to"]["target"]}
        if stmt["to"].get("anchor"):
            to_ep["anchor"] = stmt["to"]["anchor"]
        body = {
            "from":      from_ep,
            "to":        to_ep,
            "arrow-end": arrow_end,
        }
        if routing is not None:
            body["routing"] = routing
        # Per-connector style overrides — flat keys directly on the connector
        for k, v in stmt["attrs"].items():
            body[k] = v
        out.append({"connector": body})
    return out


def translate_node(node):
    kind = node["kind"]
    if kind == "ref":
        body = {"id": node["id"]}
        for k, v in node["attrs"].items():
            body[k] = v
        if node["layout"]:
            entry = {"kind": node["layout"]}
            if node["layout_args"]:
                entry.update(node["layout_args"])
            body["layout"] = entry
        cell = node.get("cell")
        if isinstance(cell, dict):
            if cell.get("kind") == "cell":
                body["at"] = [cell["col"], cell["row"]]
            elif cell.get("kind") == "anchor-ref":
                body["at"] = {"target": cell["target"], "anchor": cell["anchor"]}
            elif cell.get("kind") == "axis-anchors":
                body["at"] = {"kind": "axis-anchors",
                              "h": cell.get("h"), "v": cell.get("v")}
        elif cell:
            body["at"] = cell
        if node["children"] is not None:
            body["children"] = [translate_node(c) for c in node["children"]]
        return {"ref": body}
    kw = node["layout"]
    body = {}
    for k, v in node["attrs"].items():
        body[k] = v
    cell = node.get("cell")
    if isinstance(cell, dict):
        if cell.get("kind") == "cell":
            body["at"] = [cell["col"], cell["row"]]
        elif cell.get("kind") == "anchor-ref":
            body["at"] = {"target": cell["target"], "anchor": cell["anchor"]}
    elif cell:
        body["at"] = cell
    if node["layout_args"]:
        body.update(node["layout_args"])
    if node["children"]:
        body["children"] = [translate_node(c) for c in node["children"]]
    return {kw: body}


def ast_to_view_dict(ast, model_path):
    view = ast["view"]
    attrs = view["attrs"]
    children = []
    for c in view["children"]:
        if c.get("kind") == "connectors":
            # connectors-block expands into multiple {connector: {...}} dicts
            children.extend(translate_connectors_block(c))
        else:
            children.append(translate_node(c))
    return {
        "view": {
            "model":      model_path,
            "title":      attrs.get("title"),
            "background": attrs.get("background", "#FAFAF9"),
            "cell":       attrs.get("grid", 1),
            "padding":    attrs.get("padding"),
            "imports":    imports_to_dict(ast["imports"]) or DEFAULT_IMPORTS,
            "children":   children,
        }
    }


# ---- Model resolution ----

def resolve_model_path(model_id, project_root):
    for f in project_root.rglob("*.arch.yaml"):
        try:
            data = yaml.safe_load(open(f))
            if (data.get("meta") or {}).get("id") == model_id:
                return f.relative_to(project_root)
        except Exception:
            continue
    raise ValueError(f"no *.arch.yaml found with meta.id == '{model_id}' under {project_root}")


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


# ---- Model index + auto-expansion ----

def build_tech_registry(model):
    """Inline `custom-technologies:` declared at the architecture level. The
    markup compiler can't see imported tech libraries from outside the visual
    stack, so we pre-resolve any inline tech here and embed it on each component."""
    return dict(model.get("custom-technologies") or {})


def build_model_index(model):
    idx = {}
    for loc_id, loc in (model.get("locations") or {}).items():
        idx[loc_id] = {"kind": "location", "data": {**loc, "id": loc_id},
                       "parent": loc.get("parent")}
    for actor_id, actor in (model.get("actors") or {}).items():
        idx[actor_id] = {"kind": "actor", "data": {**actor, "id": actor_id}}
    for blk_id, blk in (model.get("blocks") or {}).items():
        idx[blk_id] = {"kind": "block", "data": {**blk, "id": blk_id},
                       "in": blk.get("in")}
        for comp in (blk.get("components") or []):
            idx[comp["id"]] = {"kind": "component", "data": {**comp},
                               "in_location": blk.get("in"),
                               "in_block":    blk_id}
    for loc_id, comps in (model.get("components") or {}).items():
        for comp in (comps or []):
            idx[comp["id"]] = {"kind": "component", "data": {**comp},
                               "in_location": loc_id,
                               "in_block":    None}
    return idx


def auto_expand_location(loc_id, model_idx):
    """Return view-level ref nodes for everything the model places inside loc_id:
    nested sub-locations, then blocks, then free components (not inside a block).
    Order preserves model declaration order within each group."""
    children = []
    for k, v in model_idx.items():
        if v["kind"] == "location" and v.get("parent") == loc_id:
            children.append({"ref": {"id": k}})
    for k, v in model_idx.items():
        if v["kind"] == "block" and v.get("in") == loc_id:
            children.append({"ref": {"id": k}})
    for k, v in model_idx.items():
        if (v["kind"] == "component"
                and v.get("in_location") == loc_id
                and not v.get("in_block")):
            children.append({"ref": {"id": k}})
    return children


def auto_expand_block(blk_id, model_idx):
    blk_data = model_idx[blk_id]["data"]
    return [{"ref": {"id": comp["id"]}} for comp in (blk_data.get("components") or [])]


# ---- Helpers ----

def label_to_string(label):
    if isinstance(label, list):
        return "\n".join(label)
    return label or ""


def location_visual(loc_data):
    return LOCATION_TYPE_DEFAULTS.get(loc_data.get("type") or "", DEFAULT_LOCATION_VISUAL)


def first_or_str(v):
    if isinstance(v, list):
        return v[0] if v else ""
    return v or ""


# ---- Compile ----

def compile_node(node, model_idx, tech_registry=None):
    if "hstack" in node: return compile_layout("horizontal", node["hstack"] or {}, model_idx, tech_registry)
    if "vstack" in node: return compile_layout("vertical",   node["vstack"] or {}, model_idx, tech_registry)
    if "grid"   in node: return compile_layout("vertical",   node["grid"]   or {}, model_idx, tech_registry)
    if "canvas" in node: return compile_layout("vertical",   node["canvas"] or {}, model_idx, tech_registry)
    if "group"  in node: return compile_layout("vertical",   node["group"]  or {}, model_idx, tech_registry)
    if "dock"   in node: return compile_layout("vertical",   node["dock"]   or {}, model_idx, tech_registry)
    if "ref"    in node: return compile_ref(node["ref"] or {}, model_idx, tech_registry)
    if "connector" in node:
        # Connectors pass through to the lower-level markup unchanged.
        # The markup compiler resolves endpoints and emits geometry.
        return {"connector": node["connector"]}
    raise ValueError(f"unknown view node - keys: {list(node.keys())}")


def compile_layout(orientation, body, model_idx, tech_registry=None):
    children = []
    for child in (body.get("children") or []):
        compiled = compile_node(child, model_idx, tech_registry)
        if compiled is not None:
            children.append(compiled)
    stack = {"orientation": orientation, "children": children}
    for k in ("width", "height", "min-width", "min-height", "max-width", "max-height",
              "fill-color", "stroke-color", "padding", "margin", "h-align", "v-align", "wrap"):
        if k in body:
            stack[k] = body[k]
    return {"stack": stack}


def compile_ref(body, model_idx, tech_registry=None):
    if "id" not in body:
        raise ValueError(f"ref missing 'id': {body}")
    rid = body["id"]
    if rid not in model_idx:
        raise ValueError(f"ref id '{rid}' not found in architecture model")
    entry = model_idx[rid]
    kind = entry["kind"]
    data = entry["data"]
    if kind == "location":  return compile_ref_location(rid, body, data, model_idx, tech_registry)
    if kind == "block":     return compile_ref_block(rid, body, data, model_idx, tech_registry)
    if kind == "actor":     return compile_ref_actor(rid, body, data)
    if kind == "component": return compile_ref_component(rid, body, data, tech_registry)
    raise ValueError(f"unsupported model element kind '{kind}' for id '{rid}'")


def _resolve_children(body, auto_fn, model_idx, tech_registry=None):
    """Resolve children for refs that can auto-expand:
       'children' absent  -> auto-expand from model
       'children': []     -> explicit empty
       'children': [...]  -> explicit list"""
    if "children" in body:
        src = body["children"] or []
    else:
        src = auto_fn()
    return [compile_node(c, model_idx, tech_registry) for c in src]


def compile_ref_location(rid, body, data, model_idx, tech_registry=None):
    visual = location_visual(data)
    loc = {
        "id":           rid,
        "title":        label_to_string(data.get("label")) or rid,
        "kind":         body.get("kind",         visual["kind"]),
        "fill-color":   body.get("fill-color",   visual["fill"]),
        "stroke-color": body.get("stroke-color", visual["stroke"]),
    }
    for k in ("width", "height", "min-width", "min-height", "max-width", "max-height",
              "x", "y", "padding", "margin", "cell", "colspan", "rowspan", "stretch", "alignment", "anchor"):
        if k in body:
            loc[k] = body[k]
    _apply_at(loc, body.get("at"))
    # `$id ugrid(C, R)` becomes items-layout / items-cols / items-rows on the
    # location (the markup compiler propagates these to the items-presenter).
    if isinstance(body.get("layout"), dict):
        lay = body["layout"]
        kind = lay.get("kind")
        if kind == "ugrid":
            loc["items-layout"] = "ugrid"
            if "cols" in lay: loc["items-cols"] = lay["cols"]
            if "rows" in lay: loc["items-rows"] = lay["rows"]
            # Bare `ugrid` (no parens) -> implicit autofit. Sized
            # `ugrid(C, R)` is strict by default; explicit autofit attr
            # overrides either way.
            if "cols" not in lay and "rows" not in lay:
                loc["items-autofit"] = True
            if "autofit" in body: loc["items-autofit"] = body["autofit"]
            if "show-cells" in body: loc["items-show-cells"] = body["show-cells"]
        elif kind == "hstack":
            loc["items-layout"] = "stack-panel-horizontal"
        elif kind == "vstack":
            loc["items-layout"] = "stack-panel-vertical"
        elif kind == "canvas":
            loc["items-layout"] = "canvas"
        # Items-layout alignment passthrough (meaningful for stack-panel layouts).
        if "h-align" in body: loc["items-h-align"] = body["h-align"]
        if "v-align" in body: loc["items-v-align"] = body["v-align"]
    kids = _resolve_children(body, lambda: auto_expand_location(rid, model_idx), model_idx, tech_registry)
    if kids:
        loc["children"] = kids
    return {"location": loc}


def compile_ref_block(rid, body, data, model_idx, tech_registry=None):
    blk = {
        "id":    rid,
        "title": label_to_string(data.get("label")) or rid,
    }
    for k in ("width", "height", "min-width", "min-height", "max-width", "max-height",
              "x", "y", "fill-color", "stroke-color", "padding", "margin", "cell", "colspan", "rowspan", "stretch", "alignment", "anchor"):
        if k in body:
            blk[k] = body[k]
    _apply_at(blk, body.get("at"))
    if isinstance(body.get("layout"), dict):
        lay = body["layout"]
        kind = lay.get("kind")
        if kind == "ugrid":
            blk["items-layout"] = "ugrid"
            if "cols" in lay: blk["items-cols"] = lay["cols"]
            if "rows" in lay: blk["items-rows"] = lay["rows"]
            if "cols" not in lay and "rows" not in lay:
                blk["items-autofit"] = True
            if "autofit" in body: blk["items-autofit"] = body["autofit"]
            if "show-cells" in body: blk["items-show-cells"] = body["show-cells"]
        elif kind == "hstack":
            blk["items-layout"] = "stack-panel-horizontal"
        elif kind == "vstack":
            blk["items-layout"] = "stack-panel-vertical"
        elif kind == "canvas":
            blk["items-layout"] = "canvas"
        if "h-align" in body: blk["items-h-align"] = body["h-align"]
        if "v-align" in body: blk["items-v-align"] = body["v-align"]
    kids = _resolve_children(body, lambda: auto_expand_block(rid, model_idx), model_idx, tech_registry)
    if kids:
        blk["children"] = kids
    return {"building-block": blk}


def compile_ref_actor(rid, body, data):
    actor = {
        "id":    rid,
        "label": data.get("label") or rid,
        "type":  data.get("type") or "internal",
    }
    _apply_at(actor, body.get("at"))
    for k in ("width", "height", "min-width", "min-height", "max-width", "max-height",
              "x", "y", "colspan", "rowspan", "stretch", "alignment", "anchor"):
        if k in body:
            actor[k] = body[k]
    return {"actor": actor}


def compile_ref_component(rid, body, data, tech_registry=None):
    impl = first_or_str(data.get("implemented-by"))
    comp = {
        "id":             rid,
        "label":          data.get("label") or rid,
        "category":       data.get("category") or "service",
        "implemented-by": impl,
    }
    # Embed an inline tech record so the markup compiler doesn't have to look
    # outside its world. Only emits when the architecture declared this tech
    # inline; otherwise the technology library handles it downstream.
    if tech_registry and impl in tech_registry:
        t = tech_registry[impl]
        comp["technology"] = {
            "id":    impl,
            "label": t.get("label", impl),
            "icon":  t.get("icon"),
        }
    _apply_at(comp, body.get("at"))
    for k in ("width", "height", "min-width", "min-height", "max-width", "max-height",
              "x", "y", "colspan", "rowspan", "stretch", "alignment", "anchor"):
        if k in body:
            comp[k] = body[k]
    return {"component": comp}


def _apply_at(target_dict, at):
    """Translate body['at'] into the right key(s) on the element dict.
    Handles cell coords (list), legacy single-anchor (dict with `target`),
    and per-axis anchors (dict with `kind == "axis-anchors"`)."""
    if at is None:
        return
    if isinstance(at, dict):
        if at.get("kind") == "axis-anchors":
            if at.get("h"):
                h_ref = {
                    "target": at["h"]["target"],
                    "anchor": at["h"]["target_anchor"],
                    "own_anchor": at["h"]["own_anchor"],
                }
                if "distance" in at["h"]:
                    h_ref["distance"] = at["h"]["distance"]
                target_dict["h-anchor-ref"] = h_ref
            if at.get("v"):
                v_ref = {
                    "target": at["v"]["target"],
                    "anchor": at["v"]["target_anchor"],
                    "own_anchor": at["v"]["own_anchor"],
                }
                if "distance" in at["v"]:
                    v_ref["distance"] = at["v"]["distance"]
                target_dict["v-anchor-ref"] = v_ref
        elif "target" in at:
            target_dict["anchor-ref"] = {
                "target": at["target"],
                "anchor": at.get("anchor", "center"),
            }
    elif "cell" not in target_dict:
        target_dict["cell"] = at


def compile_view(view_yaml, model):
    view = view_yaml.get("view")
    if view is None:
        raise ValueError("missing top-level 'view' key")
    model_idx = build_model_index(model)
    tech_registry = build_tech_registry(model)
    out = {
        "canvas": {
            "background": view.get("background", "#FAFAF9"),
            "grid": {"cell": view.get("cell", 1)},
            "padding": view.get("padding"),
        },
        "imports": view.get("imports") or DEFAULT_IMPORTS,
        "elements": [],
    }
    for child in (view.get("children") or []):
        compiled = compile_node(child, model_idx, tech_registry)
        if compiled is not None:
            out["elements"].append(compiled)
    return out


# ---- Frontend dispatch ----

def load_view_input(in_path, project_root):
    name = in_path.name.lower()
    if name.endswith(".view.yaml") or name.endswith(".yaml"):
        view_yaml = load_yaml(in_path)
        model_path = (view_yaml.get("view") or {}).get("model")
        if not model_path:
            raise ValueError("view.model not specified in YAML input")
        return view_yaml, model_path
    text = open(in_path).read()
    tokens = tokenize(text)
    ast = Parser(tokens).parse_file()
    model_id = ast["view"]["model_id"]
    if not model_id:
        raise ValueError("view block missing model id ($id)")
    model_path = resolve_model_path(model_id, project_root)
    view_yaml = ast_to_view_dict(ast, str(model_path).replace("\\", "/"))
    return view_yaml, str(model_path)


# ---- CLI ----

def find_project_root(start):
    cur = start
    for _ in range(10):
        if (cur / "visual_engine").exists() and (cur / "visual_libraries").exists():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    return start


def main():
    ap = argparse.ArgumentParser(description="Compile view-level markup into lower-level markup.")
    ap.add_argument("input")
    ap.add_argument("-o", "--output", default=None)
    ap.add_argument("--root", default=None)
    args = ap.parse_args()

    in_path = Path(args.input).resolve()
    if args.output:
        out_path = Path(args.output).resolve()
    else:
        name = in_path.name
        if name.endswith(".view.yaml"):
            stem = name[:-len(".view.yaml")]
        elif name.endswith(".view"):
            stem = name[:-len(".view")]
        else:
            stem = in_path.stem
        out_path = in_path.parent / f"{stem}.gen.markup"

    root = Path(args.root).resolve() if args.root else find_project_root(in_path.parent)

    view_yaml, model_path = load_view_input(in_path, root)
    model_full = (root / model_path).resolve()
    if not model_full.exists():
        print(f"error: model file not found: {model_full}", file=sys.stderr)
        sys.exit(2)
    model = load_yaml(model_full)

    out = compile_view(view_yaml, model)

    with open(out_path, "w") as f:
        f.write(f"# Auto-generated by view_compiler from: {in_path.name}\n")
        f.write(f"# Source model: {model_path}\n\n")
        yaml.safe_dump(out, f, sort_keys=False)
    print(f"view -> markup: {out_path}")


if __name__ == "__main__":
    main()
