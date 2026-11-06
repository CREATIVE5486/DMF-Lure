"""Plan de pliage de l'armature (fil inox) : PDF 2 pages + PNG.

Page 1 : vue cotée à l'échelle 2:1.
Page 2 : gabarit 1:1 à imprimer SANS mise à l'échelle (vérifier la règle 50 mm),
         + gamme de pliage.
"""
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armature import Armature  # noqa: E402
from geom import dos, ventre, QUEUE_BAS, QUEUE_HAUT  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")
A4 = (297, 210)
MM = 1 / 25.4
ROUGE = "#b3261e"
GRIS = "#9a9a9a"
BLEU = "#1f5fa8"


def silhouette():
    xs = [x / 2 for x in range(0, 215)]
    (x1, y1), (x2, y2) = QUEUE_BAS, QUEUE_HAUT
    haut = [(x, dos(x)) for x in xs if x <= x1 + (dos(x) - y1) * (x2 - x1) / (y2 - y1)]
    bas = [(x, ventre(x)) for x in xs if x <= x1]
    return haut + [(x2, y2), (x1, y1)] + bas[::-1]


def page(fig_mm=A4):
    fig = plt.figure(figsize=(fig_mm[0] * MM, fig_mm[1] * MM))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, fig_mm[0])
    ax.set_ylim(0, fig_mm[1])
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def cote_h(ax, xa, xb, y, txt, k, ox, oy, yref=None, fs=7, col=BLEU):
    """Cote horizontale entre xa et xb (coordonnées leurre), ligne à y."""
    X = lambda x: ox + k * x  # noqa: E731
    Y = lambda v: oy + k * v  # noqa: E731
    ax.annotate("", (X(xa), Y(y)), (X(xb), Y(y)),
                arrowprops=dict(arrowstyle="<|-|>", lw=0.5, color=col, shrinkA=0, shrinkB=0,
                                mutation_scale=6))
    for xx in (xa, xb):
        y0 = yref if yref is not None else y
        ax.plot([X(xx), X(xx)], [Y(y0), Y(y)], lw=0.3, color=col, ls=(0, (2, 1)))
    ax.text((X(xa) + X(xb)) / 2, Y(y) + 1.0, txt, ha="center", va="bottom", fontsize=fs, color=col)


def cote_v(ax, ya, yb, x, txt, k, ox, oy, fs=7, col=BLEU, cote="d"):
    X = lambda v: ox + k * v  # noqa: E731
    Y = lambda v: oy + k * v  # noqa: E731
    ax.annotate("", (X(x), Y(ya)), (X(x), Y(yb)),
                arrowprops=dict(arrowstyle="<|-|>", lw=0.5, color=col, shrinkA=0, shrinkB=0,
                                mutation_scale=6))
    dx = 1.2 if cote == "d" else -1.2
    ax.text(X(x) + dx, (Y(ya) + Y(yb)) / 2, txt, ha="left" if cote == "d" else "right",
            va="center", fontsize=fs, color=col, rotation=0)


