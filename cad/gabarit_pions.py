"""Gabarit de pliage à pions pour l'armature (clous Ø2.92, tête Ø6 glissés par dessous).

Plaque pleine et rigide :
  * contour = enveloppe convexe du tracé du fil + marge (pas de zones fines),
  * épaisseur constante, chanfreins sur les arêtes,
  * trous de pions avec jeu (les trous FDM sortent sous-dimensionnés),
  * lamage par dessous pour noyer la tête des clous (le gabarit pose à plat),
  * 2 trous fraisés pour visser le gabarit sur une planchette,
  * tracé du fil gravé sur le dessus + traits de coupe des retours.

Une éprouvette (out/gabarit_eprouvette.stl) donne 5 diamètres de trou pour
choisir le bon jeu sur ton imprimante avant d'imprimer le gabarit.

Lancer :  python3 cad/gabarit_pions.py   -> out/gabarit_pions_impression.stl, .step, eprouvette
"""
import math
import os
import sys

import cadquery as cq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armature import Armature  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")

G = dict(
    trou_d=3.4,          # Ø du trou de pion (clou Ø2.92 + 0.5 de jeu ; FDM resserre ~0.2)
    tete_d=6.0,          # Ø tête de clou
    tete_jeu=0.8,        # jeu sur le Ø du lamage -> Ø6.8
    tete_h=1.2,          # épaisseur de la tête (à mesurer)
    lamage_marge=0.4,    # profondeur de lamage = tete_h + marge
    ep=6.0,              # épaisseur de la plaque
    marge=7.0,           # marge du contour autour des pions / du fil
    chanfrein=0.8,
    vis_d=3.4, vis_tete_d=6.5,   # trous de fixation (vis Ø3 tête fraisée)
    trace_l=0.4,         # jeu sur la largeur de la gravure du fil
    trace_p=0.8,         # profondeur de la gravure
    trait_l=0.6, trait_p=0.4, trait_long=7.0,   # traits de coupe des retours
    eprouvette=(3.1, 3.2, 3.3, 3.4, 3.5),
)


def _hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def _contour(a):
    """Enveloppe convexe des pions + du fil, élargie de `marge` (cercles échantillonnés)."""
    m = G["marge"]
    pts = []
    src = [p["c"] for p in a.pions] + a.pts[::4]
    for (x, y) in src:
        for k in range(24):
            t = 2 * math.pi * k / 24
            pts.append((round(x + m * math.cos(t), 4), round(y + m * math.sin(t), 4)))
    return _hull(pts)


def _dist_bord(poly, x, y):
    best = 1e9
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        vx, vy = bx - ax, by - ay
        l2 = vx * vx + vy * vy
        t = max(0, min(1, ((x - ax) * vx + (y - ay) * vy) / l2))
        best = min(best, math.hypot(x - ax - t * vx, y - ay - t * vy))
    return best


def _dedans(poly, x, y):
    c = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            c = not c
    return c


def positions_vis(a):
    """2 trous de vis : le point le plus dégagé (fil, lamages, bord) dans chaque moitié."""
    poly = _contour(a)
    lam_r = (G["tete_d"] + G["tete_jeu"]) / 2
    xs = [p[0] for p in poly]
    x0, x1 = min(xs), max(xs)
    ys = [p[1] for p in poly]
    res = []
    xv = a.reperes["xv"]
    for (xa, xb) in ((x0, xv - 4), (xv + 25, x1)):
        best = None
        x = xa
        while x < xb:
            y = min(ys)
            while y < max(ys):
                if not _dedans(poly, x, y):
                    y += 0.5
                    continue
                m = min(a.distance_point(x, y) - a.d / 2 - G["trace_l"],
                        min(math.dist((x, y), q["c"]) - lam_r for q in a.pions),
                        _dist_bord(poly, x, y))
                if best is None or m > best[0]:
                    best = (m, (round(x, 2), round(y, 2)))
                y += 0.5
            x += 0.5
        res.append(best[1])
    return res


