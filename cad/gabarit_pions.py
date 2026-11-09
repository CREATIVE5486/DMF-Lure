"""Gabarit de pliage à pions pour l'armature (clous Ø2.92, tête Ø6 glissés par dessous).

Matière minimale :
  * une semelle fine qui suit le tracé du fil (ruban),
  * un bossage sous chaque pion (guidage du clou + lamage de la tête),
le dessus est plat (le fil s'y couche), le gabarit repose sur ses bossages.

Le tracé du fil est gravé sur le dessus (le fil s'y loge, il reste plan) avec
des traits de coupe au bout des retours.

Impression : dessus contre le plateau (fichier exporté déjà retourné), sans support.

Lancer :  python3 cad/gabarit_pions.py   -> out/gabarit_pions.stl / .step
"""
import math
import os
import sys

import cadquery as cq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armature import Armature  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")

G = dict(
    trou_d=3.0,          # Ø du trou de pion (clou Ø2.92 : serré en FDM)
    tete_d=6.0,          # Ø tête de clou
    tete_jeu=0.4,        # jeu sur le Ø du lamage
    tete_h=1.2,          # épaisseur de la tête (à mesurer) -> profondeur du lamage + 0.2
    guidage=4.6,         # longueur de clou tenue dans la matière (au-dessus du lamage)
    paroi_boss=2.0,      # paroi autour du lamage
    plaque=2.4,          # épaisseur de la semelle
    ruban=3.6,           # demi-largeur de la semelle autour du fil
    trace_l=0.3,         # jeu sur la largeur de la gravure du fil
    trace_p=0.6,         # profondeur de la gravure
    trait_l=0.6, trait_p=0.4, trait_long=7.0,   # traits de coupe des retours
)


def construire(a=None):
    a = a or Armature()
    lam_d = G["tete_d"] + G["tete_jeu"]
    lam_h = G["tete_h"] + 0.2
    H = lam_h + G["guidage"]                 # hauteur totale (bossage)
    boss_r = lam_d / 2 + G["paroi_boss"]
    zt = H                                   # dessus du gabarit
    # semelle : ruban autour du tracé + disques des bossages
    w = cq.Wire.makePolygon([cq.Vector(x, y, 0) for x, y in a.pts])
    f_rub = cq.Face.makeFromWires(w.offset2D(G["ruban"], "arc")[0])
    plaque = cq.Workplane("XY").add(
        cq.Solid.extrudeLinear(f_rub, cq.Vector(0, 0, G["plaque"]))).translate((0, 0, zt - G["plaque"]))
    for p in a.pions:
        x, y = p["c"]
        plaque = plaque.union(cq.Workplane("XY").circle(boss_r).extrude(H).translate((x, y, 0)))
    # trous de pions + lamages (par dessous)
    for p in a.pions:
        x, y = p["c"]
        plaque = plaque.cut(cq.Workplane("XY").circle(G["trou_d"] / 2).extrude(H + 2)
                            .translate((x, y, -1)))
        plaque = plaque.cut(cq.Workplane("XY").circle(lam_d / 2).extrude(lam_h + 1)
                            .translate((x, y, -1)))
    # gravure du tracé du fil
    ft = cq.Face.makeFromWires(w.offset2D(a.d / 2 + G["trace_l"] / 2, "arc")[0])
    trace = cq.Workplane("XY").add(
        cq.Solid.extrudeLinear(ft, cq.Vector(0, 0, G["trace_p"] + 1))).translate((0, 0, zt - G["trace_p"]))
    plaque = plaque.cut(trace)
    # traits de coupe au bout des retours (perpendiculaires au fil)
    h = a.d / 2
    for (x, y) in ((a.x_retour_nez, a.y_nez + h), (a.x_retour_queue, a.y_queue + h)):
        t = (cq.Workplane("XY").rect(G["trait_l"], G["trait_long"]).extrude(G["trait_p"] + 1)
             .translate((x, y, zt - G["trait_p"])))
        plaque = plaque.cut(t)
    return plaque, dict(H=H, lam_d=lam_d, lam_h=lam_h, boss_r=boss_r)


def main():
    os.makedirs(OUT, exist_ok=True)
    a = Armature()
    g, info = construire(a)
    v = g.val()
    print("valide", v.isValid(), "volume mm3", round(v.Volume()), "masse PLA/ABS ~ g",
          round(v.Volume() / 1000 * 1.1, 1), info)
    bb = v.BoundingBox()
    print("encombrement", round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1))
    cq.exporters.export(g, os.path.join(OUT, "gabarit_pions.step"))
    # à imprimer dessus contre le plateau
    imp = g.rotate((0, 0, 0), (1, 0, 0), 180).translate((0, 0, info["H"]))
    cq.exporters.export(imp, os.path.join(OUT, "gabarit_pions_impression.stl"),
                        tolerance=0.01, angularTolerance=0.1)
    return g, info


if __name__ == "__main__":
    main()
