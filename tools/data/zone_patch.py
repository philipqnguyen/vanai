#!/usr/bin/env python3
"""Safe concurrent edits of shared/data/*.json.

Several agents editing zones.json at once with read-modify-write would each
write back the file they read, and the last writer would silently drop
everyone else's changes. This tool applies a list of operations under one
exclusive lock (fcntl.flock on tmp/zone_patch.lock), re-reading the file
inside the lock, so concurrent patches serialise instead of overwriting each
other.

It writes json.dumps(indent=2, ensure_ascii=False) + "\\n", which reproduces
zones.json, quests.json, items.json, monsters.json, abilities.json,
recipes.json and ferry.json byte for byte (checked 2026-10-10). jobs.json is
hand-formatted and does NOT round-trip, so before writing, the tool checks
that the file it read round-trips and refuses otherwise -- a patch must never
reformat a file as a side effect. (--reformat overrides, deliberately.)

Usage:

  python3 tools/data/zone_patch.py patch.json [--dry-run]
  python3 tools/data/zone_patch.py --show zones.json moonmereshores portals '{"to":"summerlakes"}'

patch.json is a list of operations (or {"ops": [...]}):

  [
    {"file": "zones.json", "path": ["huntingwood", "spawn"], "op": "set", "value": {"x": -262, "z": -28}},
    {"file": "zones.json", "path": ["huntingwood", "portals", {"to": "reservoir"}, "x"], "op": "set", "value": -30},
    {"file": "zones.json", "path": ["huntingwood", "landmarks"], "op": "append", "value": {"name": "The Ride's End", "x": 290, "z": -60}},
    {"file": "zones.json", "path": ["huntingwood", "portals", {"to": "mausoleum"}], "op": "merge", "value": {"tx": 0, "tz": -100}},
    {"file": "zones.json", "path": ["huntingwood", "nodes", 3], "op": "delete"}
  ]

  file  a name in shared/data (or a path)
  path  keys into dicts, integer indices into lists, or a selector object
        {"field": value, ...} that must match EXACTLY ONE element of a list
        (every given field equal) -- so a patch can name "the portal to the
        reservoir" rather than an index another agent may have shifted
  op    set     replace (or create, for a dict key) the value at path
        delete  remove the dict key / list element at path
        append  push value onto the list at path
        merge   shallow-update the dict at path with value's keys

All operations of one patch apply, or none do: any failing op aborts the whole
patch before anything is written. Each touched file is written atomically
(temp file + rename).

--show prints the JSON at a path (same path syntax; each path element given
as a separate argument, parsed as JSON when it parses, else a string).
"""
import fcntl
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "shared", "data")
LOCK = os.path.join(ROOT, "tmp", "zone_patch.lock")


class PatchError(Exception):
    pass


def data_file(name):
    p = name if os.path.isabs(name) or os.sep in name else os.path.join(DATA, name)
    if not os.path.exists(p):
        raise PatchError(f"no such data file: {p}")
    return p


