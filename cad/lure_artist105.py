"""Leurre type minnow 105 mm (relevé sur Jackson Artist FR105 HW) – CadQuery.

Impression FDM ABS, couché sur le flanc (plan de symétrie parallèle au plateau),
surélevé sur supports dédiés, avec 2 pauses :
  pause 1 : poser l'armature inox dans sa rainure
  pause 2 : poser les billes Ø5 mm dans leurs puits

Lancer :  python3 cad/lure_artist105.py   -> fichiers dans out/
"""
import math
import os
import sys

import cadquery as cq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import (section_points, dos, ventre, demi_largeur, demi_largeur_a,  # noqa: E402
                  QUEUE_BAS, QUEUE_HAUT, LONGUEUR)
from armature import Armature  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")

# ======================================================================
# Paramètres
# ======================================================================
P = dict(
    # bavette
    bav_angle=40.0,         # ° sous l'axe du corps (mesuré photo : 38-40°)
    bav_sortie=(2.2, -3.3),  # point où l'axe de la bavette sort du menton
    bav_noyee=2.0,          # longueur noyée dans la tête
    bav_longueur=14.8,      # longueur visible (sortie -> extrémité)
    bav_larg_racine=6.0,
    bav_larg_max=11.0,
    bav_ep=1.8,             # épaisseur (4 périmètres buse 0.4)
    conge_tangente=5.0,     # longueur de raccord du congé sous le menton
    conge_demi_larg=2.6,    # demi-largeur du congé (quille)
    # œil 3D
    oeil_pos=(7.7, 2.2), oeil_d=5.2, oeil_prof=0.5,
    # lest
    bille_d=5.0, bille_jeu=0.2, paroi=0.6,   # paroi entre puits
    paroi_ext=0.8,          # paroi mini puits / peau extérieure (2 périmètres)
    # rainure fil
    fil_jeu=0.15,
    # impression
    couche=0.2,
    z_mini=3.0,             # hauteur du point le plus bas de la pièce au-dessus du plateau
    sup_jeu_z=0.25,         # jeu vertical support / pièce
    sup_pas=2.5,            # pas des lames de support
    sup_ep=0.8,             # épaisseur des lames
    sup_retrait=1.2,        # retrait du support par rapport au contour (flancs auto-portants)
    sup_semelle=0.6, sup_bord=3.0,
)

ARM = Armature()


# ======================================================================
# Corps
# ======================================================================
def corps():
    xs = [0, 0.6, 1.5, 3, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 35, 40, 45, 50, 55,
          60, 65, 70, 75, 80, 85, 90, 95, 100, 103, 107]
    secs = []
    for x in xs:
        pts = [cq.Vector(x, y, z) for (y, z) in section_points(x)]
        secs.append(cq.Wire.assembleEdges([cq.Edge.makeSpline(pts, periodic=True)]))
    body = cq.Workplane("XY").add(cq.Solid.makeLoft(secs, ruled=False))
    try:
        body = body.faces("<X").edges().fillet(0.9)
    except Exception as e:
        print("nez : arrondi ignoré", e)
    # coupe oblique de la queue
    (x1, y1), (x2, y2) = QUEUE_BAS, QUEUE_HAUT
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    cut = (cq.Workplane("XY").box(40, 40, 40, centered=(False, True, True))
           .rotate((0, 0, 0), (0, 0, 1), ang - 90)
           .translate((x1, y1, 0)))
    body = body.cut(cut)
    try:
        body = body.faces(cq.selectors.DirectionMinMaxSelector(cq.Vector(0.651, -0.759, 0))).edges().fillet(0.5)
    except Exception as e:
        print("queue : arrondi ignoré", e)
    return body