def construire(a=None):
    a = a or Armature()
    H = G["ep"]
    lam_d = G["tete_d"] + G["tete_jeu"]
    lam_h = G["tete_h"] + G["lamage_marge"]
    plaque = cq.Workplane("XY").polyline(_contour(a)).close().extrude(H)
    try:
        plaque = plaque.edges("not |Z").chamfer(G["chanfrein"])
    except Exception as e:
        print("chanfrein ignoré", e)
    # trous de pions + lamages par dessous
    for p in a.pions:
        x, y = p["c"]
        plaque = plaque.cut(cq.Workplane("XY").circle(G["trou_d"] / 2).extrude(H + 2).translate((x, y, -1)))
        plaque = plaque.cut(cq.Workplane("XY").circle(lam_d / 2).extrude(lam_h + 1).translate((x, y, -1)))
    # trous de fixation (fraisés par dessus) dans les zones libres
    vis = positions_vis(a)
    for (x, y) in vis:
        plaque = plaque.cut(cq.Workplane("XY").circle(G["vis_d"] / 2).extrude(H + 2).translate((x, y, -1)))
        fr = (cq.Workplane("XY").workplane(offset=H - (G["vis_tete_d"] - G["vis_d"]) / 2)
              .circle(G["vis_d"] / 2).workplane(offset=(G["vis_tete_d"] - G["vis_d"]) / 2 + 0.01)
              .circle(G["vis_tete_d"] / 2).loft().translate((x, y, 0)))
        plaque = plaque.cut(fr)
    # gravure du tracé du fil
    w = cq.Wire.makePolygon([cq.Vector(x, y, 0) for x, y in a.pts])
    ft = cq.Face.makeFromWires(w.offset2D(a.d / 2 + G["trace_l"] / 2, "arc")[0])
    trace = cq.Workplane("XY").add(
        cq.Solid.extrudeLinear(ft, cq.Vector(0, 0, G["trace_p"] + 1))).translate((0, 0, H - G["trace_p"]))
    plaque = plaque.cut(trace)
    h = a.d / 2
    for (x, y) in ((a.x_retour_nez, a.y_nez + h), (a.x_retour_queue, a.y_queue + h)):
        t = (cq.Workplane("XY").rect(G["trait_l"], G["trait_long"]).extrude(G["trait_p"] + 1)
             .translate((x, y, H - G["trait_p"])))
        plaque = plaque.cut(t)
    # numéros des pions gravés à côté de chaque trou, du côté le plus éloigné du fil
    autres = [q["c"] for q in a.pions]
    for i, p in enumerate(a.pions):
        x, y = p["c"]
        best = None
        for k in range(16):
            t = 2 * math.pi * k / 16
            cx, cy = x + 4.6 * math.cos(t), y + 4.6 * math.sin(t)
            dmin = min(a.distance_point(cx, cy) - a.d / 2,
                       min(math.dist((cx, cy), o) - lam_d / 2 for o in autres))
            if best is None or dmin > best[0]:
                best = (dmin, cx, cy)
        _, cx, cy = best
        txt = (cq.Workplane("XY").workplane(offset=H - 0.5)
               .text(str(i + 1), 3.0, 1.0, kind="bold", halign="center", valign="center")
               .translate((cx, cy, 0)))
        plaque = plaque.cut(txt)
    return plaque, dict(H=H, lam_d=lam_d, lam_h=lam_h, vis=vis)


def eprouvette():
    """Plaquette de test : 5 trous (diamètres G['eprouvette']) avec leur lamage."""
    n = len(G["eprouvette"])
    pas = 9.0
    H = 4.0
    lam_d = G["tete_d"] + G["tete_jeu"]
    lam_h = G["tete_h"] + G["lamage_marge"]
    e = cq.Workplane("XY").box(pas * n, 12, H, centered=(False, True, False)).edges("|Z").fillet(1.5)
    for i, dd in enumerate(G["eprouvette"]):
        x = pas * (i + 0.5)
        e = e.cut(cq.Workplane("XY").circle(dd / 2).extrude(H + 2).translate((x, 0, -1)))
        e = e.cut(cq.Workplane("XY").circle(lam_d / 2).extrude(lam_h + 1).translate((x, 0, -1)))
        # marquage : nombre d'encoches = rang (1 à 5) sur le bord
        for k in range(i + 1):
            e = e.cut(cq.Workplane("XY").box(0.6, 1.2, H + 2).translate((x - 1.6 + 0.8 * k, 5.6, H / 2)))
    return e


def main():
    os.makedirs(OUT, exist_ok=True)
    a = Armature()
    g, info = construire(a)
    v = g.val()
    bb = v.BoundingBox()
    print("valide", v.isValid(), "volume cm3", round(v.Volume() / 1000, 1),
          "encombrement", round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1), info)
    cq.exporters.export(g, os.path.join(OUT, "gabarit_pions.step"))
    # à imprimer gravure vers le haut, lamages contre le plateau (pas de support : lamages = simples
    # poches ouvertes vers le bas, ponts de Ø6.8 seulement)
    cq.exporters.export(g, os.path.join(OUT, "gabarit_pions_impression.stl"), tolerance=0.01, angularTolerance=0.1)
    e = eprouvette()
    cq.exporters.export(e, os.path.join(OUT, "gabarit_eprouvette.stl"), tolerance=0.01, angularTolerance=0.1)
    print("éprouvette", e.val().isValid())
    return g, info


if __name__ == "__main__":
    main()
