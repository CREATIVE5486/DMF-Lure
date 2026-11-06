"""Armature fil inox traversant (repère leurre, plan Z = 0).

Topologie reprise du croquis fourni : œillet de nez avec retour de fil,
tige, épingle ventrale en U, tige, œillet de queue avec retour de fil.
La tige est surélevée (≈ +3.5 mm) au milieu du corps pour laisser passer
la rangée de billes de lest SOUS le fil (stabilité en roulis).
"""
import math
from dataclasses import dataclass, field

from geom import ventre, QUEUE_BAS, QUEUE_HAUT


@dataclass
class Armature:
    d: float = 1.6               # diamètre fil inox
    oeil_nez_di: float = 3.0     # Ø intérieur œillet de nez (mandrin)
    oeil_queue_di: float = 3.0   # Ø intérieur œillet de queue
    oeil_ventre_di: float = 3.0  # largeur intérieure de l'épingle ventrale
    oeil_ventre_jour: float = 3.0  # ouverture libre sous le ventre
    y_nez: float = 0.0           # axe de l'œillet de nez
    y_queue: float = -2.4        # axe de l'œillet de queue
    y_tige: float = 4.2          # hauteur de la tige au milieu
    x_coude1: tuple = (7.0, 12.0)   # début / fin de la montée avant
    x_coude2: tuple = (74.0, 95.0)  # début / fin de la descente arrière
    x_ventre: float = 33.0       # axe de l'épingle ventrale
    x_retour_nez: float = 5.0    # fin du retour de fil côté nez
    x_retour_queue: float = 97.0  # fin du retour de fil côté queue
    jeu_nez: float = 0.3         # jeu entre œillet et nez
    jeu_queue: float = 1.6       # œillet entièrement dégagé de la coupe oblique
    pts: list = field(default_factory=list)
    reperes: dict = field(default_factory=dict)

    def __post_init__(self):
        self.build()

    # ------------------------------------------------------------------
    def build(self):
        d = self.d
        r_n = self.oeil_nez_di / 2 + d / 2      # rayon fibre neutre nez
        r_q = self.oeil_queue_di / 2 + d / 2
        r_v = self.oeil_ventre_di / 2 + d / 2

        # œillet de nez : intérieur dégagé devant le nez (x = 0)
        xc_n = -(self.oeil_nez_di / 2) - self.jeu_nez
        yc_n = self.y_nez
        # œillet de queue : intérieur dégagé de la coupe oblique
        (x1, y1), (x2, y2) = QUEUE_BAS, QUEUE_HAUT
        tx, ty = x2 - x1, y2 - y1
        L = math.hypot(tx, ty)
        nx, ny = ty / L, -tx / L          # normale sortante
        yc_q = self.y_queue
        x_face = x1 + (yc_q - y1) * tx / ty
        xc_q = x_face + (self.oeil_queue_di / 2 + self.jeu_queue) / nx

        segs = []

        def arc(xc, yc, r, a0, a1, n=24):
            pa = (xc + r * math.cos(math.radians(a0)), yc + r * math.sin(math.radians(a0)))
            pm = (xc + r * math.cos(math.radians((a0 + a1) / 2)), yc + r * math.sin(math.radians((a0 + a1) / 2)))
            pb = (xc + r * math.cos(math.radians(a1)), yc + r * math.sin(math.radians(a1)))
            segs.append(("A", pa, pm, pb))
            return [(xc + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                     yc + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
                    for i in range(n + 1)]

        h = d / 2  # demi-écart des deux brins jointifs
        th_n = math.degrees(math.asin(h / r_n))
        th_q = math.degrees(math.asin(h / r_q))
        ys = self.y_tige
        xv = self.x_ventre
        y_bas_v = ventre(xv) - self.oeil_ventre_jour + (r_v - h)  # centre arc ventral

        p = []
        # retour de nez (brin haut) -> œillet (arc par l'avant) -> tige (brin bas)
        p.append((self.x_retour_nez, yc_n + h))
        p += arc(xc_n, yc_n, r_n, th_n, 360 - th_n)  # de haut-droite, par l'avant, à bas-droite
        p.append((self.x_coude1[0], yc_n - h))
        p.append((self.x_coude1[1], ys))
        # épingle ventrale
        p.append((xv - r_v, ys))
        p += arc(xv, y_bas_v, r_v, 180, 360)
        p.append((xv + r_v, ys))
        # tige -> descente -> œillet de queue (brin bas) -> retour (brin haut)
        p.append((self.x_coude2[0], ys))
        p.append((self.x_coude2[1], yc_q - h))
        p += arc(xc_q, yc_q, r_q, 180 + th_q, 540 - th_q)
        p.append((self.x_retour_queue, yc_q + h))
        # nettoyage doublons
        out = [p[0]]
        for q in p[1:]:
            if math.dist(q, out[-1]) > 1e-6:
                out.append(q)
        self.pts = out
        # segments (lignes / arcs) pour le balayage du fil
        prims = []
        last = None
        k = 0
        arcs = iter(segs)
        cur_arc = next(arcs, None)
        i = 0
        while i < len(out) - 1:
            a = out[i]
            if cur_arc and math.dist(a, cur_arc[1]) < 1e-6:
                prims.append(cur_arc)
                # avancer jusqu'à la fin de l'arc
                while math.dist(out[i], cur_arc[3]) > 1e-6:
                    i += 1
                cur_arc = next(arcs, None)
                continue
            prims.append(("L", a, out[i + 1]))
            i += 1
        self.prims = prims
        self.reperes = dict(xc_n=xc_n, yc_n=yc_n, r_n=r_n, xc_q=xc_q, yc_q=yc_q,
                            r_q=r_q, xv=xv, y_bas_v=y_bas_v, r_v=r_v, ys=ys)

    # ------------------------------------------------------------------
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