def bavette():
    a = math.radians(P["bav_angle"])
    d = cq.Vector(-math.cos(a), -math.sin(a), 0)      # vers l'avant-bas
    n = cq.Vector(-math.sin(a), math.cos(a), 0)       # normale (face avant/haut)
    sx, sy = P["bav_sortie"]
    r0 = cq.Vector(sx, sy, 0) - d * P["bav_noyee"]
    L = P["bav_noyee"] + P["bav_longueur"]
    wr, wm = P["bav_larg_racine"] / 2, P["bav_larg_max"] / 2
    um = L - wm
    pl = cq.Plane(origin=r0, xDir=d, normal=n)
    lip = (cq.Workplane(pl)
           .moveTo(0, -wr).lineTo(um, -wm)
           .threePointArc((L, 0), (um, wm))
           .lineTo(0, wr).close()
           .extrude(P["bav_ep"] / 2, both=True))
    # arrondi des arêtes de la bavette (bord d'attaque / contour)
    try:
        lip = lip.edges().fillet(0.6)
    except Exception as e:
        print("bavette : arrondi ignoré", e)
    return lip, (r0, d, n, L)


def conge(bav_geom):
    """Congé concave entre la face arrière (dessous) de la bavette et le ventre."""
    r0, d, n, L = bav_geom
    e = P["bav_ep"] / 2
    # droite de la face inférieure de la bavette : Q(t) = r0 - e n + t d
    q0 = r0 - n * e

    def f(t):
        q = q0 + d * t
        return q.y - ventre(q.x)
    # intersection face inférieure / ventre (bissection)
    ta, tb = 0.0, L
    for _ in range(60):
        tm = (ta + tb) / 2
        if f(ta) * f(tm) <= 0:
            tb = tm
        else:
            ta = tm
    C = q0 + d * ta
    Lg = P["conge_tangente"]
    # tangente au ventre vers l'arrière
    pente = (ventre(C.x + 1) - ventre(C.x - 1)) / 2
    tv = cq.Vector(1, pente, 0).normalized()
    T1 = cq.Vector(C.x + Lg, ventre(C.x + Lg), 0)
    tv = (T1 - C).normalized()
    T2 = C + d * Lg
    # cercle tangent aux deux droites (longueurs de tangente égales)
    bis = (tv + d).normalized()
    half = math.acos(max(-1, min(1, tv.dot(d)))) / 2
    R = Lg * math.tan(half)
    centre = C + bis * (Lg / math.cos(half))
    mid = centre - bis * R
    # polygone débordant dans le corps et dans la bavette pour une union propre
    up = cq.Vector(0, 1.2, 0)
    pts2 = [(T1 + up), T1, None, T2, (T2 + n * e), (C + up)]
    wp = (cq.Workplane("XY")
          .moveTo(pts2[0].x, pts2[0].y).lineTo(T1.x, T1.y)
          .threePointArc((mid.x, mid.y), (T2.x, T2.y))
          .lineTo(pts2[4].x, pts2[4].y).lineTo(pts2[5].x, pts2[5].y).close()
          .extrude(P["bav_larg_racine"] / 2, both=True))
    # vue de dessous : le congé s'affine vers l'arrière (pleine largeur de la
    # bavette côté bavette, conge_demi_larg à l'arrière)
    wb = P["bav_larg_racine"] / 2
    x_av, x_ar = T2.x - 2, T1.x + 0.5
    coin = (cq.Workplane("XZ")
            .polyline([(x_av, -wb), (C.x, -wb), (x_ar, -P["conge_demi_larg"] * 0.5),
                       (x_ar, P["conge_demi_larg"] * 0.5), (C.x, wb), (x_av, wb)]).close()
            .extrude(-30).translate((0, -20, 0)))
    wp = wp.intersect(coin)
    try:
        wp = wp.edges("not |Y").fillet(0.6)
    except Exception as e:
        print("congé : arrondi latéral ignoré", e)
    return wp, dict(C=C, R=R)


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


# ======================================================================
# Cavités : rainure fil + puits de billes
# ======================================================================
def rainure_fil():
    r = ARM.d / 2 + P["fil_jeu"]
    w = cq.Wire.makePolygon([cq.Vector(x, y, 0) for x, y in ARM.pts])
    face = cq.Face.makeFromWires(w.offset2D(r, "arc")[0])
    hz = P["couche"] * math.ceil((ARM.d / 2 + P["fil_jeu"]) / P["couche"] - 1e-9)
    sol = cq.Solid.extrudeLinear(face, cq.Vector(0, 0, 2 * hz)).translate((0, 0, -hz))
    return cq.Workplane("XY").add(sol), hz


