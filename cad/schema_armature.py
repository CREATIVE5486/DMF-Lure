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
    # pions (clous)
    for i, p in enumerate(a.pions):
        cx, cy = p["c"]
        ax.add_patch(plt.Circle((X(cx), Y(cy)), k * a.clou_d / 2, fc="#555", ec="k", lw=0.3, zorder=5))
        ax.text(X(cx), Y(cy), str(i + 1), color="white", fontsize=4.5 * max(1, k / 1.4),
                ha="center", va="center", zorder=6, weight="bold")
    if not cotes:
        return
    r = a.reperes
    d = a.d
    yb_out = r["y_bas_v"] - r["r_v"] - d / 2
    ys = r["ys"]
    # entraxes des pions en X (chaîne)
    bas = -12.5
    xs = [p["c"][0] for p in a.pions]
    niveaux = [bas, bas - 3.4]
    for i in range(1, len(xs)):
        lvl = niveaux[i % 2]
        cote_h(ax, xs[i - 1], xs[i], lvl, f"{xs[i] - xs[i - 1]:.2f}", k, ox, oy,
               yref=a.pions[i]["c"][1], fs=6)
    cote_h(ax, xs[0], xs[-1], 12.5, f"{xs[-1] - xs[0]:.2f}  (pion de nez → pion de queue)", k, ox, oy,
           yref=a.pions[0]["c"][1])
    # épingle ventrale
    cote_v(ax, ys, yb_out, r["xv"] + 6.0, f"H = {ys - yb_out:.1f}\n(axe tige → bas du U)", k, ox, oy)
    cote_v(ax, ventre(r["xv"]), yb_out + d, r["xv"] - 4.5, f"jour {ventre(r['xv']) - yb_out - d:.1f}",
           k, ox, oy, cote="g")
    ax.text(X(r["xv"] + 8), Y(r["y_bas_v"] - 2.0),
            f"G = {2 * r['r_v'] + d:.1f} ext.", fontsize=7, color=BLEU)
    # hauteurs de tige
    cote_v(ax, r["yc_n"] - d / 2, ys, a.x_coude1[1] + 4, f"{ys - (r['yc_n'] - d / 2):.2f}", k, ox, oy)
    cote_v(ax, ys, r["yc_q"] - d / 2, a.x_coude2[1] - 4, f"{ys - (r['yc_q'] - d / 2):.2f}", k, ox, oy)
    xjn = r["xc_n"] + r["xj"]
    cote_h(ax, a.x_retour_nez, xjn, r["yc_n"] + 2.6, f"retour {a.x_retour_nez - xjn:.1f}", k, ox, oy,
           yref=r["yc_n"] + 0.8, fs=6)
    xjq = r["xc_q"] - r["xj"]
    cote_h(ax, a.x_retour_queue, xjq, r["yc_q"] + 3.6, f"retour {xjq - a.x_retour_queue:.1f}", k, ox, oy,
           yref=r["yc_q"] + 0.8, fs=6)


def gamme(a):
    """Tronçons dans l'ordre du fil : droits (longueur) et enroulements (pion, angle)."""
    from armature import balayage_arc
    out = []
    ip = 0
    for i, p in enumerate(a.prims):
        if p[0] == "L":
            out.append([str(i + 1), "droit", f"{math.dist(p[1], p[2]):.1f}"])
        else:
            c, R, a0, sw = balayage_arc(p[1], p[2], p[3])
            pn = a.pions[ip]
            ip += 1
            out.append([str(i + 1), f"enroulé {abs(math.degrees(sw)):.0f}° autour du pion {ip} ({pn['nom']})",
                        f"{R * abs(sw):.1f}"])
    return out


