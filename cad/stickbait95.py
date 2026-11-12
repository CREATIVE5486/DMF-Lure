"""Stickbait coulant 95 mm (conception originale) – demi-coques ABS, FDM.

Leurre « scad » à flancs plats : corps haut (≈ 24 mm), carène ventrale lestée,
queue tronquée, sans bavette. La nage (S / walk-the-dog à la tirée, descente à plat
en vibrant) vient de :
  * un centre de gravité bas et proche du centre de carène en longueur,
  * un point de traction au nez, sous l'axe,
  * des flancs plats et une queue tronquée.

Construction :
  * 2 demi-coques coupées au plan de symétrie, imprimées face plane au plateau, sans support ;
  * corps allégé (cavités dorsales fermées) + lest de billes tungstène Ø5 dans la carène
    -> CG très bas = leurre stable, qui revient vite dos en haut ;
  * armature inox Ø1.6 traversante (œillet de nez, épingle ventrale, œillet de queue),
    clipsée dans la coque A (points de serrage) ;
  * pions de centrage : tige inox Ø1.6 dans trous Ø1.8.

Lancer : python3 cad/stickbait95.py   -> out/stickbait95/
"""
import json
import math
import os
import sys

import cadquery as cq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armature import balayage_arc, _echantillonne_arc, _unit  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out", "stickbait95")

# =============================================================================
# Forme (mm). x : 0 au nez -> 95 à la queue ; y : dos +, ventre - ; z latéral.
# =============================================================================
L = 95.0
DOS = [(-1.2, 0.6), (0, 2.0), (1.5, 3.6), (3, 5.0), (5.5, 6.9), (8, 8.5), (11, 10.0), (15, 11.4),
       (20, 12.7), (25, 13.5), (30, 14.0), (36, 14.2), (42, 14.0), (50, 13.3), (58, 12.1),
       (66, 10.5), (74, 8.6), (82, 6.6), (88, 5.1), (92, 4.3), (95, 3.8)]
VENTRE = [(-1.2, -1.6), (0, -3.0), (1.5, -4.4), (3, -5.5), (5.5, -6.8), (8, -7.7), (11, -8.5),
          (15, -9.1), (20, -9.6), (25, -9.9), (30, -10.0), (36, -9.9), (42, -9.6), (50, -8.9),
          (58, -7.8), (66, -6.4), (74, -4.9), (82, -3.5), (88, -2.6), (92, -2.1), (95, -1.9)]
DEMI_LARG = [(-1.2, 1.4), (0, 2.6), (1.5, 3.3), (3, 3.9), (5.5, 4.6), (8, 5.1), (11, 5.5),
             (15, 5.9), (20, 6.15), (25, 6.3), (30, 6.35), (36, 6.3), (42, 6.15), (50, 5.85),
             (58, 5.4), (66, 4.8), (74, 4.1), (82, 3.4), (88, 2.8), (92, 2.45), (95, 2.25)]
N_SUPER = 3.0        # sections à flancs plats
H_LARGE = 0.52       # hauteur relative du point le plus large

P = dict(
    # armature
    fil_d=1.6, clou_d=2.92, jeu_nez=0.4, y_axe=-0.6, x_ventre=38.0, jour_ventre=3.0,
    x_retour_nez=5.0, x_retour_queue=89.0, jeu_queue=0.4,
    # rainure du fil (comme le minnow)
    jeu_diam=0.5, prof_A=0.9, prof_B=1.1, serrage_l=1.6, serrage_long=3.0, serrage_pas=11.0,
    # allègement
    paroi=1.6, cloisons_pas=9.0, cloison_ep=1.2, bande_fil=2.6, nez_plein=14.0, queue_plein=86.0,
    # lest
    bille_d=5.0, bille_jeu=0.1, paroi_bille=0.8, bille_mat="tungstene",
    # pions de centrage (tige inox Ø1.6)
    pion_trou_d=1.8, pion_prof=2.6, pion_jeu_fond=0.3, pion_boss_r=2.4,
    # yeux 3D autocollants
    oeil_pos=(8.5, 3.0), oeil_d=6.0, oeil_prof=0.5,
    # hameçons pour l'équilibre (triple #4 + anneau, ou simple + anneau)
    hamecon_g=1.0,
    assiette_cible=(-3.0, 3.0),
)
DENS = dict(ABS=1.04, inox=7.9, tungstene=19.0, plomb=11.3, acier=7.85)