def positions_billes():
    rb = P["bille_d"] / 2 + P["bille_jeu"]
    paroi = P["paroi"]
    ztop = puits_haut()
    r_fil = ARM.d / 2 + P["fil_jeu"]

    def ok(xc, yc):
        if ARM.distance_point(xc, yc) < rb + paroi + r_fil:
            return False
        n = 10
        for i in range(n + 1):
            dx = -rb + 2 * rb * i / n
            hh = math.sqrt(max(0, rb * rb - dx * dx))
            for j in range(n + 1):
                y = yc - hh + 2 * hh * j / n
                pe = P["paroi_ext"] + 0.4   # marge : loft vs modèle analytique
                if demi_largeur_a(xc + dx, y) < ztop + pe:
                    return False
                if y > dos(xc + dx) - pe or y < ventre(xc + dx) + pe:
                    return False
        return True

    pos = []
    x = 8.0
    pas = 2 * rb + paroi
    while x < 100:
        if not pos or x - pos[-1][0] >= pas - 1e-6:
            yc = None
            for k in range(0, 80):
                y = ventre(x) + 1.0 + k * 0.1
                if ok(x, y):
                    yc = y
                    break
            if yc is not None and (not pos or math.dist((x, yc), pos[-1]) >= pas):
                pos.append((x, round(yc, 2)))
                x += pas
                continue
        x += 0.25
    return pos


def puits_haut():
    """Haut des puits (Z latéral) arrondi à la couche : bille Ø5 + jeu."""
    rb = P["bille_d"] / 2 + P["bille_jeu"]
    return P["couche"] * math.ceil(rb / P["couche"] - 1e-9)


def puits_billes(pos):
    rb = P["bille_d"] / 2 + P["bille_jeu"]
    zt = puits_haut()
    s = None
    for (x, y) in pos:
        sph = cq.Workplane("XY").sphere(rb).translate((x, y, 0))
        cyl = cq.Workplane("XY").circle(rb).extrude(zt).translate((x, y, 0))
        u = sph.union(cyl)
        s = u if s is None else s.union(u)
    return s


# ======================================================================
# Supports (repère leurre, plan médian Z = 0 ; la moitié Z < 0 est côté plateau)
# ======================================================================
def section_mediane(sol):
    pl = cq.Face.makePlane(400, 400, basePnt=(50, 0, 0), dir=(0, 0, 1))
    return [f for f in sol.val().intersect(pl).Faces()]


def supports(plein, lip, z_bas):
    """Lames verticales sous la moitié basse (Z < 0) avec jeu vertical sup_jeu_z.

    z_bas : cote (repère leurre) du plateau, négative.
    """
    h = -z_bas
    # empreinte corps (retrait : les flancs raides près du contour sont auto-portants)
    emp = None
    for f in section_mediane(plein):
        ins = f.outerWire().offset2D(-P["sup_retrait"], "arc")
        for w in ins:
            e = cq.Solid.extrudeLinear(cq.Face.makeFromWires(w), cq.Vector(0, 0, -h))
            emp = cq.Workplane("XY").add(e) if emp is None else emp.union(cq.Workplane("XY").add(e))
    # bavette : mur plein sous son chant (pas de lames : bande trop fine)
    mur = None
    for f in section_mediane(lip):
        e = cq.Solid.extrudeLinear(f, cq.Vector(0, 0, -h))
        mur = cq.Workplane("XY").add(e) if mur is None else mur.union(cq.Workplane("XY").add(e))
    bb = emp.val().BoundingBox()
    x0, x1, y0, y1 = bb.xmin - 1, bb.xmax + 1, bb.ymin - 1, bb.ymax + 1
    nx = int((x1 - x0) / P["sup_pas"]) + 1
    lames = (cq.Workplane("XY").workplane(offset=z_bas)
             .rarray(P["sup_pas"], 1, nx, 1).rect(P["sup_ep"], y1 - y0)
             .extrude(h).translate(((x0 + x1) / 2, (y0 + y1) / 2, 0)))
    ny = int((y1 - y0) / (2 * P["sup_pas"])) + 1
    lon = (cq.Workplane("XY").workplane(offset=z_bas)
           .rarray(1, 2 * P["sup_pas"], 1, ny).rect(x1 - x0, P["sup_ep"])
           .extrude(h).translate(((x0 + x1) / 2, (y0 + y1) / 2, 0)))
    sup = lames.union(lon).intersect(emp).union(mur)
    sup = sup.cut(plein.translate((0, 0, -P["sup_jeu_z"])))
    # semelle (bord élargi type brim) pour l'adhérence ABS
    sem = None
    for f in section_mediane(plein):
        w = f.outerWire().offset2D(P["sup_bord"], "arc")[0]
        e = cq.Solid.extrudeLinear(cq.Face.makeFromWires(w), cq.Vector(0, 0, P["sup_semelle"]))
        sem = cq.Workplane("XY").add(e).translate((0, 0, z_bas))
    return sup.union(sem)


