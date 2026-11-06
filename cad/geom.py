"""Géométrie paramétrique du leurre (repère leurre).

Repère leurre : X = longueur (0 au nez, + vers la queue), Y = dos (+) / ventre (-),
Z = latéral (plan de symétrie Z = 0). Unités : mm.
Profils relevés sur photo de profil (Artist FR105 HW, 105 mm, 32 g).
"""
import math
import numpy as np

# ---------------------------------------------------------------- profils
DOS = [(0, 1.6), (0.6, 2.3), (1.5, 2.9), (3, 3.7), (5, 4.4), (10, 6.3), (15, 7.8),
       (20, 9.3), (25, 10.4), (30, 11.1), (35, 11.5), (40, 11.7), (45, 11.6),
       (50, 11.3), (55, 10.8), (60, 10.0), (65, 8.9), (70, 7.7), (75, 6.5),
       (80, 5.4), (85, 4.1), (90, 3.0), (95, 2.0), (100, 1.2), (107, 0.0)]
VENTRE = [(0, -1.9), (0.6, -2.8), (1.5, -3.5), (3, -4.1), (5, -4.4), (10, -4.6),
          (15, -4.5), (20, -4.3), (25, -4.2), (30, -4.2), (35, -4.3), (40, -4.4),
          (50, -4.6), (60, -4.8), (70, -4.85), (80, -4.9), (90, -5.0),
          (100, -5.2), (107, -5.4)]
DEMI_LARGEUR = [(0, 1.5), (0.6, 2.3), (1.5, 2.9), (3, 3.5), (5, 4.0), (10, 4.7),
                (15, 5.05), (20, 5.3), (30, 5.6), (40, 5.6), (50, 5.4), (60, 5.0),
                (70, 4.5), (80, 3.9), (90, 3.2), (100, 2.5), (107, 2.0)]

LONGUEUR = 105.0
# coupe oblique de la queue : droite passant par ces deux points (relevés photo)
QUEUE_BAS = (99.3, -5.3)
QUEUE_HAUT = (105.6, 0.1)

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
