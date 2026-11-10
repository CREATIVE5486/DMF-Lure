"""Armature fil inox traversant (repère leurre, plan Z = 0).

Topologie reprise du croquis fourni : œillet de nez avec retour de fil,
tige, épingle ventrale en U, tige, œillet de queue avec retour de fil.
La tige est surélevée au milieu du corps pour laisser passer la rangée de
billes de lest SOUS le fil (stabilité en roulis).

Tous les plis sont formés autour de pions (clous Ø2.92) : chaque coude est un
arc de fibre neutre de rayon r = Ø_clou/2 + Ø_fil/2 centré sur un pion, ce qui
donne directement les positions des trous du gabarit de pliage.
"""
import math
from dataclasses import dataclass, field

from geom import ventre, QUEUE_BAS, QUEUE_HAUT


@dataclass
class Armature:
    d: float = 1.6               # diamètre fil inox
    clou_d: float = 2.92         # Ø des pions (clous) du gabarit = mandrin des plis
    oeil_ventre_jour: float = 3.0  # ouverture libre sous le ventre
    y_nez: float = 0.3           # axe de l'œillet de nez
    y_queue: float = -2.4        # axe de l'œillet de queue
    y_tige: float = 6.5          # hauteur de la tige au milieu
    x_coude1: tuple = (8.0, 14.5)   # sommets du coude avant (bas, haut)
    x_coude2: tuple = (66.0, 90.0)  # sommets du coude arrière (haut, bas)
    x_ventre: float = 33.5       # axe de l'épingle ventrale
    x_retour_nez: float = 4.5    # fin du retour de fil côté nez
    x_retour_queue: float = 98.0  # fin du retour de fil côté queue
    jeu_nez: float = 0.3         # jeu entre l'intérieur de l'œillet et le nez
    jeu_queue: float = 1.6       # œillet entièrement dégagé de la coupe oblique
    pts: list = field(default_factory=list)
    prims: list = field(default_factory=list)
    pions: list = field(default_factory=list)
    reperes: dict = field(default_factory=dict)

    def __post_init__(self):
        self.build()

    # ------------------------------------------------------------------
    @property
    def r(self):
        """Rayon de fibre neutre de tous les plis (autour d'un pion)."""
        return self.clou_d / 2 + self.d / 2

    def build(self):
        d, r = self.d, self.r
        h = d / 2                         # demi-écart des deux brins jointifs
        # œillet de nez : intérieur dégagé devant le nez (x = 0)
        xc_n = -(self.clou_d / 2) - self.jeu_nez
        yc_n = self.y_nez
        # œillet de queue : extérieur dégagé de la coupe oblique
        (x1, y1), (x2, y2) = QUEUE_BAS, QUEUE_HAUT
        tx, ty = x2 - x1, y2 - y1
        L = math.hypot(tx, ty)
        nx = ty / L                        # composante x de la normale sortante
        yc_q = self.y_queue
        x_face = x1 + (yc_q - y1) * tx / ty
        xc_q = x_face + (self.clou_d / 2 + self.jeu_queue) / nx
        xj = math.sqrt(r * r - h * h)      # recul de la jonction des brins / centre d'œillet
        xv = self.x_ventre
        ys = self.y_tige
        y_bas_v = ventre(xv) - self.oeil_ventre_jour + (self.clou_d / 2)  # centre pion ventral

        prims, pions = [], []

        def arc_c(c, a0, a1):
            """Arc de centre c, rayon r, de l'angle a0 à a1 (degrés, sens selon le signe)."""
            P = lambda a: (c[0] + r * math.cos(math.radians(a)), c[1] + r * math.sin(math.radians(a)))  # noqa: E731
            prims.append(("A", P(a0), P((a0 + a1) / 2), P(a1)))

        def polyligne_cong(points, noms):
            """Polyligne dont chaque sommet intérieur est congé de rayon r (pion au centre)."""
            cur = points[0]
            for i in range(1, len(points) - 1):
                V, A, B = points[i], points[i - 1], points[i + 1]
                a = _unit((V[0] - A[0], V[1] - A[1]))
                b = _unit((B[0] - V[0], B[1] - V[1]))
                dev = math.acos(max(-1, min(1, a[0] * b[0] + a[1] * b[1])))
                t = r * math.tan(dev / 2)
                s = (V[0] - a[0] * t, V[1] - a[1] * t)
                e = (V[0] + b[0] * t, V[1] + b[1] * t)
                bis = _unit((b[0] - a[0], b[1] - a[1]))
                dc = r / math.cos(dev / 2)
                c = (V[0] + bis[0] * dc, V[1] + bis[1] * dc)
                m = (c[0] - bis[0] * r, c[1] - bis[1] * r)
                prims.append(("L", cur, s))
                prims.append(("A", s, m, e))
                pions.append(dict(nom=noms[i - 1], c=c, pli=math.degrees(dev)))
                cur = e
            prims.append(("L", cur, points[-1]))

        # 1. retour de nez (brin haut) -> œillet par l'avant -> brin bas
        th = math.degrees(math.asin(h / r))
        prims.append(("L", (self.x_retour_nez, yc_n + h), (xc_n + xj, yc_n + h)))
        arc_c((xc_n, yc_n), th, 360 - th)
        pions.append(dict(nom="œillet de nez", c=(xc_n, yc_n), pli=360 - 2 * th))
        # 2. tige : coude avant, épingle (coin gauche), jambe gauche
        k1 = (self.x_coude1[0], yc_n - h)
        k2 = (self.x_coude1[1], ys)
        ul = (xv - r, ys)
        polyligne_cong([(xc_n + xj, yc_n - h), k1, k2, ul, (xv - r, y_bas_v)],
                       ["coude avant bas", "coude avant haut", "épingle gauche"])
        # 3. fond de l'épingle
        arc_c((xv, y_bas_v), 180, 360)
        pions.append(dict(nom="épingle ventrale", c=(xv, y_bas_v), pli=180.0))
        # 4. jambe droite, coin droit, tige, coude arrière, brin bas de queue
        ur = (xv + r, ys)
        k3 = (self.x_coude2[0], ys)
        k4 = (self.x_coude2[1], yc_q - h)
        polyligne_cong([(xv + r, y_bas_v), ur, k3, k4, (xc_q - xj, yc_q - h)],
                       ["épingle droite", "coude arrière haut", "coude arrière bas"])
        # 5. œillet de queue par l'arrière -> retour (brin haut)
        arc_c((xc_q, yc_q), 180 + th, 540 - th)
        pions.append(dict(nom="œillet de queue", c=(xc_q, yc_q), pli=360 - 2 * th))
        prims.append(("L", (xc_q - xj, yc_q + h), (self.x_retour_queue, yc_q + h)))

        self.prims = prims
        self.pions = pions
        # polyligne dense (rainure, distances, dessin)
        pts = []
        for p in prims:
            if p[0] == "L":
                n = max(1, int(math.dist(p[1], p[2]) / 0.5))
                seg = [(p[1][0] + (p[2][0] - p[1][0]) * i / n, p[1][1] + (p[2][1] - p[1][1]) * i / n)
                       for i in range(n + 1)]
            else:
                seg = _echantillonne_arc(p[1], p[2], p[3], 16)
            for q in seg:
                if not pts or math.dist(q, pts[-1]) > 1e-6:
                    pts.append(q)
        self.pts = pts
        self.reperes = dict(xc_n=xc_n, yc_n=yc_n, r_n=r, xc_q=xc_q, yc_q=yc_q, r_q=r,
                            xv=xv, y_bas_v=y_bas_v, r_v=r, ys=ys, xj=xj)

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