def _interp(tab, x):
    xs, ys = zip(*tab)
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    for (x0, y0), (x1, y1) in zip(tab, tab[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def dos(x):
    return _interp(DOS, x)


def ventre(x):
    return _interp(VENTRE, x)


def demi_largeur(x):
    return _interp(DEMI_LARG, x)


def demi_largeur_a(x, y):
    yt, yb, w = dos(x), ventre(x), demi_largeur(x)
    ym = yb + H_LARGE * (yt - yb)
    b = (yt - ym) if y >= ym else (ym - yb)
    s = abs(y - ym) / b
    if s >= 1:
        return 0.0
    return w * (1 - s ** N_SUPER) ** (1 / N_SUPER)


def _section(x, shrink=0.0, shrink_bas=None, n=56):
    sb = shrink if shrink_bas is None else shrink_bas
    yt, yb, w = dos(x) - shrink, ventre(x) + sb, demi_largeur(x) - shrink
    ym = yb + H_LARGE * (yt - yb)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        z = w * math.copysign(abs(c) ** (2 / N_SUPER), c)
        b = (yt - ym) if s >= 0 else (ym - yb)
        y = ym + b * math.copysign(abs(s) ** (2 / N_SUPER), s)
        pts.append(cq.Vector(x, y, z))
    return cq.Wire.assembleEdges([cq.Edge.makeSpline(pts, periodic=True)])


def _loft(wires):
    from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
    b = BRepOffsetAPI_ThruSections(True, False, 1e-6)
    b.CheckCompatibility(False)
    for w in wires:
        b.AddWire(w.wrapped)
    b.Build()
    return cq.Workplane("XY").add(cq.Solid(b.Shape()))


XS = [-1.2, -0.5, 0, 0.8, 1.5, 3, 5.5, 8, 11, 15, 20, 25, 30, 36, 42, 50, 58, 66, 74, 82, 88, 92, 95]


def corps():
    return _loft([_section(x) for x in XS])


# =============================================================================
# Armature (même logique de pions que le minnow : tous les plis autour d'un clou)
# =============================================================================
class Fil:
    def __init__(self):
        p = P
        self.d, self.clou_d = p["fil_d"], p["clou_d"]
        self.r = self.clou_d / 2 + self.d / 2
        h = self.d / 2
        r = self.r
        self.x_retour_nez, self.x_retour_queue = p["x_retour_nez"], p["x_retour_queue"]
        ys = p["y_axe"]                               # tige (brin bas de l'œillet de nez)
        self.y_nez = ys + h
        self.y_queue = ys + h
        self.y_tige = ys
        xc_n = XS[0] - self.clou_d / 2 - p["jeu_nez"]
        xc_q = L + self.clou_d / 2 + p["jeu_queue"]
        xv = p["x_ventre"]
        y_bas = ventre(xv) - p["jour_ventre"] + self.clou_d / 2
        xj = math.sqrt(r * r - h * h)
        th = math.degrees(math.asin(h / r))
        prims, pions = [], []

        def arc(c, a0, a1):
            Pp = lambda a: (c[0] + r * math.cos(math.radians(a)), c[1] + r * math.sin(math.radians(a)))  # noqa
            prims.append(("A", Pp(a0), Pp((a0 + a1) / 2), Pp(a1)))

        def coins(points, noms):
            cur = points[0]
            for i in range(1, len(points) - 1):
                V, A, B = points[i], points[i - 1], points[i + 1]
                a = _unit((V[0] - A[0], V[1] - A[1]))
                b = _unit((B[0] - V[0], B[1] - V[1]))
                dev = math.acos(max(-1, min(1, a[0] * b[0] + a[1] * b[1])))
                t = r * math.tan(dev / 2)
                s_ = (V[0] - a[0] * t, V[1] - a[1] * t)
                e = (V[0] + b[0] * t, V[1] + b[1] * t)
                bis = _unit((b[0] - a[0], b[1] - a[1]))
                c = (V[0] + bis[0] * r / math.cos(dev / 2), V[1] + bis[1] * r / math.cos(dev / 2))
                m = (c[0] - bis[0] * r, c[1] - bis[1] * r)
                prims.append(("L", cur, s_))
                prims.append(("A", s_, m, e))
                pions.append(dict(nom=noms[i - 1], c=c, pli=math.degrees(dev)))
                cur = e
            prims.append(("L", cur, points[-1]))

        yn = self.y_nez
        prims.append(("L", (self.x_retour_nez, yn + h), (xc_n + xj, yn + h)))
        arc((xc_n, yn), th, 360 - th)
        pions.append(dict(nom="œillet de nez", c=(xc_n, yn), pli=360 - 2 * th))
        coins([(xc_n + xj, ys), (xv - r, ys), (xv - r, y_bas)], ["épingle gauche"])
        arc((xv, y_bas), 180, 360)
        pions.append(dict(nom="épingle ventrale", c=(xv, y_bas), pli=180.0))
        coins([(xv + r, y_bas), (xv + r, ys), (xc_q - xj, ys)], ["épingle droite"])
        yq = self.y_queue
        arc((xc_q, yq), 180 + th, 540 - th)
        pions.append(dict(nom="œillet de queue", c=(xc_q, yq), pli=360 - 2 * th))
        prims.append(("L", (xc_q - xj, yq + h), (self.x_retour_queue, yq + h)))
        self.prims, self.pions = prims, pions
        pts = []
        for pr in prims:
            if pr[0] == "L":
                n = max(1, int(math.dist(pr[1], pr[2]) / 0.5))
                seg = [(pr[1][0] + (pr[2][0] - pr[1][0]) * i / n, pr[1][1] + (pr[2][1] - pr[1][1]) * i / n)
                       for i in range(n + 1)]
            else:
                seg = _echantillonne_arc(pr[1], pr[2], pr[3], 16)
            for q in seg:
                if not pts or math.dist(q, pts[-1]) > 1e-6:
                    pts.append(q)
        self.pts = pts
        self.reperes = dict(xc_n=xc_n, yc_n=yn, xc_q=xc_q, yc_q=yq, xv=xv, y_bas_v=y_bas, ys=ys, xj=xj,
                            r_n=r, r_q=r, r_v=r)

    def longueur(self):
        return sum(math.dist(a, b) for a, b in zip(self.pts, self.pts[1:]))

    def distance_point(self, x, y):
        best = 1e9
        for (ax, ay), (bx, by) in zip(self.pts, self.pts[1:]):
            vx, vy = bx - ax, by - ay
            l2 = vx * vx + vy * vy
            t = 0 if l2 == 0 else max(0, min(1, ((x - ax) * vx + (y - ay) * vy) / l2))
            best = min(best, math.hypot(x - ax - t * vx, y - ay - t * vy))
        return best

    def solide(self):
        V = lambda p: cq.Vector(p[0], p[1], 0)  # noqa: E731
        sol = None
        for pr in self.prims:
            e = (cq.Edge.makeLine(V(pr[1]), V(pr[2])) if pr[0] == "L"
                 else cq.Edge.makeThreePointArc(V(pr[1]), V(pr[2]), V(pr[3])))
            prof = cq.Wire.makeCircle(self.d / 2, e.startPoint(), e.tangentAt(0))
            s = cq.Workplane("XY").add(cq.Solid.sweep(prof, [], cq.Wire.assembleEdges([e])))
            s = s.union(cq.Workplane("XY").add(cq.Solid.makeSphere(self.d / 2, e.endPoint(),
                                                                    angleDegrees1=-90, angleDegrees2=90)))
            sol = s if sol is None else sol.union(s)
        return sol


FIL = Fil()


# =============================================================================
def _face_offset(pts, r):
    w = cq.Wire.makePolygon([cq.Vector(x, y, 0) for x, y in pts])
    return cq.Face.makeFromWires(w.offset2D(r, "arc")[0])


def _extr(face, z0, z1):
    return cq.Workplane("XY").add(cq.Solid.extrudeLinear(face, cq.Vector(0, 0, z1 - z0)).translate((0, 0, z0)))


def r_rainure():
    return FIL.d / 2 + P["jeu_diam"] / 2


def points_serrage():
    out, acc, last = [], 0.0, None
    for a, b in zip(FIL.pts, FIL.pts[1:]):
        acc += math.dist(a, b)
        x, y = b
        if acc >= P["serrage_pas"] and 1.5 < x < L - 2 and ventre(x) + 1.5 < y < dos(x) - 1.5:
            if last is None or math.dist(last, b) > P["serrage_pas"] * 0.6:
                out.append(b)
                last = b
                acc = 0.0
    return out


def rainures():
    fw = _face_offset(FIL.pts, r_rainure())
    gA = _extr(fw, -P["prof_A"], 0.01)
    gB = _extr(fw, -0.01, P["prof_B"])
    nA = _extr(_face_offset(FIL.pts, P["serrage_l"] / 2), -P["prof_A"] - 0.1, 0.1)
    for (x, y) in points_serrage():
        c = (cq.Workplane("XY").circle(P["serrage_long"] / 2).extrude(P["prof_A"] + 0.2)
             .translate((x, y, -P["prof_A"] - 0.1)))
        gA = gA.cut(c.intersect(gA).cut(nA))
    return gA, gB


def positions_billes():
    """Rangée de billes dans la carène, le plus bas possible, sous la tige."""
    rb = P["bille_d"] / 2 + P["bille_jeu"]
    pe = P["paroi_bille"] + 0.3
    dmin_fil = rb + 0.8 + r_rainure()
    xv = P["x_ventre"]

    def ok(xc, yc):
        if FIL.distance_point(xc, yc) < dmin_fil:
            return False
        for i in range(9):
            for j in range(9):
                dx, dy = -rb + rb * i / 4, -rb + rb * j / 4
                s = rb * rb - dx * dx - dy * dy
                if s < 0:
                    continue
                x, y = xc + dx, yc + dy
                if y < ventre(x) + pe or y > dos(x) - pe or demi_largeur_a(x, y) < math.sqrt(s) + pe:
                    return False
        return True

    pos, x = [], 8.0
    pas = 2 * rb + 0.6
    while x < 80:
        if abs(x - xv) < rb + FIL.r + 1.2:          # passage de l'épingle ventrale
            x += 0.25
            continue
        yc = None
        for k in range(80):
            y = ventre(x) + 1.0 + k * 0.1
            if y > FIL.y_tige - 2.0:
                break
            if ok(x, y):
                yc = y
                break
        if yc is not None and (not pos or math.dist((x, yc), pos[-1]) >= pas):
            pos.append((round(x, 2), round(yc, 2)))
            x += pas
            continue
        x += 0.25
    return pos


PIONS = [(5.5, 3.8), (24.0, 6.5), (56.0, 6.0), (78.0, 2.8)]


def cavite(billes):
    """Volumes vides (allègement) : intérieur du corps décalé de `paroi`, hors zones pleines."""
    w = P["paroi"]
    xs = [x for x in XS if P["nez_plein"] <= x <= P["queue_plein"]]
    xs = [P["nez_plein"]] + [x for x in xs if x > P["nez_plein"] + 0.5] + [P["queue_plein"]]
    xs = sorted(set(xs))
    inner = _loft([_section(x, shrink=w) for x in xs])
    # bande pleine autour du fil
    inner = inner.cut(_extr(_face_offset(FIL.pts, P["bande_fil"]), -20, 20))
    # carène pleine : tout ce qui est sous le haut des logements de billes + paroi
    rb = P["bille_d"] / 2 + P["bille_jeu"]
    y_carene = max(y for _, y in billes) + rb + P["paroi_bille"] if billes else -4
    inner = inner.cut(cq.Workplane("XY").box(200, 40, 40).translate((50, y_carene - 20, 0)))
    # cloisons transversales (ponts courts à l'impression, rigidité)
    x = P["nez_plein"] + P["cloisons_pas"]
    while x < P["queue_plein"] - 3:
        inner = inner.cut(cq.Workplane("XY").box(P["cloison_ep"], 40, 40).translate((x, 0, 0)))
        x += P["cloisons_pas"]
    # bossages des pions
    for (px, py) in PIONS:
        inner = inner.cut(cq.Workplane("XY").circle(P["pion_boss_r"]).extrude(40).translate((px, py, -20)))
    # plan de joint plein sur 0.8 mm de chaque côté (surface de collage continue au bord)
    return inner, y_carene


def oeils(body):
    x, y = P["oeil_pos"]
    zs = demi_largeur_a(x, y)
    for s in (1, -1):
        cyl = (cq.Workplane("XY").circle(P["oeil_d"] / 2).extrude(5)
               .translate((x, y, zs - P["oeil_prof"])))
        if s < 0:
            cyl = cyl.mirror("XY")
        body = body.cut(cyl)
    return body


def hamecons():
    m = P["hamecon_g"]
    r = FIL.reperes
    return [(m, r["xv"], ventre(r["xv"]) - P["jour_ventre"] - 8.0),
            (m, r["xc_q"] + FIL.r + 4.0, r["yc_q"] - 7.0)]


def bilan(piece, plein, billes):
    vp = piece.val()
    m_abs = vp.Volume() / 1000 * DENS["ABS"]
    ga = vp.Center()
    lf = FIL.longueur()
    m_fil = math.pi * (FIL.d / 2) ** 2 * lf / 1000 * DENS["inox"]
    gx = sum((a[0] + b[0]) / 2 * math.dist(a, b) for a, b in zip(FIL.pts, FIL.pts[1:])) / lf
    gy = sum((a[1] + b[1]) / 2 * math.dist(a, b) for a, b in zip(FIL.pts, FIL.pts[1:])) / lf
    vb = 4 / 3 * math.pi * (P["bille_d"] / 2) ** 3 / 1000
    cb = plein.val().Center()
    vol = plein.val().Volume() / 1000
    out = dict(volume_ext_cm3=round(vol, 2), poussee_eau_de_mer_g=round(vol * 1.025, 1),
               masse_abs_g=round(m_abs, 2), masse_fil_g=round(m_fil, 2), longueur_fil_mm=round(lf, 1),
               centre_carene=(round(cb.x, 1), round(cb.y, 2)), cas={})
    for mat in ("tungstene", "plomb"):
        for avec in (False, True):
            ms = [(m_abs, ga.x, ga.y), (m_fil, gx, gy)] + [(vb * DENS[mat], x, y) for x, y in billes]
            ms += hamecons() if avec else []
            mt = sum(m for m, _, _ in ms)
            xg = sum(m * x for m, x, _ in ms) / mt
            yg = sum(m * y for m, _, y in ms) / mt
            out["cas"][mat + ("_avec_hamecons" if avec else "")] = dict(
                masse_g=round(mt, 1), cg=(round(xg, 1), round(yg, 2)), gb_mm=round(cb.y - yg, 2),
                assiette_deg=round(math.degrees(math.atan2(cb.x - xg, cb.y - yg)), 1),
                densite=round(mt / vol, 2))
    return out


def construire():
    plein = oeils(corps())
    billes_tous = positions_billes()
    gA, gB = rainures()
    rb = P["bille_d"] / 2 + P["bille_jeu"]

    def assembler(billes):
        cav, y_car = cavite(billes)
        log = None
        for (x, y) in billes:
            s = cq.Workplane("XY").sphere(rb).translate((x, y, 0))
            log = s if log is None else log.union(s)
        trous = None
        for (x, y) in PIONS:
            t = (cq.Workplane("XY").circle(P["pion_trou_d"] / 2).extrude(2 * P["pion_prof"])
                 .translate((x, y, -P["pion_prof"])))
            trous = t if trous is None else trous.union(t)
        demi = cq.Workplane("XY").box(300, 300, 50, centered=(True, True, False)).translate((50, 0, -50))
        brut_A = plein.cut(cav).intersect(demi)
        brut_B = cq.Workplane("XY").add(brut_A.val().mirror("XY"))
        A = brut_A.cut(gA).cut(trous)
        B = brut_B.cut(gB).cut(trous)
        if log is not None:
            A, B = A.cut(log), B.cut(log)
        return A, B, cav

    # choix du nombre de billes : on retire aux extrémités pour l'assiette visée
    best = None
    import itertools
    cand = [list(c) for n in range(1, len(billes_tous) + 1)
            for c in itertools.combinations(billes_tous, n)]
    lo, hi = P["assiette_cible"]
    A0, B0, cav0 = assembler(billes_tous)
    v_cav = cav0.val().Volume()
    vb_log = 4 / 3 * math.pi * rb ** 3
    vp = plein.val().Volume()
    cpl, cca = plein.val().Center(), cav0.val().Center()
    for sub in cand:
        # estimation rapide (ABS = plein - cavité - logements)
        V = vp - v_cav - len(sub) * vb_log
        mx = cpl.x * vp - cca.x * v_cav - sum(x for x, _ in sub) * vb_log
        my = cpl.y * vp - cca.y * v_cav - sum(y for _, y in sub) * vb_log
        lf = FIL.longueur()
        m_fil = math.pi * (FIL.d / 2) ** 2 * lf / 1000 * DENS["inox"]
        ms = [(V / 1000 * DENS["ABS"], mx / V, my / V), (m_fil, 45, FIL.y_tige)] + hamecons()
        ms += [(4 / 3 * math.pi * 2.5 ** 3 / 1000 * DENS[P["bille_mat"]], x, y) for x, y in sub]
        mt = sum(m for m, _, _ in ms)
        xg = sum(m * x for m, x, _ in ms) / mt
        yg = sum(m * y for m, _, y in ms) / mt
        ang = math.degrees(math.atan2(cpl.x - xg, cpl.y - yg))
        score = (0 if lo <= ang <= hi else abs(ang - (lo + hi) / 2) * 10) - len(sub)
        if best is None or score < best[0]:
            best = (score, sub, ang)
    billes = best[1]
    A, B, cav = assembler(billes)
    piece = A.union(B)
    return dict(plein=plein, A=A, B=B, piece=piece, billes=billes, billes_tous=billes_tous, cav=cav,
                assiette_estimee=best[2])


def export_3mf(path, objets, tol=0.01):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import lure_artist105 as Lx
    Lx.export_3mf(path, objets, tol)


def exporter(r):
    os.makedirs(OUT, exist_ok=True)
    tol = dict(tolerance=0.01, angularTolerance=0.1)
    A_imp = r["A"].rotate((0, 0, 0), (1, 0, 0), 180)
    B_imp = r["B"].translate((0, 40, 0))
    cq.exporters.export(A_imp, os.path.join(OUT, "stickbait95_coque_A.stl"), **tol)
    cq.exporters.export(r["B"], os.path.join(OUT, "stickbait95_coque_B.stl"), **tol)
    cq.exporters.export(r["A"].union(r["B"]), os.path.join(OUT, "stickbait95.step"))
    export_3mf(os.path.join(OUT, "stickbait95_plateau.3mf"),
               [("coque_A", A_imp), ("coque_B", B_imp)])
    cq.exporters.export(FIL.solide(), os.path.join(OUT, "stickbait95_armature.step"))
    b = bilan(r["piece"], r["plein"], r["billes"])
    rap = dict(billes=r["billes"], billes_possibles=r["billes_tous"], pions_centrage=PIONS,
               tige_pion=dict(d=1.6, trou=P["pion_trou_d"],
                              longueur_coupe=round(2 * (P["pion_prof"] - P["pion_jeu_fond"]), 1)),
               points_serrage=[(round(x, 1), round(y, 1)) for x, y in points_serrage()],
               pions_pliage=[dict(nom=p["nom"], c=(round(p["c"][0], 2), round(p["c"][1], 2)),
                                  pli=round(p["pli"])) for p in FIL.pions],
               fil_coupe_mm=math.ceil(FIL.longueur() / 5) * 5 + 20, bilan=b, parametres=P)
    with open(os.path.join(OUT, "rapport.json"), "w") as f:
        json.dump(rap, f, indent=2, ensure_ascii=False, default=str)
    return rap


def gabarit():
    """Gabarit de pliage à clous (même conception que celui du minnow)."""
    import gabarit_pions as G
    g, info = G.construire(FIL)
    cq.exporters.export(g, os.path.join(OUT, "stickbait95_gabarit_impression.stl"),
                        tolerance=0.01, angularTolerance=0.1)
    return g, info


if __name__ == "__main__":
    r = construire()
    for k in ("A", "B"):
        v = r[k].val()
        print(k, "valide", v.isValid(), "volume", round(v.Volume(), 1))
    rap = exporter(r)
    g, info = gabarit()
    print("gabarit valide", g.val().isValid())
    print(json.dumps({k: rap[k] for k in ("billes", "pions_pliage", "fil_coupe_mm")}, ensure_ascii=False))
    print(json.dumps(rap["bilan"], ensure_ascii=False, indent=1))
