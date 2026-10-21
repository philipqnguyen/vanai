"""Skin weights from the shape description itself (numpy).

A vertex of the organic body belongs to the bones of the leaves it lies near,
each weighted by a Gaussian of its distance to that leaf's surface: on the
mid-shin only the shin is near, at the knee thigh and shin are equally near,
and the fillet the smooth union made between them blends exactly as the shape
did. Rigid parts (armour, eyes, teeth, claws) go wholly to their own bone.
A few Laplacian passes over the mesh edges then even out the seams, and every
vertex keeps its four strongest bones (glTF's limit) normalised to one.

This replaces Blender's bone-heat weighting, which fails outright on meshes
with separate shells (eyes, teeth) and bleeds a leg into its neighbour.
"""
from __future__ import annotations

import numpy as np


def skin_weights(P, vpart, leaves, part_bones, names, falloff, edges=None, smooth_iters=3, organic_parts=(0,)):
    """P (V,3) creature space; vpart (V,) part id per vertex; leaves: the
    organic body's leaves; part_bones: {part id: {bone: w}} for rigid parts;
    names: bone order. Returns (V, B) weights, four per row at most."""
    V, B = len(P), len(names)
    col = {n: i for i, n in enumerate(names)}
    W = np.zeros((V, B))
    org = np.isin(vpart, organic_parts)
    if org.any():
        Q = P[org]
        Wo = np.zeros((len(Q), B))
        for lf in leaves:
            if not lf.weight or lf.bone is None:
                continue
            d = np.maximum(lf.eval(Q), 0.0)
            s = getattr(lf, "falloff", None) or falloff
            w = np.exp(-(d / s) ** 2)
            bi = col[lf.bone]
            Wo[:, bi] = np.maximum(Wo[:, bi], w)
        # a vertex no leaf claims (far out on a displaced tuft) goes to its nearest
        lost = Wo.sum(1) < 1e-6
        if lost.any():
            dmin = np.full(lost.sum(), np.inf)
            best = np.zeros(lost.sum(), dtype=int)
            for lf in leaves:
                if not lf.weight or lf.bone is None:
                    continue
                d = lf.eval(Q[lost])
                better = d < dmin
                dmin[better] = d[better]
                best[better] = col[lf.bone]
            Wo[np.nonzero(lost)[0], best] = 1.0
        W[org] = Wo
    for pid, bones in part_bones.items():
        m = vpart == pid
        for bname, w in bones.items():
            W[m, col[bname]] = w
    W = _top4(W)
    if edges is not None and smooth_iters and org.any():
        a, b = edges[:, 0], edges[:, 1]
        # smooth only within a piece: an edge never joins two parts, so this
        # keeps the body's weights from bleeding into a wrapping or back
        keep = org[a] & org[b] & (vpart[a] == vpart[b])
        a, b = a[keep], b[keep]
        for _ in range(smooth_iters):
            acc = W.copy()
            cnt = np.ones(V)
            np.add.at(acc, a, W[b])
            np.add.at(acc, b, W[a])
            np.add.at(cnt, a, 1)
            np.add.at(cnt, b, 1)
            Wn = acc / cnt[:, None]
            W = np.where(org[:, None], 0.5 * W + 0.5 * Wn, W)
        W = _top4(W)
    return W


def _top4(W):
    W = W.copy()
    if W.shape[1] > 4:
        thresh = -np.sort(-W, axis=1)[:, 3:4]
        W[W < thresh] = 0
        # ties can leave five; drop the extras by index order
        over = (W > 0).sum(1) > 4
        for i in np.nonzero(over)[0]:
            nz = np.nonzero(W[i])[0]
            order = nz[np.argsort(-W[i, nz], kind="stable")]
            W[i, order[4:]] = 0
    # drop crumbs, but never a row's strongest bone: a vertex far out on a
    # tuft can have every weight tiny, and must still follow something
    W[(W < 0.01) & (W < W.max(1, keepdims=True))] = 0
    s = W.sum(1, keepdims=True)
    return W / np.maximum(s, 1e-9)