def _unit(v):
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n)


def cercle_3pts(a, m, b):
    ax, ay = a
    bx, by = m
    cx, cy = b
    dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax**2 + ay**2) * (by - cy) + (bx**2 + by**2) * (cy - ay) + (cx**2 + cy**2) * (ay - by)) / dd
    uy = ((ax**2 + ay**2) * (cx - bx) + (bx**2 + by**2) * (ax - cx) + (cx**2 + cy**2) * (bx - ax)) / dd
    return (ux, uy), math.hypot(ax - ux, ay - uy)


def balayage_arc(a, m, b):
    """(centre, rayon, angle départ, balayage signé) d'un arc défini par 3 points."""
    c, R = cercle_3pts(a, m, b)
    a0 = math.atan2(a[1] - c[1], a[0] - c[0])
    am = math.atan2(m[1] - c[1], m[0] - c[0])
    a1 = math.atan2(b[1] - c[1], b[0] - c[0])
    ccw = (a1 - a0) % (2 * math.pi)
    if (am - a0) % (2 * math.pi) < ccw:
        sw = ccw
    else:
        sw = -((a0 - a1) % (2 * math.pi))
    return c, R, a0, sw


def _echantillonne_arc(a, m, b, n):
    c, R, a0, sw = balayage_arc(a, m, b)
    n = max(4, int(abs(sw) / (math.pi / 2) * n))
    return [(c[0] + R * math.cos(a0 + sw * i / n), c[1] + R * math.sin(a0 + sw * i / n)) for i in range(n + 1)]
