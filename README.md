# DMF Lure Studio

**Logiciel gratuit et complet pour concevoir, peindre, tester et imprimer en 3D vos propres leurres de pêche.**
Il fonctionne entièrement dans le navigateur (PC, Mac, tablette, téléphone), sans compte, et même hors-ligne une fois installé.

> Votre leurre préféré n'est plus fabriqué ? Recréez-le — ou inventez le vôtre.

## Les 5 modules

| Module | Ce qu'il fait |
|---|---|
| **Conception** | 8 bases (crank shad, plongeur profond, square bill, flat side, lipless, jerkbait, wakebait, micro crank). Longueur, hauteur, largeur, section ronde → carrée, arrondis nez/queue. Éditeurs de **profil** et de **vue de dessus** à points déplaçables. Bavette (forme ronde / carrée / coffin / bec, longueur, largeur, angle, épaisseur, position), attache de ligne (nez, bavette, dos), 0 à 3 hameçons ventraux + queue, yeux 3D, lest (plomb, tungstène, acier). Masse, flottabilité, centres de gravité/poussée et profondeur estimée calculés en direct. |
| **Peinture** | Peinture directement sur le modèle 3D : aérographe, pinceau, gomme, pipette, texte, symétrie gauche/droite, **pochoirs** (filet à écailles, points, rayures). Motifs : dégradé dos/flanc/ventre, barres tigre, écailles, taches, paillettes, ouïes, ligne latérale. 11 coloris prêts (Firetiger, Shad chromé, Citrus shad, Sexy shad…). Brillance, métallisé, vernis époxy, couleur des yeux, bavette transparente. Export/import de la texture. |
| **Simulation de nage** | Modèle physique : portance et traînée de la bavette, traînée du corps et du fil immergé, élasticité du fil (nylon, fluoro, tresse), flottabilité, stabilité en roulis et **décrochage** (blow-out) au-delà d'une vitesse critique, contacts avec le fond. 6 animations (régulier, stop & go, twitch, rapide, lent, yo-yo), ralenti jusqu'à 0,05×, 5 caméras, courbe de plongée et **banc d'essai** automatique de toutes les animations. |
| **Labo hydro** | Soufflerie 2D par méthode de Boltzmann sur réseau (D2Q9) : vitesse, tourbillons, pression, traînée Cd, portance Cl (plonge / remonte), nombre de Strouhal, assiette réglable. |
| **Impression & export** | Deux **demi-coques creuses étanches** (vérifiées automatiquement) + bavette séparée, posées à plat sur le plateau. Matière (PLA, PETG, ABS, ASA, résine, TPU), épaisseur de paroi, remplissage, épaisseur de finition. Poids et flottabilité **corrigés pour l'impression**. Téléchargements : STL (.zip), **3MF** prêt à trancher, **fiche de montage** (.md), projet (.json), texture (.png), rendu 3D (.png). |

Autres fonctions : bibliothèque « Mes leurres » (enregistrement local automatique), annuler/rétablir, import/export de projets pour partager avec des amis, unités mm·g ou in·oz, français / anglais, installable comme une application (PWA).

### Conception précise

- **Sections le long du leurre (loft)** : plusieurs stations, chacune avec sa propre forme de section (points déplaçables + cotes en mm), raccordées en douceur — tête en V, ventre plat, dos arrondi… au même endroit que vous le feriez dans un logiciel de CAO.
- **Atelier de forme** : grand éditeur du profil et de la vue de dessus avec **tableau de cotes en mm** (saisie exacte), ajout/suppression de points et densification.

### Onglet Intérieur

- **Corps creux automatique** (paroi réglable) et **armature** : rainure dans le plan de joint, diamètre du fil, tracé automatique ou **esquisse libre** (points déplaçables, ajout au double-clic).
- **Logements** : billes en tube, bille seule, **puits à billes ouvert sur le plan de joint**, **chambres d'air**, chambres hochet — forme (tube/oblong, sphère, boîte), orientation, position et dimensions au dixième de mm, nombre/diamètre/matière des billes, ajustement automatique du trou aux billes.
- **Schéma coté** (vue de côté + vue de dessus, cotes depuis le nez) avec glisser-déposer, **export SVG/PNG**.
- Contrôle de l'**épaisseur de paroi** autour de chaque logement, **nombre de billes conseillé** pour chaque objectif (flottant mi-hauteur, suspending, coulant…).
- Les logements et l'armature sont creusés dans les demi-coques exportées et pris en compte dans la masse et la flottaison.