# ======================================================================
# Bilan masse / stabilité
# ======================================================================
DENS = dict(ABS=1.04, inox=7.9, tungstene=19.0, plomb=11.3, acier=7.85, laiton=8.5)


def bilan(piece, plein, pos):
    vp = piece.val()
    m_abs = vp.Volume() / 1000 * DENS["ABS"]
    g_abs = vp.Center()
    l_fil = ARM.longueur()
    m_fil = math.pi * (ARM.d / 2) ** 2 * l_fil / 1000 * DENS["inox"]
    gx = sum(p[0] for p in ARM.pts) / len(ARM.pts)
    gy = sum(p[1] for p in ARM.pts) / len(ARM.pts)
    vb = 4 / 3 * math.pi * (P["bille_d"] / 2) ** 3 / 1000
    yb = sum(p[1] for p in pos) / len(pos)
    xb = sum(p[0] for p in pos) / len(pos)
    cb = plein.val().Center()   # centre de carène (volume extérieur)
    vol_ext = plein.val().Volume() / 1000
    res = dict(volume_ext_cm3=round(vol_ext, 2), masse_abs_g=round(m_abs, 2),
               longueur_fil_mm=round(l_fil, 1), masse_fil_g=round(m_fil, 2),
               n_billes=len(pos), centre_carene=(round(cb.x, 1), round(cb.y, 2)),
               poussee_g=round(vol_ext * 1.0, 1), materiaux={})
    for mat in ("tungstene", "plomb", "acier"):
        mb = len(pos) * vb * DENS[mat]
        mt = m_abs + m_fil + mb
        ycg = (m_abs * g_abs.y + m_fil * gy + mb * yb) / mt
        xcg = (m_abs * g_abs.x + m_fil * gx + mb * xb) / mt
        res["materiaux"][mat] = dict(masse_billes_g=round(mb, 1), masse_totale_g=round(mt, 1),
                                     cg=(round(xcg, 1), round(ycg, 2)),
                                     gb_mm=round(cb.y - ycg, 2))
    return res


# ======================================================================
def construire():
    body = corps()
    lip, geo = bavette()
    gus, info_c = conge(geo)
    plein = body.union(lip).union(gus)
    plein = oeils(plein)
    rain, hz = rainure_fil()
    pos = positions_billes()
    puits = puits_billes(pos)
    piece = plein.cut(rain).cut(puits)
    return dict(plein=plein, piece=piece, rain=rain, hz=hz, pos=pos, puits=puits,
                lip=lip, gus=gus, info_c=info_c)


