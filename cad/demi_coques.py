"""Leurre en deux demi-coques (plan de symétrie), assemblées au jus d'ABS.

* Chaque demi-coque s'imprime face plane contre le plateau, sans support
  (la demi-bavette est une paroi verticale).
* Armature inox Ø1.6 au plan médian :
    - coque A (côté gauche) : rainure plus profonde que le demi-fil + points de
      serrage où le fil se clipse -> le fil reste plaqué et à plat pendant le collage ;
    - coque B (côté droit) : rainure avec jeu (absorbe un fil pas parfaitement plan).
* Billes Ø5 : logements sphériques à cheval sur les deux coques (centre au plan médian).
* Pions de centrage ABS imprimés (fondent avec le jus d'ABS) dans des trous borgnes.

Lancer :  python3 cad/demi_coques.py   -> out/
"""
import json
import math
import os
import sys

import cadquery as cq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lure_artist105 as L  # noqa: E402
from geom import dos, ventre, demi_largeur_a  # noqa: E402

OUT = L.OUT
ARM = L.ARM

C = dict(
    # rainure du fil
    jeu_diam=0.5,          # largeur de rainure = Ø fil + jeu_diam
    prof_A=0.9,            # profondeur côté A (demi-fil 0.8 + 0.1) : le fil y est centré au plan
    prof_B=1.1,            # profondeur côté B (demi-fil + 0.3 de jeu)
    serrage_l=1.6,         # largeur aux points de serrage (= Ø fil : serrage léger en FDM)
    serrage_long=3.0,      # longueur d'un point de serrage
    serrage_pas=12.0,      # espacement des points de serrage le long du fil
    # billes
    bille_jeu=0.1,         # jeu sur le rayon des logements sphériques
    # pions de centrage (ABS imprimé)
    pion_d=2.4, pion_trou_d=2.6, pion_prof=2.3, pion_long=4.2,
    pions_fenetres=((10.0, 26.0), (29.0, 38.0), (44.0, 56.0), (62.0, 80.0)),
    bille_y_max=0.5,       # billes sous la tige uniquement (lest bas)
)


# ----------------------------------------------------------------------------
def _face_offset(pts, r):
    w = cq.Wire.makePolygon([cq.Vector(x, y, 0) for x, y in pts])
    return cq.Face.makeFromWires(w.offset2D(r, "arc")[0])


def _extr(face, z0, z1):
    return cq.Workplane("XY").add(cq.Solid.extrudeLinear(face, cq.Vector(0, 0, z1 - z0)).translate((0, 0, z0)))


def r_large():
    return ARM.d / 2 + C["jeu_diam"] / 2


def points_serrage():
    """Points le long du fil, à l'intérieur du corps, espacés de serrage_pas, sur parties droites."""
    out, acc, last = [], 0.0, None
    pts = ARM.pts
    for (a, b) in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        acc += seg
        if acc >= C["serrage_pas"]:
            x, y = b
            if 2.0 < x < 100 and ventre(x) + 1.5 < y < dos(x) - 1.5:
                if last is None or math.dist(last, b) > C["serrage_pas"] * 0.6:
                    out.append(b)
                    last = b
                    acc = 0.0
    return out


def rainures():
    rw = r_large()
    fw = _face_offset(ARM.pts, rw)
    gA = _extr(fw, -C["prof_A"], 0.01)
    gB = _extr(fw, -0.01, C["prof_B"])
    # points de serrage côté A : on rend de la matière dans la rainure large
    fn = _face_offset(ARM.pts, C["serrage_l"] / 2)
    nA = _extr(fn, -C["prof_A"] - 0.1, 0.1)
    clips = None
    for (x, y) in points_serrage():
        c = (cq.Workplane("XY").circle(C["serrage_long"] / 2).extrude(C["prof_A"] + 0.2)
             .translate((x, y, -C["prof_A"] - 0.1)))
        c = c.intersect(gA).cut(nA)
        clips = c if clips is None else clips.union(c)
    if clips is not None:
        gA = gA.cut(clips)
    return gA, gB