def dump(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def step(node, key, where):
    if isinstance(key, dict):
        if not isinstance(node, list):
            raise PatchError(f"{where}: selector {key} on a {type(node).__name__}, not a list")
        hits = [i for i, el in enumerate(node) if isinstance(el, dict) and all(k in el and el[k] == v for k, v in key.items())]
        if len(hits) != 1:
            raise PatchError(f"{where}: selector {json.dumps(key)} matched {len(hits)} elements, need exactly 1")
        return hits[0]
    if isinstance(node, list):
        if not isinstance(key, int) or not -len(node) <= key < len(node):
            raise PatchError(f"{where}: bad list index {key!r} (length {len(node)})")
        return key
    if isinstance(node, dict):
        if not isinstance(key, str):
            raise PatchError(f"{where}: dict key must be a string, got {key!r}")
        return key
    raise PatchError(f"{where}: cannot index into a {type(node).__name__}")


def resolve(doc, path, where):
    """Walk to the parent of the last path element; return (parent, last key)."""
    if not path:
        raise PatchError(f"{where}: empty path")
    node = doc
    for i, key in enumerate(path[:-1]):
        k = step(node, key, f"{where} at {path[:i + 1]}")
        if isinstance(node, dict) and k not in node:
            raise PatchError(f"{where}: no key {k!r} at {path[:i + 1]}")
        node = node[k]
    return node, step(node, path[-1], f"{where} at {path}")


def apply_op(doc, op, where):
    kind, path = op.get("op"), op.get("path")
    if not isinstance(path, list):
        raise PatchError(f"{where}: path must be a list")
    parent, key = resolve(doc, path, where)
    if kind == "set":
        if "value" not in op:
            raise PatchError(f"{where}: set needs a value")
        parent[key] = op["value"]
    elif kind == "delete":
        if isinstance(parent, dict) and key not in parent:
            raise PatchError(f"{where}: no key {key!r} to delete")
        del parent[key]
    elif kind in ("append", "merge"):
        if isinstance(parent, dict) and key not in parent:
            raise PatchError(f"{where}: no key {key!r}")
        target = parent[key]
        if kind == "append":
            if not isinstance(target, list):
                raise PatchError(f"{where}: append target is a {type(target).__name__}, not a list")
            target.append(op["value"])
        else:
            if not isinstance(target, dict) or not isinstance(op.get("value"), dict):
                raise PatchError(f"{where}: merge needs a dict target and a dict value")
            target.update(op["value"])
    else:
        raise PatchError(f"{where}: unknown op {kind!r} (set, delete, append, merge)")


def write_atomic(path, text):
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".zone_patch.", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, os.stat(path).st_mode & 0o777)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def patch(ops, dry_run=False, reformat=False):
    os.makedirs(os.path.dirname(LOCK), exist_ok=True)
    with open(LOCK, "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            docs = {}
            for i, op in enumerate(ops):
                where = f"op {i} ({op.get('op')} {op.get('file')})"
                p = data_file(op.get("file", ""))
                if p not in docs:
                    # read INSIDE the lock: whatever another agent wrote a
                    # moment ago is what this patch builds on
                    with open(p, encoding="utf-8") as f:
                        text = f.read()
                    doc = json.loads(text)
                    if dump(doc) != text and not reformat:
                        raise PatchError(f"{os.path.basename(p)} does not round-trip through json.dumps(indent=2); refusing to reformat it (--reformat to override)")
                    docs[p] = doc
                apply_op(docs[p], op, where)
            for p, doc in docs.items():
                if dry_run:
                    print(f"dry run: would write {os.path.relpath(p, ROOT)}")
                else:
                    write_atomic(p, dump(doc))
                    print(f"wrote {os.path.relpath(p, ROOT)}")
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def parse_path_arg(a):
    try:
        return json.loads(a)
    except ValueError:
        return a


def show(name, path):
    with open(data_file(name), encoding="utf-8") as f:
        node = json.load(f)
    for i, key in enumerate(path):
        k = step(node, key, f"--show at {path[:i + 1]}")
        if isinstance(node, dict) and k not in node:
            raise PatchError(f"--show: no key {k!r} at {path[:i + 1]}")
        node = node[k]
    print(json.dumps(node, indent=2, ensure_ascii=False))


def main(argv):
    try:
        if argv and argv[0] == "--show":
            if len(argv) < 2:
                raise PatchError("--show <file> [path...]")
            show(argv[1], [parse_path_arg(a) for a in argv[2:]])
            return 0
        files = [a for a in argv if not a.startswith("--")]
        if len(files) != 1:
            print(__doc__)
            return 2
        with open(files[0], encoding="utf-8") as f:
            ops = json.load(f)
        if isinstance(ops, dict):
            ops = ops.get("ops", [ops])
        patch(ops, dry_run="--dry-run" in argv, reformat="--reformat" in argv)
        return 0
    except (PatchError, ValueError, OSError) as e:
        print(f"zone_patch: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