def fil_solide():
    """Fil inox en volume (visualisation / vérification)."""
    V = lambda p: cq.Vector(p[0], p[1], 0)  # noqa: E731
    edges = []
    for pr in ARM.prims:
        if pr[0] == "L":
            edges.append(cq.Edge.makeLine(V(pr[1]), V(pr[2])))
        else:
            edges.append(cq.Edge.makeThreePointArc(V(pr[1]), V(pr[2]), V(pr[3])))
    sol = None
    # un balayage par tronçon + sphère aux jonctions (robuste aux angles vifs)
    for e in edges:
        p0 = e.startPoint()
        prof = cq.Wire.makeCircle(ARM.d / 2, p0, e.tangentAt(0))
        s = cq.Solid.sweep(prof, [], cq.Wire.assembleEdges([e]))
        j = cq.Solid.makeSphere(ARM.d / 2, e.endPoint(), angleDegrees1=-90, angleDegrees2=90)
        part = cq.Workplane("XY").add(s).union(cq.Workplane("XY").add(j))
        sol = part if sol is None else sol.union(part)
    return sol


def export_3mf(path, objets, tol=0.01):
    """3MF minimal multi-objets (le slicer les importe comme objets séparés)."""
    import zipfile
    res, items = [], []
    for i, (nom, wp) in enumerate(objets, start=1):
        v, t = wp.val().tessellate(tol, 0.1)
        vs = "".join(f'<vertex x="{p.x:.4f}" y="{p.y:.4f}" z="{p.z:.4f}"/>' for p in v)
        ts = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in t)
        res.append(f'<object id="{i}" name="{nom}" type="model"><mesh><vertices>{vs}</vertices>'
                   f'<triangles>{ts}</triangles></mesh></object>')
        items.append(f'<item objectid="{i}"/>')
    model = ('<?xml version="1.0" encoding="UTF-8"?>'
             '<model unit="millimeter" xml:lang="fr-FR" '
             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
             f'<resources>{"".join(res)}</resources><build>{"".join(items)}</build></model>')
    ct = ('<?xml version="1.0" encoding="UTF-8"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
          '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
            'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("3D/3dmodel.model", model)


def exporter(r):
    import json
    os.makedirs(OUT, exist_ok=True)
    c = P["couche"]
    zmin = r["plein"].val().BoundingBox().zmin
    # plan médian sur une frontière de couche, point bas à >= z_mini du plateau
    z_mid = c * math.ceil((P["z_mini"] - zmin) / c - 1e-9)
    sup = supports(r["plein"], r["lip"], -z_mid)
    T = (0, 0, z_mid)
    piece_imp = r["piece"].translate(T)
    sup_imp = sup.translate(T)
    fil = fil_solide()
    tol = dict(tolerance=0.01, angularTolerance=0.1)
    cq.exporters.export(piece_imp, os.path.join(OUT, "leurre_impression.stl"), **tol)
    cq.exporters.export(sup_imp, os.path.join(OUT, "supports.stl"), **tol)
    cq.exporters.export(r["piece"], os.path.join(OUT, "leurre.step"))
    cq.exporters.export(fil, os.path.join(OUT, "armature_fil.step"))
    cq.exporters.export(fil.translate(T), os.path.join(OUT, "armature_fil_impression.stl"), **tol)
    export_3mf(os.path.join(OUT, "plateau.3mf"),
               [("leurre", piece_imp), ("supports", sup_imp)])
    b = bilan(r["piece"], r["plein"], r["pos"])
    pauses = dict(
        z_plan_median=round(z_mid, 2),
        pause1_fil=round(z_mid + r["hz"], 2),
        pause2_billes=round(z_mid + puits_haut(), 2),
        hauteur_totale=round(z_mid + r["plein"].val().BoundingBox().zmax, 2),
    )
    rapport = dict(pauses=pauses, bilan=b, billes=r["pos"], conge=dict(
        rayon=round(r["info_c"]["R"], 1)), armature=ARM.reperes, parametres=P)
    with open(os.path.join(OUT, "rapport.json"), "w") as f:
        json.dump(rapport, f, indent=2, ensure_ascii=False, default=str)
    return dict(piece_imp=piece_imp, sup_imp=sup_imp, fil=fil, rapport=rapport, z_mid=z_mid)


if __name__ == "__main__":
    import json
    r = construire()
    v = r["piece"].val()
    print("valide", v.isValid(), "volume", round(v.Volume(), 1))
    e = exporter(r)
    print(json.dumps({k: e["rapport"][k] for k in ("pauses", "bilan", "billes", "conge")},
                     indent=1, ensure_ascii=False, default=str))