def main():
    a = Armature()
    os.makedirs(OUT, exist_ok=True)
    pdf_path = os.path.join(OUT, "armature_plan.pdf")
    L = a.longueur()
    coupe = math.ceil(L / 5) * 5 + 20
    with PdfPages(pdf_path) as pdf:
        # ---------------- page 1 : 2:1 coté
        fig, ax = page()
        k = 2.0
        ox, oy = 22, 115
        dessin(ax, a, k, ox, oy, a.d)
        ax.text(10, 200, "Armature fil inox – leurre minnow 105 (impression ABS couché, pause unique)",
                fontsize=12, weight="bold")
        ax.text(10, 193.5, f"Échelle 2:1  ·  cotes en mm  ·  fil inox Ø{a.d:g} (304/316)  ·  "
                f"pions = clous Ø{a.clou_d:g} (gabarit out/gabarit_pions_impression.stl)  ·  "
                f"longueur développée {L:.0f} mm → couper {coupe:.0f} mm", fontsize=8)
        notes = [
            "• Tous les plis se font AUTOUR DES CLOUS du gabarit : rayon de fibre neutre "
            f"{a.r:.2f} mm partout, les cotes du bas sont les entraxes des pions (identiques au gabarit).",
            "• Tout le fil est dans UN SEUL PLAN : il se couche dans la gravure du gabarit ; contrôler à plat après chaque pli.",
            "• Œillets : brins jointifs (le retour se loge contre la tige) ; recouper les retours sur les traits gravés du gabarit.",
            "• L'inox revient un peu après pliage : sur-plier de quelques degrés, puis vérifier en reposant le fil sur les pions.",
            "• Rainure du leurre : jeu 0,5 mm sur le Ø (paramètre fil_jeu_diam) → le fil rentre même avec de petits écarts.",
        ]
        for i, t in enumerate(notes):
            ax.text(10, 40 - i * 5, t, fontsize=7.5)
        pdf.savefig(fig)
        fig.savefig(os.path.join(OUT, "armature_plan_p1.png"), dpi=200)
        plt.close(fig)

        # ---------------- page 2 : 1:1 + pions + gamme
        fig, ax = page()
        k = 1.0
        ox, oy = 20, 165
        dessin(ax, a, k, ox, oy, a.d, cotes=False)
        ax.text(10, 200, "Vue 1:1 (imprimer à 100 %) – pions numérotés, gamme de pliage",
                fontsize=11, weight="bold")
        ax.plot([150, 200], [186, 186], color="k", lw=0.8)
        for x in range(150, 201, 10):
            ax.plot([x, x], [185, 187.5], color="k", lw=0.6)
        ax.text(175, 188.5, "contrôle : 50 mm", ha="center", fontsize=7)
        # pions
        ax.text(10, 145, "Pions (centre des clous, repère : pion 1 = œillet de nez)", fontsize=9, weight="bold")
        y = 139
        x0, y0 = a.pions[0]["c"]
        for i, p in enumerate(a.pions):
            ax.text(12, y, f"{i + 1}", fontsize=7.5)
            ax.text(18, y, p["nom"], fontsize=7.5)
            ax.text(55, y, f"X {p['c'][0] - x0:7.2f}   Y {p['c'][1] - y0:6.2f}", fontsize=7.5, family="monospace")
            ax.text(100, y, f"pli {p['pli']:.0f}°", fontsize=7.5)
            y -= 4.6
        # gamme
        rows = gamme(a)
        ax.text(130, 145, "Gamme (du retour de nez au retour de queue)", fontsize=9, weight="bold")
        y = 139
        for rw in rows:
            ax.text(132, y, rw[0], fontsize=7)
            ax.text(138, y, rw[1], fontsize=7)
            ax.text(268, y, rw[2] + " mm", fontsize=7, ha="right")
            y -= 4.3
        conseils = [
            "Mode opératoire sur le gabarit :",
            "1. Clous enfoncés par dessous (tête dans le lamage), gabarit posé sur ses bossages.",
            f"2. Couper {coupe:.0f} mm. Enrouler l'œillet de nez autour du pion 1 (≈ 15 mm de queue côté retour).",
            "3. Coucher la tige dans la gravure, l'enrouler successivement autour des pions 2, 3, 4,",
            "   puis faire le tour du pion 5 (fond de l'épingle) et remonter par le pion 6.",
            "4. Continuer : pions 7 et 8 (descente arrière), puis faire le tour du pion 9 (œillet de queue).",
            "5. Sortir l'armature, pincer jointifs les brins des œillets et de l'épingle,",
            "   recouper les retours aux traits gravés.",
            "6. Mettre à plat (étau / maillet sur bois) et présenter à blanc dans la rainure imprimée.",
        ]
        for i, t in enumerate(conseils):
            ax.text(10, 92 - i * 5, t, fontsize=7.5, weight="bold" if i == 0 else None)
        pdf.savefig(fig)
        fig.savefig(os.path.join(OUT, "armature_plan_p2.png"), dpi=200)
        plt.close(fig)
    print("écrit", pdf_path)


if __name__ == "__main__":
    main()