def positions_billes():
    rb = L.P["bille_d"] / 2 + C["bille_jeu"]
    pe = L.P["paroi_ext"] + 0.3
    dmin_fil = rb + L.P["paroi"] + r_large()

    def ok(xc, yc):
        if ARM.distance_point(xc, yc) < dmin_fil:
            return False
        n = 8
        for i in range(n + 1):
            dx = -rb + 2 * rb * i / n
            for j in range(n + 1):
                dy = -rb + 2 * rb * j / n
                s = rb * rb - dx * dx - dy * dy
                if s < 0:
                    continue
                zext = math.sqrt(s)
                x, y = xc + dx, yc + dy
                if y > dos(x) - pe or y < ventre(x) + pe:
                    return False
                if demi_largeur_a(x, y) < zext + pe:
                    return False
        return True

    pos, x = [], 4.0
    pas = 2 * rb + L.P["paroi"]
    while x < 100:
        yc = None
        for k in range(120):
            y = ventre(x) + 1.0 + k * 0.1
            if y > C["bille_y_max"]:
                break
            if ok(x, y):
                yc = y
                break
        if yc is not None and (not pos or math.dist((x, yc), pos[-1]) >= pas):
            pos.append((x, round(yc, 2)))
            x += pas
            continue
        x += 0.25
    return pos


def positions_pions(billes):
    rp = C["pion_trou_d"] / 2
    pe = L.P["paroi_ext"] + 0.3
    res = []
    for (xa, xb) in C["pions_fenetres"]:
        best = None
        xt = (xa + xb) / 2
        for ix in range(int((xb - xa) / 0.5) + 1):
            x = xa + ix * 0.5
            yb, yt = ventre(x), dos(x)
            y = yb
            while y < yt:
                y += 0.25
                if ARM.distance_point(x, y) < r_large() + 0.6 + rp:
                    continue
                if any(math.dist((x, y), b) < L.P["bille_d"] / 2 + C["bille_jeu"] + 0.6 + rp for b in billes):
                    continue
                ex, ey = L.P["oeil_pos"]
                if math.dist((x, y), (ex, ey)) < L.P["oeil_d"] / 2 + rp + 0.8:
                    continue
                m = min(demi_largeur_a(x + dx, y + dy) for dx in (-rp, 0, rp) for dy in (-rp, 0, rp))
                if min(y - rp - yb, yt - y - rp) < pe:
                    continue
                marge = m - C["pion_prof"] - pe
                if marge >= 0 and (best is None or marge - 0.3 * abs(x - xt) > best[0]):
                    best = (marge - 0.3 * abs(x - xt), (x, y))
        if best:
            res.append((round(best[1][0], 2), round(best[1][1], 2)))
    return res


def equilibrer(plein, billes):
    """Retire des billes par l'arrière pour l'assiette visée (logements sphériques)."""
    rb = L.P["bille_d"] / 2 + C["bille_jeu"]
    v_log = 4 / 3 * math.pi * rb ** 3
    vb = 4 / 3 * math.pi * (L.P["bille_d"] / 2) ** 3 / 1000
    pv = plein.val()
    cp, Vp = pv.Center(), pv.Volume()
    l_fil = ARM.longueur()
    m_fil = math.pi * (ARM.d / 2) ** 2 * l_fil / 1000 * L.DENS["inox"]
    gx = sum((a[0] + b[0]) / 2 * math.dist(a, b) for a, b in zip(ARM.pts, ARM.pts[1:])) / l_fil
    gy = sum((a[1] + b[1]) / 2 * math.dist(a, b) for a, b in zip(ARM.pts, ARM.pts[1:])) / l_fil
    lo, hi = L.P["assiette_cible"]
    res = []
    for n in range(len(billes), 0, -1):
        pos = billes[:n]
        V = Vp - n * v_log
        mx = cp.x * Vp - sum(x for x, _ in pos) * v_log
        my = cp.y * Vp - sum(y for _, y in pos) * v_log
        ms = [(V / 1000 * L.DENS["ABS"], mx / V, my / V), (m_fil, gx, gy)] + L.hamecons()
        ms += [(vb * L.DENS[L.P["bille_mat"]], x, y) for x, y in pos]
        mt = sum(m for m, _, _ in ms)
        xcg = sum(m * x for m, x, _ in ms) / mt
        ycg = sum(m * y for m, _, y in ms) / mt
        res.append((pos, math.degrees(math.atan2(cp.x - xcg, cp.y - ycg))))
    dans = [r for r in res if lo <= r[1] <= hi]
    if dans:
        return dans[0]
    return min(res, key=lambda r: abs(r[1] - (lo + hi) / 2))