def dessin(ax, a, k, ox, oy, lw_mm, cotes=True):
    X = lambda x: ox + k * x  # noqa: E731
    Y = lambda v: oy + k * v  # noqa: E731
    s = silhouette()
    ax.fill([X(p[0]) for p in s], [Y(p[1]) for p in s], color="#f3eee2", zorder=0)
    ax.plot([X(p[0]) for p in s + s[:1]], [Y(p[1]) for p in s + s[:1]], color=GRIS, lw=0.4, zorder=1)
    lw_pt = lw_mm * k * 72 / 25.4
    ax.plot([X(p[0]) for p in a.pts], [Y(p[1]) for p in a.pts], color=ROUGE, lw=lw_pt,
            solid_capstyle="round", solid_joinstyle="round", zorder=3)
    ax.plot([X(p[0]) for p in a.pts], [Y(p[1]) for p in a.pts], color="white", lw=0.25,
            ls=(0, (1, 1.5)), zorder=4)
    if not cotes:
        return
    r = a.reperes
    d = a.d
    yb_out = r["y_bas_v"] - r["r_v"] - d / 2
    ys = r["ys"]
    top = 13.5
    # cotes horizontales (axes)
    cote_h(ax, r["xc_n"], r["xv"], top, f"{r['xv'] - r['xc_n']:.1f}", k, ox, oy, yref=r["yc_n"])
    cote_h(ax, r["xv"], r["xc_q"], top, f"{r['xc_q'] - r['xv']:.1f}", k, ox, oy, yref=yb_out)
    cote_h(ax, r["xc_n"], r["xc_q"], top + 4.5,
           f"{r['xc_q'] - r['xc_n']:.1f}  (entraxe œillets)", k, ox, oy, yref=r["yc_n"])
    # coudes
    x1a, x1b = a.x_coude1
    x2a, x2b = a.x_coude2
    bas = -11.5
    cote_h(ax, r["xc_n"], x1a, bas, f"{x1a - r['xc_n']:.1f}", k, ox, oy, yref=r["yc_n"])
    cote_h(ax, x1a, x1b, bas, f"{x1b - x1a:.1f}", k, ox, oy, yref=ys)
    cote_h(ax, x1b, r["xv"] - r["r_v"], bas, f"{r['xv'] - r['r_v'] - x1b:.1f}", k, ox, oy, yref=ys)
    cote_h(ax, r["xv"] + r["r_v"], x2a, bas, f"{x2a - r['xv'] - r['r_v']:.1f}", k, ox, oy, yref=ys)
    cote_h(ax, x2a, x2b, bas, f"{x2b - x2a:.1f}", k, ox, oy, yref=ys)
    cote_h(ax, x2b, r["xc_q"], bas, f"{r['xc_q'] - x2b:.1f}", k, ox, oy, yref=r["yc_q"])
    # épingle ventrale
    cote_h(ax, r["xv"] - r["r_v"] - d / 2, r["xv"] + r["r_v"] + d / 2, -15.5,
           f"G = {2 * r['r_v'] + d:.1f} ext.", k, ox, oy, yref=r["y_bas_v"])
    cote_v(ax, ys, yb_out, r["xv"] + 5.0, f"H = {ys - yb_out:.1f}\n(axe tige → bas du U)", k, ox, oy)
    cote_v(ax, ventre(r["xv"]), yb_out + d, r["xv"] - 4.0, f"jour {ventre(r['xv']) - yb_out - d:.1f}",
           k, ox, oy, cote="g")
    # hauteurs
    cote_v(ax, r["yc_n"] - d / 2, ys, x1b + 3, f"{ys - (r['yc_n'] - d / 2):.1f}", k, ox, oy)
    cote_v(ax, ys, r["yc_q"] - d / 2, x2b - 4, f"{ys - (r['yc_q'] - d / 2):.1f}", k, ox, oy)
    # angles
    ang1 = math.degrees(math.atan2(ys - (r["yc_n"] - d / 2), x1b - x1a))
    ang2 = math.degrees(math.atan2(ys - (r["yc_q"] - d / 2), x2b - x2a))
    ax.text(X(x1a + 2.6), Y(r["yc_n"] + 0.6), f"{ang1:.0f}°", fontsize=7, color=BLEU)
    ax.text(X((x2a + x2b) / 2 + 1), Y((ys + r["yc_q"]) / 2 + 1.6), f"{ang2:.0f}°", fontsize=7, color=BLEU)
    # œillets
    ax.text(X(r["xc_n"] - 1), Y(r["yc_n"] + 3.2), f"Œillet de nez\nØint {a.oeil_nez_di:.1f}",
            fontsize=7, ha="center", color=BLEU)
    ax.text(X(r["xc_q"] + 1), Y(r["yc_q"] - 5.2), f"Œillet de queue\nØint {a.oeil_queue_di:.1f}",
            fontsize=7, ha="center", color=BLEU)
    ax.text(X(r["xv"] + 9), Y(r["y_bas_v"] - 2.6), f"Épingle ventrale\nØint {a.oeil_ventre_di:.1f}",
            fontsize=7, ha="left", color=BLEU)
    cote_h(ax, a.x_retour_nez, 0.13, r["yc_n"] + 2.0, f"retour {a.x_retour_nez - 0.13:.1f}", k, ox, oy,
           yref=r["yc_n"] + 0.5, fs=6)
    xj = r["xc_q"] - math.sqrt(r["r_q"] ** 2 - (d / 2) ** 2)
    cote_h(ax, a.x_retour_queue, xj, r["yc_q"] + 3.4, f"retour {xj - a.x_retour_queue:.1f}", k, ox, oy,
           yref=r["yc_q"] + 0.5, fs=6)


