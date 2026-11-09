# DMF-Lure – minnow 105 mm en demi-coques ABS

Corps de leurre relevé sur un **Jackson Artist FR105 Heavy Weight** (105 mm), imprimé en
**deux demi-coques** (coupe au plan de symétrie) assemblées au **jus d'ABS**, avec **armature inox Ø1,6
traversante**, **7 billes de tungstène Ø5** et **pions de centrage ABS**. La bavette fait corps avec le
leurre, avec un fondu arrondi sous le menton. L'armature se plie sur un **gabarit à pions** (clous Ø2,92).

![éclaté](docs/demi_coques_eclate.png)

## Fichiers (`out/`)

| Fichier | Contenu |
|---|---|
| `plateau_demi_coques.3mf` | coque A + coque B + 6 pions, déjà posés face plane sur le plateau → **à ouvrir dans le slicer** |
| `demi_coque_A.stl`, `demi_coque_B.stl`, `pions_centrage.stl` | les mêmes, séparés |
| `gabarit_pions_impression.stl` | gabarit de pliage de l'armature (déjà retourné) |
| `armature_plan.pdf` | armature cotée 2:1 (entraxes des pions) + vue 1:1, coordonnées des pions, gamme |
| `leurre.step`, `armature_fil.step`, `gabarit_pions.step` | CAO |
| `rapport.json` | positions des billes / pions / points de serrage, masses, équilibre |

Régénérer : `pip install -r requirements.txt` puis
`python3 cad/demi_coques.py && python3 cad/schema_armature.py && python3 cad/gabarit_pions.py`.
Paramètres : `C` dans `cad/demi_coques.py` (rainure, serrage, pions), `P` dans `cad/lure_artist105.py`
(forme, bavette, billes, hameçons), `Armature` dans `cad/armature.py`, `G` dans `cad/gabarit_pions.py`.

## Impression des demi-coques

* **Face plane contre le plateau, sans aucun support** (la demi-bavette est une paroi verticale).
* ABS, buse 0,4, couches 0,2, **remplissage 100 %** (l'équilibre est calculé pour un corps plein).
* **Compensation de pied d'éléphant à 0 ou très faible** : la rainure et les logements sont sur la face
  plane ; un pied d'éléphant fort ferme les points de serrage.
* Pions : imprimés debout, Ø2,4 × 4,2 mm, 6 pièces (4 + 2 de rechange).

## Ce qui tient l'armature pendant le collage

![coque A](docs/coque_A_rainure_serrage.png)

* **Coque A** : rainure de 2,1 mm de large (fil Ø1,6 + 0,5 de jeu), profonde de **0,9 mm**, donc le fil y est
  centré sur le plan de joint. Tous les ~12 mm, un **point de serrage** de 3 mm de long ramène la largeur à
  **1,6 mm** (10 points). On **clipse le fil** dedans en appuyant avec un objet plat : il reste plaqué et à plat.
* **Coque B** : même rainure mais profonde de **1,1 mm**, sans serrage. Elle absorbe un fil un peu gauche et
  le surplus de jus d'ABS.
* Si le serrage est trop dur ou trop mou : `serrage_l` (1,5 à 1,7) dans `C`.

## Assemblage

1. Ébavurer, tester à blanc : fil clipsé dans A, billes, pions, fermer avec B.
2. Une goutte de cyano dans chaque logement de A, poser les **7 billes**.
3. **Clipser l'armature** dans A (l'épingle ventrale et les œillets sortent par les encoches).
4. Enfoncer les **4 pions** dans A.
5. Jus d'ABS (ABS + acétone, consistance crème) au pinceau sur les deux faces planes, en évitant la rainure.
6. Fermer B, serrer (pinces à linge / élastiques), laisser sécher 24 h, poncer le joint.

Le joint au plan médian traverse aussi la bavette, mais dans le sens de sa longueur : les efforts de nage
la font fléchir parallèlement au joint, qui travaille donc peu. La tenue ligne → hameçons est assurée par le fil
traversant, pas par la colle.

## Lest et équilibre

* 7 logements sphériques **sous la tige** (y ≈ −0,5 à −1,1), moitié dans chaque coque, billes collées :
  rien ne bouge en nage, rien ne fait gîter le leurre.
* **Roulis** : CG **2,2 mm sous le centre de carène** (hameçons montés).
* **Tangage** : le nombre de billes est choisi pour une assiette au repos quasi horizontale.

| Billes Ø5 (7) | Masse billes | Total avec 2 hameçons (0,9 g) | Assiette au repos |
|---|---|---|---|
| **Tungstène** (prévu) | 8,7 g | **≈ 22,9 g** | **+2,7° (très léger nez en bas)** |
| Plomb | 5,2 g | 19,4 g | −33° (queue en bas) |
| Acier | 3,6 g | 17,8 g | −47° (queue en bas) |

Autre matériau ou autres hameçons : `bille_mat` / `hamecon_g` dans `P`, relancer.

## Armature (fil inox Ø1,6, recuit) et gabarit

Longueur développée 166 mm → **couper 190 mm**. Tous les plis se font autour des clous du gabarit
(rayon de fibre neutre 2,26 mm) : gabarit, plan et rainures ont exactement la même forme.

![plan](out/armature_plan_p1.png)
![gabarit](docs/gabarit_pions.png)

* Gabarit : 9 trous Ø3,0, **lamage Ø6,4 × 1,4 par dessous** pour la tête des clous, semelle de 2,4 mm qui suit le
  fil + bossages de 6 mm, tracé du fil gravé, traits de coupe des retours. ≈ 5 g de matière.
* Prendre de l'inox **recuit** (304/316 doux) : de l'inox « ressort » risque de casser au rayon d'un clou de 2,92.
* Visser ou coller le gabarit sur une planchette pour plier du Ø1,6.

## Géométrie relevée

* Longueur 105 mm, hauteur ≈ 16 mm, épaisseur ≈ 11,2 mm (profils mesurés sur photo, `cad/geom.py`).
* Bavette à 40° sous l'axe, longueur visible 14,8 mm, largeur 6 → 11 mm, épaisseur 1,8 mm, bords R0,8.
* Fondu menton/bavette : loft de sections arrondies, rayon de raccord ≈ 12 mm, sans arête vive.

![tête](docs/dessous_bavette_conge.png)

## Limites connues

* Profils relevés à la main (±0,5 mm), largeur estimée.
* Nage non testée : bavette réglable dans `P` (`bav_angle`, `bav_longueur`, `bav_larg_max`).
* L'ancienne version monobloc (impression couchée avec pause) reste dans `cad/lure_artist105.py`
  (`python3 cad/lure_artist105.py`) mais n'est plus la version recommandée.