# ----------------------------------------------------------------------------
def construire():
    body = L.corps()
    lip, geo = L.bavette()
    gus, info_c = L.conge(geo)
    plein = L.oeils(body.union(lip).union(gus))
    gA, gB = rainures()
    billes_tous = positions_billes()
    billes, assiette = equilibrer(plein, billes_tous)
    pions = positions_pions(billes)
    rb = L.P["bille_d"] / 2 + C["bille_jeu"]
    logements = None
    for (x, y) in billes:
        s = cq.Workplane("XY").sphere(rb).translate((x, y, 0))
        logements = s if logements is None else logements.union(s)
    trous = None
    for (x, y) in pions:
        t = (cq.Workplane("XY").circle(C["pion_trou_d"] / 2).extrude(2 * C["pion_prof"])
             .translate((x, y, -C["pion_prof"])))
        trous = t if trous is None else trous.union(t)
    demi_A = cq.Workplane("XY").box(300, 300, 50, centered=(True, True, False)).translate((50, 0, -50))
    brut_A = plein.intersect(demi_A)
    # le corps est symétrique : la moitié B est le miroir de A (booléen plus robuste)
    brut_B = cq.Workplane("XY").add(brut_A.val().mirror("XY"))
    A = brut_A.cut(gA).cut(logements).cut(trous)
    B = brut_B.cut(gB).cut(logements).cut(trous)
    piece = A.union(B)          # leurre assemblé (pour le bilan masse / équilibre)
    return dict(plein=plein, A=A, B=B, piece=piece, billes=billes, billes_tous=billes_tous,
                assiette=assiette, pions=pions, gA=gA, gB=gB, info_c=info_c,
                serrage=points_serrage())


def pion_solide():
    rp = C["pion_d"] / 2
    return (cq.Workplane("XY").circle(rp).extrude(C["pion_long"])
            .faces(">Z or <Z").edges().chamfer(0.3))


def exporter(r):
    os.makedirs(OUT, exist_ok=True)
    tol = dict(tolerance=0.01, angularTolerance=0.1)
    # A : face plane (z=0, en haut) -> retournée contre le plateau ; B : déjà face plane en bas
    A_imp = r["A"].rotate((0, 0, 0), (1, 0, 0), 180)
    B_imp = r["B"].translate((0, 40, 0))
    nb_pions = len(r["pions"]) + 2
    pions = None
    for i in range(nb_pions):
        p = pion_solide().translate((-12 + 5 * i, -30, 0))
        pions = p if pions is None else pions.union(p)
    cq.exporters.export(A_imp, os.path.join(OUT, "demi_coque_A.stl"), **tol)
    cq.exporters.export(r["B"], os.path.join(OUT, "demi_coque_B.stl"), **tol)
    cq.exporters.export(pions, os.path.join(OUT, "pions_centrage.stl"), **tol)
    cq.exporters.export(r["A"].union(r["B"]), os.path.join(OUT, "leurre.step"))
    L.export_3mf(os.path.join(OUT, "plateau_demi_coques.3mf"),
                 [("demi_coque_A", A_imp), ("demi_coque_B", B_imp), ("pions_centrage", pions)])
    b = L.bilan(r["piece"], r["plein"], r["billes"])
    rapport = dict(
        billes=r["billes"], billes_possibles=r["billes_tous"], pions=r["pions"],
        points_serrage=[(round(x, 1), round(y, 1)) for x, y in r["serrage"]],
        bilan=b, coque=C, armature=ARM.reperes,
        pions_pliage=[dict(nom=p["nom"], c=(round(p["c"][0], 2), round(p["c"][1], 2))) for p in ARM.pions],
    )
    with open(os.path.join(OUT, "rapport.json"), "w") as f:
        json.dump(rapport, f, indent=2, ensure_ascii=False, default=str)
    # fil (contrôle)
    fil = L.fil_solide()
    cq.exporters.export(fil, os.path.join(OUT, "armature_fil.step"))
    return rapport


if __name__ == "__main__":
    r = construire()
    for k in ("A", "B"):
        v = r[k].val()
        print(k, "valide", v.isValid(), "volume", round(v.Volume(), 1))
    rap = exporter(r)
    print(json.dumps({k: rap[k] for k in ("billes", "pions", "points_serrage")}, ensure_ascii=False))
    print(json.dumps(rap["bilan"]["materiaux"]["tungstene_avec_hamecons"], ensure_ascii=False))
