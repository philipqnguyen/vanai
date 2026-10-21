# Package A's atlas cells (pkgA1..pkgA3), painted into the shared dungeon-props atlas by
# atlas.py, which calls paint(name, h, w, T) for each and keeps the grey default on None.
# T is atlas.Tools: fnoise(h, w, sx, sy, seed), mix, rgb(h, w, colour), smooth, dents.
# Return (albedo HxWx3 in 0..1, height HxW) -- see atlas.py's painters for the style.
#
# pkgA1  a tablecloth's drop: linen with a woven border at the hem. fam_furniture.mjs
#        `drape(..., { hemBand: true })` maps each drop's full height onto the cell's
#        height (t = 0.98 x the fraction down), so the cell is read squashed ~3.4x
#        in v: the weave is painted that much taller to come out square, and the
#        band at v 0.68-0.92 lands ~7 cm above the hem.
# pkgA2  a twill wool blanket, near white: fam_furniture.mjs dyes it per bed.
# pkgA3  bed ticking for straw ticks and pillows: narrow stripes that run along a
#        tick's length (U), so they vary across U.
import numpy as np


def paint(name, h, w, T):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    if name == 'pkgA1':
        squash = 3.4
        jx = (T.fnoise(h, w, 50, 4, 501) - .5) * .8
        warp = .5 + .5 * np.sin((xx + jx) / 3.0 * np.pi * 2)
        weft = .5 + .5 * np.sin(yy / (3.0 * squash) * np.pi * 2)
        wv = .3 * warp + .4 * weft + .2 * warp * weft
        col = T.rgb(h, w, (.80, .76, .66)) * (.82 + .2 * wv + .08 * (T.fnoise(h, w, 50, 15, 502) - .5))[..., None]
        v = yy / h
        madder, indigo, cream = (.52, .20, .15), (.20, .25, .38), (.84, .76, .58)

        def band(v0, v1):
            return T.smooth(v0 - .004, v0 + .004, v) * (1 - T.smooth(v1 - .004, v1 + .004, v))
        col = T.mix(col, T.rgb(h, w, madder) * (.85 + .2 * wv)[..., None], band(.68, .70) + band(.895, .915))
        ind = band(.72, .875)
        col = T.mix(col, T.rgb(h, w, indigo) * (.85 + .25 * wv)[..., None], ind)
        # a cream lozenge chain woven into the indigo, 24 px repeat
        cx = (xx % 24) - 12
        d = np.abs(cx) / 9 + np.abs((v - .7975) / .06)
        motif = ((d < 1.0) & (d > .55)) | (d < .22)
        col = T.mix(col, T.rgb(h, w, cream) * (.85 + .2 * wv)[..., None], motif * ind * .9)
        # the hem: a turned edge, a shade line above it
        col = col * (1 - .25 * band(.945, .955) - .12 * T.smooth(.975, 1.0, v))[..., None]
        return col, wv * .6 + .3 * band(.68, .92) + .5 * band(.955, 1.0)
    if name == 'pkgA2':
        tw = .5 + .5 * np.sin((xx + yy) / 6.0 * np.pi * 2 + (T.fnoise(h, w, 40, 40, 511) - .5) * 2)
        fuzz = T.fnoise(h, w, 2, 2, 512)
        felt = T.fnoise(h, w, 30, 30, 513)
        pill = T.smooth(.8, .95, T.fnoise(h, w, 4, 4, 514))
        col = T.rgb(h, w, (.86, .84, .80)) * (.76 + .14 * tw + .1 * fuzz + .1 * (felt - .5) - .06 * pill)[..., None]
        return col, .55 * tw + .3 * fuzz + .2 * pill
    if name == 'pkgA3':
        p = xx % 10
        stripe = ((p < 3) | ((p >= 5) & (p < 6))).astype(float)
        stripe = np.clip(stripe * (.85 + .3 * T.fnoise(h, w, 2, 60, 521)), 0, 1)
        weave = .5 + .5 * np.sin(yy / 2.0 * np.pi * 2) * np.sin(xx / 2.0 * np.pi * 2)
        col = T.mix(T.rgb(h, w, (.78, .73, .60)), T.rgb(h, w, (.40, .42, .46)), stripe * .55)
        col = col * (.86 + .1 * weave + .12 * (T.fnoise(h, w, 40, 40, 522) - .5))[..., None]
        stain = T.smooth(.7, .92, T.fnoise(h, w, 60, 60, 523))
        col = T.mix(col, T.rgb(h, w, (.55, .44, .28)), stain * .35)
        return col, .3 * weave + .7 * T.fnoise(h, w, 25, 25, 524)
    return None
