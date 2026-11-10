"""Géométrie paramétrique du leurre (repère leurre).

Repère leurre : X = longueur (0 au nez, + vers la queue), Y = dos (+) / ventre (-),
Z = latéral (plan de symétrie Z = 0). Unités : mm.
Profils relevés sur photos (Artist FR105 HW, 105 mm, 32 g).
"""
import math
import numpy as np

# ---------------------------------------------------------------- profils
# Profils relevés sur photos du leurre réel (silhouettes vue de profil / vue de dessus),
# mis à l'échelle sur les cotes mesurées : L 105, H 11,9 / 16,9 / 8, l 13,2 / 14,5 / 6.
DOS = [(0, 0.7), (1, 1.7), (1.5, 2.2), (2.5, 3.1), (4, 4.6), (6, 6.1), (8, 7.54),
       (10, 8.44), (12.5, 9.51), (15, 10), (17.5, 10.42), (20, 11.11), (22.5, 11.7),
       (25, 12.2), (27.5, 12.55), (30, 12.91), (32.5, 13.13), (35, 13.31),
       (37.5, 13.52), (40, 13.59), (42.5, 13.55), (45, 13.45), (47.5, 13.29),
       (50, 13.16), (52.5, 12.79), (55, 12.45), (57.5, 11.97), (60, 11.41),
       (62.5, 10.78), (65, 10.12), (67.5, 9.34), (70, 8.58), (72.5, 7.78), (75, 6.92),
       (77.5, 6.39), (80, 5.5), (82.5, 4.81), (85, 4.12), (87.5, 3.54), (90, 2.93),
       (92.5, 2.61), (95, 1.73), (97.5, 1.24), (100, 0.75), (102.5, 0.43),
       (104, 0.01), (105.5, -0.4), (107, -0.8)]
VENTRE = [(0, -1.6), (1, -2.0), (1.5, -2.1), (2.5, -2.2), (4, -2.25), (6, -2.2),
          (8, -2.1), (10, -2.05), (12.5, -2.06), (15, -1.99), (17.5, -1.9), (20, -1.56),
          (22.5, -1.48), (25, -1.53), (27.5, -1.66), (30, -1.8), (32.5, -2.04),
          (35, -2.54), (37.5, -2.79), (40, -3.01), (42.5, -3.13), (45, -3.31),
          (47.5, -3.53), (50, -3.71), (52.5, -3.86), (55, -4.04), (57.5, -4.17),
          (60, -4.28), (62.5, -4.4), (65, -4.48), (67.5, -4.54), (70, -4.59),
          (72.5, -4.62), (75, -4.65), (77.5, -4.62), (80, -4.63), (82.5, -4.64),
          (85, -4.73), (87.5, -4.86), (90, -4.99), (92.5, -5.2), (95, -5.37),
          (97.5, -5.49), (100, -5.52), (102.5, -5.45), (104, -5.35), (105.5, -5.2),
          (107, -5.0)]
DEMI_LARGEUR = [(0, 3.3), (1, 3.68), (1.5, 3.69), (2.5, 4.04), (4, 4.3), (6, 4.4), (8, 4.6),
                (10, 5.03), (12.5, 6.03), (15, 6.36), (17.5, 6.58), (20, 6.63), (22.5, 6.83),
                (25, 6.97), (27.5, 7.07), (30, 7.15), (32.5, 7.2), (35, 7.21), (37.5, 7.21),
                (40, 7.22), (42.5, 7.21), (45, 7.22), (47.5, 7.22), (50, 7.11), (52.5, 7.08),
                (55, 7.04), (57.5, 6.99), (60, 6.92), (62.5, 6.83), (65, 6.72), (67.5, 6.62),
                (70, 6.46), (72.5, 6.23), (75, 6), (77.5, 5.7), (80, 5.36), (82.5, 5.02),
                (85, 4.65), (87.5, 4.32), (90, 4.05), (92.5, 3.58), (95, 3.13), (97.5, 2.69),
                (100, 2.14), (102.5, 1.63), (104, 1.25), (105.5, 0.9), (107, 0.6)]

LONGUEUR = 105.0
# coupe oblique de la queue : droite passant par ces deux points (relevés photo)
QUEUE_BAS = (102.0, -5.45)
QUEUE_HAUT = (105.4, -0.4)

N_SUPER = 2.6        # exposant superellipse (flancs plats type "facettes")
H_LARGE = 0.45       # hauteur relative du point le plus large (0 = ventre, 1 = dos)


def interp(tab, x):
    xs, ys = zip(*tab)
    return float(np.interp(x, xs, ys))


def dos(x):
    return interp(DOS, x)


def ventre(x):
    return interp(VENTRE, x)


def demi_largeur(x):
    return interp(DEMI_LARGEUR, x)


def section_points(x, n=48):
    """Points (y, z) d'une section transversale à l'abscisse x."""
    yt, yb, w = dos(x), ventre(x), demi_largeur(x)
    ym = yb + H_LARGE * (yt - yb)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        z = w * math.copysign(abs(c) ** (2 / N_SUPER), c)
        b = (yt - ym) if s >= 0 else (ym - yb)
        y = ym + b * math.copysign(abs(s) ** (2 / N_SUPER), s)
        pts.append((y, z))
    return pts


def demi_largeur_a(x, y):
    """Demi-largeur du corps à la hauteur y dans la section x (0 si hors corps)."""
    yt, yb, w = dos(x), ventre(x), demi_largeur(x)
    ym = yb + H_LARGE * (yt - yb)
    b = (yt - ym) if y >= ym else (ym - yb)
    s = abs(y - ym) / b
    if s >= 1:
        return 0.0
    return w * (1 - s ** N_SUPER) ** (1 / N_SUPER)