def gamme(a):
    """Longueurs droites et angles de pliage, dans l'ordre du fil."""
    rows = []
    prims = a.prims

    def ang(p):
        return math.degrees(math.atan2(p[2][1] - p[1][1], p[2][0] - p[1][0]))
    for i, p in enumerate(prims):
        if p[0] == "L":
            ln = math.dist(p[1], p[2])
            rows.append(["droit", f"{ln:.1f}"])
        else:
            (xa, ya), (xm, ym), (xb, yb) = p[1], p[2], p[3]
            # rayon via cercle circonscrit
            ax_, ay_ = xa, ya
            bx, by = xm, ym
            cx, cy = xb, yb
            dd = 2 * (ax_ * (by - cy) + bx * (cy - ay_) + cx * (ay_ - by))
            ux = ((ax_**2 + ay_**2) * (by - cy) + (bx**2 + by**2) * (cy - ay_) + (cx**2 + cy**2) * (ay_ - by)) / dd
            uy = ((ax_**2 + ay_**2) * (cx - bx) + (bx**2 + by**2) * (ax_ - cx) + (cx**2 + cy**2) * (bx - ax_)) / dd
            R = math.hypot(xa - ux, ya - uy)
            a0 = math.atan2(ya - uy, xa - ux)
            a1 = math.atan2(yb - uy, xb - ux)
            sweep = (a1 - a0) % (2 * math.pi)
            am = math.atan2(ym - uy, xm - ux)
            if not ((am - a0) % (2 * math.pi) < sweep):
                sweep = 2 * math.pi - sweep
            rows.append([f"enroulé {math.degrees(sweep):.0f}° sur mandrin Ø{2 * R - a.d:.1f}",
                         f"{R * sweep:.1f}"])
    # angles entre segments droits consécutifs
    out = []
    for i, p in enumerate(prims):
        r = rows[i]
        pli = ""
        if p[0] == "L" and i + 1 < len(prims) and prims[i + 1][0] == "L":
            q = prims[i + 1]
            da = (ang(q) - ang(p) + 180) % 360 - 180
            if abs(da) > 0.5:
                pli = f"pli {abs(da):.0f}°"
        out.append([str(i + 1), r[0], r[1], pli])
    return out