### Importer ses propres leurres

Bouton **« Importer mon leurre (STL, 3MF, STEP) »** dans Conception (ou *Mes leurres → Importer un modèle 3D*) :

- **Formats** : STL (binaire ou texte), 3MF (avec composants et transformations), **STEP** (lu par OpenCascade en WebAssembly, chargé à la demande).
- **Leurre entier, demi-coquille ou les 2 moitiés** : une demi-coquille est reconnue grâce à sa face de joint plane et **complétée automatiquement par symétrie** ; une cavité modélisée est détectée.
- **Orientation et unités automatiques**, avec boutons pour tourner, inverser avant/arrière ou haut/bas, et choisir les unités.
- **Bavette détectée** (longueur, largeur, angle, épaisseur) pour le calcul de nage, réglable.
- **Volumes exacts** par lancer de rayons sur le maillage : eau déplacée, matière, ligne de flottaison et assiette.
- Le leurre est ensuite **équipé** comme les autres : armature, lest (billes visibles en mode rayons X), hameçons et anneaux brisés dimensionnés selon le poids, objectifs de lestage. On peut le peindre, le simuler en nage, et en tirer des demi-coques, un moule ou un contre-moule.

## Utiliser

### En ligne (gratuit, via GitHub Pages)
1. Fusionner cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` publie l'application à chaque push sur `main` :
   `https://<votre-compte>.github.io/DMF-Lure/`
4. Dans Chrome/Edge : icône « Installer » dans la barre d'adresse → l'application s'ouvre comme un logiciel et fonctionne hors-ligne. Sur téléphone : menu → « Ajouter à l'écran d'accueil ».

### En local
```bash
npm install
npm run dev          # développement : http://localhost:5173
npm run build        # version de production dans dist/
npm run build:single # tout dans un seul fichier dist-single/index.html (à ouvrir directement)
npm test             # tests : étanchéité des pièces + simulation de nage
```

## Raccourcis

`1`–`5` onglets · `Ctrl+Z` / `Ctrl+Y` annuler / rétablir · `Ctrl+S` enregistrer · `[` `]` taille du pinceau · `Espace` lecture/pause (nage) · Éditeur de profil : glisser = déplacer, double-clic = ajouter un point, clic droit = supprimer.

## Fabrication (résumé)

1. Imprimer les deux moitiés posées sur leur face de joint, sans supports (couche 0,12–0,16 mm, parois pleines).
2. Poser l'armature inox 0,8 mm dans le plan de joint, coller le lest au fond de la cavité.
3. Coller les moitiés (époxy 5 min ou cyano), entailler la fente de bavette, coller la bavette.
4. Poncer, apprêt blanc, peinture (gabarit de texture exporté), yeux, vernis époxy.
5. Test en bassin et réglage de l'attache.

La fiche de montage exportée donne toutes les cotes, positions d'hameçons, masses et réglages pour **votre** leurre.

## Architecture

```
src/
  design.js        modèle de données, bases, tailles d'hameçons, matières
  geometry.js      surfaces paramétriques, bavette, demi-coques creuses étanches
  physics.js       masse, volume, flottabilité, centres de gravité / poussée
  swimPhysics.js   modèle physique de nage (sans rendu, testable)
  swim.js          scène sous-marine Three.js
  cfd.js           soufflerie 2D Boltzmann sur réseau
  paint.js         moteur de peinture UV et coloris
  export.js zip.js STL, 3MF, ZIP, fiche de montage
  studio.js        vue 3D atelier / plateau d'impression
  lureModel.js     modèle 3D affiché (corps, bavette, yeux, hameçons)
  editors.js       éditeurs de profil 2D
  panels/          interface de chaque module
tests/             tests Node (géométrie, nage, CFD)
```

Les résultats physiques sont des **estimations** destinées à comparer des variantes : validez toujours en bassin.

Licence MIT.