def main():
    a = Armature()
    os.makedirs(OUT, exist_ok=True)
    pdf_path = os.path.join(OUT, "armature_plan.pdf")
    L = a.longueur()
    with PdfPages(pdf_path) as pdf:
        # ---------------- page 1 : 2:1 coté
        fig, ax = page()
        k = 2.0
        ox, oy = 22, 112
        dessin(ax, a, k, ox, oy, a.d)
        ax.text(10, 200, "Armature fil inox – leurre minnow 105 (impression ABS couché)",
                fontsize=12, weight="bold")
        ax.text(10, 193.5, f"Échelle 2:1  ·  cotes en mm, sur l'axe du fil (fibre neutre)  ·  "
                f"fil inox Ø{a.d:.1f} (304/316 ressort)  ·  longueur développée {L:.0f} mm "
                f"→ couper {math.ceil(L / 5) * 5 + 20:.0f} mm",
                fontsize=8)
        notes = [
            "• Tout le fil est dans UN SEUL PLAN : poser sur une surface plane après chaque pli et redresser.",
            "• Œillets nez/queue : enrouler sur un foret Ø2,5 (queue lisse), brins jointifs, le retour se loge contre la tige.",
            "• Épingle ventrale : enrouler sur un foret Ø3, branches parallèles (entraxe 4,0).",
            "• Les cotes horizontales se mesurent parallèlement à la tige ; la silhouette grise = contour du leurre.",
            "• Vérifier à plat sur le gabarit 1:1 (page 2) puis à blanc dans la rainure avant l'impression.",
        ]
        for i, t in enumerate(notes):
            ax.text(10, 40 - i * 5, t, fontsize=7.5)
        pdf.savefig(fig)
        fig.savefig(os.path.join(OUT, "armature_plan_p1.png"), dpi=200)
        plt.close(fig)

        # ---------------- page 2 : gabarit 1:1 + gamme
        fig, ax = page()
        k = 1.0
        ox, oy = 20, 160
        dessin(ax, a, k, ox, oy, a.d, cotes=False)
        ax.text(10, 200, "Gabarit 1:1 – imprimer à 100 % (« taille réelle », sans ajustement)",
                fontsize=11, weight="bold")
        # règle de contrôle 50 mm
        ax.plot([150, 200], [182, 182], color="k", lw=0.8)
        for x in range(150, 201, 10):
            ax.plot([x, x], [181, 183.5], color="k", lw=0.6)
        ax.text(175, 184.5, "contrôle : 50 mm", ha="center", fontsize=7)
        # repères des coudes (ticks)
        for x in (a.x_coude1[0], a.x_coude1[1], a.x_coude2[0], a.x_coude2[1]):
            ax.plot([ox + x, ox + x], [oy - 12, oy + 12], color=BLEU, lw=0.3, ls=(0, (2, 2)))
        # gamme
        rows = gamme(a)
        ax.text(10, 138, "Gamme (dans l'ordre du fil, du retour de nez au retour de queue)",
                fontsize=9, weight="bold")
        y = 131
        ax.text(12, y, "N°", fontsize=7.5, weight="bold")
        ax.text(22, y, "tronçon", fontsize=7.5, weight="bold")
        ax.text(110, y, "longueur (mm)", fontsize=7.5, weight="bold")
        ax.text(140, y, "pli suivant", fontsize=7.5, weight="bold")
        for rw in rows:
            y -= 5.2
            ax.text(12, y, rw[0], fontsize=7.5)
            ax.text(22, y, rw[1], fontsize=7.5)
            ax.text(110, y, rw[2], fontsize=7.5)
            ax.text(140, y, rw[3], fontsize=7.5)
        y -= 7
        ax.text(12, y, f"Total développé ≈ {L:.0f} mm (+ prise de pince : couper "
                f"{math.ceil(L / 5) * 5 + 20:.0f} mm puis recouper les retours à longueur).",
                fontsize=7.5)
        conseils = [
            "Ordre conseillé :",
            "1. Former l'œillet de nez sur le foret Ø2,5 en laissant ≈ 15 mm de queue, recouper le retour à 4,9 mm.",
            "2. Plier la montée (coude bas puis coude haut) en se calant sur le gabarit.",
            "3. Marquer l'axe de l'épingle, enrouler sur foret Ø3, serrer les branches parallèles.",
            "4. Plier la descente arrière, contrôler sur gabarit.",
            "5. Former l'œillet de queue, recouper le retour.",
            "6. Mettre à plat (étau / marteau sur bois), présenter dans la rainure imprimée.",
        ]
        for i, t in enumerate(conseils):
            ax.text(175, 131 - i * 6, t, fontsize=7, weight="bold" if i == 0 else None, wrap=True)
        pdf.savefig(fig)
        fig.savefig(os.path.join(OUT, "armature_plan_p2.png"), dpi=200)
        plt.close(fig)
    print("écrit", pdf_path)


if __name__ == "__main__":
    main()
