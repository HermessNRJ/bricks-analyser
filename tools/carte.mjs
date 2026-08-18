/**
 * Fabrique le tracé des départements français, en SVG
 *
 * La carte de la section Géographie a besoin d'un contour par département. Ces
 * contours ne sont pas écrits à la main et ne sont recopiés de nulle part : ils
 * sont produits ici, depuis les données publiques de l'IGN, par un programme
 * qu'on peut relire. Le SVG qui en sort est committé — c'est un fichier de
 * 100 Ko que personne ne relira ligne à ligne, et le seul moyen de le tenir
 * honnête est qu'il soit reproductible à l'identique par cette commande.
 *
 *   node tools/carte.mjs
 *
 * SOURCE : « Contours des départements français » de Grégoire David, conversion
 * GeoJSON d'ADMIN EXPRESS COG de l'IGN, sous Licence ouverte (Etalab).
 * Attribution seule, sans clause de partage à l'identique : compatible avec
 * l'AGPL de ce dépôt. Le fichier d'entrée est téléchargé au premier lancement
 * et gardé dans data/, qui n'est pas suivi par git.
 *
 * CE QUE LA CARTE MONTRE, ET CE QU'ELLE DÉFORME
 *
 * La métropole est projetée en conique conforme de Lambert, aux parallèles
 * automécoïques de 44° et 49° : c'est la projection officielle de la France
 * métropolitaine, et la forme qu'on reconnaît.
 *
 * Les cinq départements d'outre-mer ne peuvent pas figurer à cette échelle —
 * La Réunion est à 9 000 km de Paris. Ils sont donc posés en cartouches, chacun
 * projeté et mis à l'échelle SÉPARÉMENT. Une surface n'y est donc pas
 * comparable à celle d'un département métropolitain, ni d'un cartouche à
 * l'autre : la Guyane fait 83 500 km² et Mayotte 374, elles occupent pourtant
 * des cadres voisins. C'est la convention de toutes les cartes de France, et
 * elle vaut d'être dite plutôt que subie — d'où le cadre tracé autour de chaque
 * cartouche, qui annonce la rupture d'échelle.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(RACINE, 'data/departements-avec-outre-mer.geojson');
const SORTIE = join(RACINE, 'src/carte/departements.svg');

const URL_SOURCE = 'https://raw.githubusercontent.com/gregoiredavid/france-geojson'
    + '/master/departements-avec-outre-mer.geojson';

/**
 * Espace de composition, en unités SVG
 *
 * Ce n'est pas le viewBox final : celui-ci est recalculé à la fin sur ce qui a
 * réellement été dessiné. La métropole ne remplit jamais exactement son cadre,
 * et s'en tenir à ces dimensions laissait une large bande vide sous la colonne
 * des cartouches.
 */
const LARGEUR = 640;
const HAUTEUR = 620;

/** Marge autour de la métropole */
const MARGE = 8;

/** Colonne des cartouches d'outre-mer, à gauche */
const CARTOUCHE = { x: 6, y: 8, cote: 84, ecart: 10 };

/**
 * Tolérance de simplification, en unités SVG
 *
 * Exprimée dans les unités du DESSIN et non en degrés : c'est la seule façon de
 * régler la simplification sur ce qui se voit. La carte est large de 640 unités
 * et s'affiche autour de 640 px : une unité vaut donc à peu près un pixel.
 *
 * Le réglage a été comparé à l'écran, à la taille réelle :
 *
 *   0,45 → 166 Ko    0,7 → 109 Ko    1,0 → 77 Ko    1,4 → 56 Ko
 *
 * 0,7 est indiscernable de 0,45 — l'écart tient sous le pixel. À 1,0 les côtes
 * du Sud-Ouest commencent à faceter, et à 1,4 la Bretagne devient un polygone.
 * Le tiers de poids gagné entre 0,45 et 0,7 ne coûte donc rien de visible ;
 * celui d'après se paierait.
 */
const TOLERANCE = 0.7;

/** Deux chiffres après la virgule : au-delà, on écrit du bruit */
const PRECISION = 2;

// --------------------------------------------------------------------------
// Projection
// --------------------------------------------------------------------------

const RAD = Math.PI / 180;

/**
 * Conique conforme de Lambert, deux parallèles automécoïques
 *
 * @param {number} lat1 - Premier parallèle automécoïque, en degrés
 * @param {number} lat2 - Second parallèle
 * @param {number} lon0 - Méridien d'origine
 * @returns {Function} ([lon, lat]) → [x, y] en unités arbitraires
 */
function lambert(lat1, lat2, lon0) {
    const f1 = lat1 * RAD;
    const f2 = lat2 * RAD;

    // Fonction isométrique : ln(tan(π/4 + φ/2))
    const iso = (f) => Math.log(Math.tan(Math.PI / 4 + f / 2));

    const n = Math.log(Math.cos(f1) / Math.cos(f2)) / (iso(f2) - iso(f1));
    const F = Math.cos(f1) * Math.exp(n * iso(f1)) / n;

    return ([lon, lat]) => {
        const f = lat * RAD;
        const rho = F / Math.exp(n * iso(f));
        const theta = n * (lon - lon0) * RAD;

        // Rho DÉCROÎT quand la latitude monte, et l'axe Y d'un SVG descend :
        // les deux inversions s'annulent, et y = ρcos θ met bien le nord en
        // haut. Le signe moins qu'on écrit par réflexe retournait la carte.
        return [rho * Math.sin(theta), rho * Math.cos(theta)];
    };
}

/**
 * Plate carrée corrigée en latitude, pour un territoire d'outre-mer
 *
 * Une conique réglée sur la France métropolitaine déformerait grossièrement un
 * territoire situé sous l'équateur. Chaque cartouche a donc sa propre
 * projection, calée sur sa propre latitude, où les distances restent justes au
 * voisinage du territoire.
 *
 * @param {number} lat0 - Latitude de référence, en degrés
 * @returns {Function} ([lon, lat]) → [x, y]
 */
function plateCarree(lat0) {
    const k = Math.cos(lat0 * RAD);
    return ([lon, lat]) => [lon * k, -lat];
}

// --------------------------------------------------------------------------
// Géométrie
// --------------------------------------------------------------------------

/**
 * Toutes les couronnes d'une géométrie GeoJSON, à plat
 * @param {Object} geometry - Polygon ou MultiPolygon
 * @returns {Array<Array>} Liste de couronnes, chacune une liste de [lon, lat]
 */
function couronnes(geometry) {
    if (geometry.type === 'Polygon') {
        return geometry.coordinates;
    }

    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.flat();
    }

    return [];
}

/**
 * Aire algébrique d'une couronne, par la formule du lacet
 * Sert à classer les couronnes par taille, pas à mesurer quoi que ce soit.
 * @param {Array} points - Couronne projetée
 * @returns {number} Aire, toujours positive
 */
function aire(points) {
    let somme = 0;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        somme += (points[j][0] * points[i][1]) - (points[i][0] * points[j][1]);
    }

    return Math.abs(somme / 2);
}

/**
 * Boîte englobante d'un ensemble de couronnes projetées
 * @param {Array<Array>} liste - Couronnes
 * @returns {Object} { xMin, yMin, xMax, yMax }
 */
function englobante(liste) {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;

    liste.forEach(couronne => couronne.forEach(([x, y]) => {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
    }));

    return { xMin, yMin, xMax, yMax };
}

/**
 * Distance d'un point au segment [a, b]
 * @param {Array} p - Point
 * @param {Array} a - Début du segment
 * @param {Array} b - Fin du segment
 * @returns {number} Distance perpendiculaire
 */
function distanceAuSegment(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const longueur = dx * dx + dy * dy;

    if (longueur === 0) {
        return Math.hypot(p[0] - a[0], p[1] - a[1]);
    }

    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / longueur;
    t = Math.max(0, Math.min(1, t));

    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Simplification de Douglas-Peucker
 *
 * Récursive dans l'énoncé, itérative ici : une côte bretonne compte des
 * milliers de points, et la pile n'a pas à en souffrir.
 *
 * @param {Array} points - Couronne projetée
 * @param {number} tolerance - Écart maximal toléré, en unités SVG
 * @returns {Array} Couronne allégée
 */
function simplifier(points, tolerance) {
    if (points.length <= 3) {
        return points;
    }

    const garde = new Uint8Array(points.length);
    garde[0] = 1;
    garde[points.length - 1] = 1;

    const pile = [[0, points.length - 1]];

    while (pile.length > 0) {
        const [debut, fin] = pile.pop();

        let pire = 0;
        let index = -1;

        for (let i = debut + 1; i < fin; i++) {
            const ecart = distanceAuSegment(points[i], points[debut], points[fin]);

            if (ecart > pire) {
                pire = ecart;
                index = i;
            }
        }

        if (pire > tolerance && index > 0) {
            garde[index] = 1;
            pile.push([debut, index], [index, fin]);
        }
    }

    return points.filter((_, i) => garde[i]);
}

/**
 * Écrit une couronne en commandes de chemin SVG
 * @param {Array} points - Couronne, en unités du dessin
 * @returns {string} « M… L… Z »
 */
function chemin(points) {
    const nombre = (v) => {
        const arrondi = v.toFixed(PRECISION);
        // « 12.30 » et « 12.0 » pèsent pour rien ; « .5 » non plus n'est pas
        // ambigu, et sur 14 000 points ces caractères comptent.
        return arrondi.replace(/\.?0+$/, '').replace(/^(-?)0\./, '$1.') || '0';
    };

    return points
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${nombre(x)},${nombre(y)}`)
        .join('') + 'Z';
}

// --------------------------------------------------------------------------
// Composition
// --------------------------------------------------------------------------

/**
 * Projette, cadre et simplifie un groupe de départements
 *
 * @param {Array<Object>} entites - Entités GeoJSON
 * @param {Function} projection - Projection à leur appliquer
 * @param {Object} cadre - { x, y, largeur, hauteur } où les faire tenir
 * @returns {Array<Object>} [{ code, nom, chemins }]
 */
function composer(entites, projection, cadre) {
    // Projeter d'abord, cadrer ensuite : l'échelle ne peut se calculer qu'une
    // fois connue l'étendue réelle de ce qu'on projette.
    const projetees = entites.map(entite => ({
        code: entite.properties.code,
        nom: entite.properties.nom,
        couronnes: couronnes(entite.geometry).map(c => c.map(projection))
    }));

    const boite = englobante(projetees.flatMap(d => d.couronnes));
    const etendueX = boite.xMax - boite.xMin;
    const etendueY = boite.yMax - boite.yMin;

    // La même échelle sur les deux axes : la carte doit garder ses proportions
    const echelle = Math.min(cadre.largeur / etendueX, cadre.hauteur / etendueY);

    // Centré dans son cadre
    const decalageX = cadre.x + (cadre.largeur - etendueX * echelle) / 2;
    const decalageY = cadre.y + (cadre.hauteur - etendueY * echelle) / 2;

    const placer = ([x, y]) => [
        decalageX + (x - boite.xMin) * echelle,
        decalageY + (y - boite.yMin) * echelle
    ];

    return projetees.map(departement => {
        const mises = departement.couronnes
            .map(c => simplifier(c.map(placer), TOLERANCE))
            // Trois points ne font pas une surface : ce qui tombe là est un
            // îlot que la simplification a réduit à un trait.
            .filter(c => c.length >= 4)
            .sort((a, b) => aire(b) - aire(a));

        // Aucun département ne disparaît, même réduit à un confetti : sa plus
        // grande couronne est gardée quoi qu'il arrive.
        const gardees = mises.length > 0
            ? mises
            : [departement.couronnes.sort((a, b) => aire(b) - aire(a))[0].map(placer)];

        return {
            code: departement.code,
            nom: departement.nom,
            chemins: gardees.map(chemin).join(''),
            // Gardés pour le cadrage final : le viewBox se calcule sur ce qui
            // est réellement dessiné, et non sur les cadres théoriques.
            points: gardees.flat()
        };
    });
}

/**
 * Échappe le texte destiné à un attribut XML
 * @param {string} texte - Texte brut
 * @returns {string} Texte échappé
 */
function attribut(texte) {
    return String(texte)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Télécharge les contours si le cache est vide
 * @returns {Promise<Object>} FeatureCollection
 */
async function lireSource() {
    if (!existsSync(SOURCE)) {
        console.log(`Téléchargement des contours depuis ${URL_SOURCE}`);

        const reponse = await fetch(URL_SOURCE);

        if (!reponse.ok) {
            throw new Error(`Contours indisponibles : HTTP ${reponse.status}`);
        }

        const texte = await reponse.text();
        mkdirSync(dirname(SOURCE), { recursive: true });
        writeFileSync(SOURCE, texte);

        console.log(`  ${Math.round(texte.length / 1024)} Ko écrits dans ${SOURCE}`);
    }

    return JSON.parse(readFileSync(SOURCE, 'utf8'));
}

const source = await lireSource();

// Les codes d'outre-mer tiennent sur trois chiffres, ceux de la métropole sur
// deux — 2A et 2B compris.
const metropole = source.features.filter(f => f.properties.code.length === 2);
const outreMer = source.features.filter(f => f.properties.code.length === 3)
    .sort((a, b) => a.properties.code.localeCompare(b.properties.code));

if (metropole.length === 0) {
    throw new Error('Aucun département métropolitain dans la source');
}

// La métropole occupe tout sauf la colonne des cartouches
const gaucheMetropole = CARTOUCHE.x + CARTOUCHE.cote + 18;

const dessines = composer(metropole, lambert(44, 49, 3), {
    x: gaucheMetropole,
    y: MARGE,
    largeur: LARGEUR - gaucheMetropole - MARGE,
    hauteur: HAUTEUR - MARGE * 2
});

// Un cartouche par territoire, empilés, chacun avec sa propre projection et sa
// propre échelle : c'est ce que le cadre autour annonce.
const cartouches = outreMer.map((entite, rang) => {
    const boite = englobante(couronnes(entite.geometry));
    const latMoyenne = (boite.yMin + boite.yMax) / 2;

    const cadre = {
        x: CARTOUCHE.x,
        y: CARTOUCHE.y + rang * (CARTOUCHE.cote + CARTOUCHE.ecart),
        largeur: CARTOUCHE.cote,
        hauteur: CARTOUCHE.cote
    };

    // Un peu de retrait dans le cadre, pour que le trait de bord ne colle pas
    const dedans = { x: cadre.x + 4, y: cadre.y + 4, largeur: cadre.largeur - 8, hauteur: cadre.hauteur - 14 };

    return {
        cadre,
        departement: composer([entite], plateCarree(latMoyenne), dedans)[0]
    };
});

// Le viewBox se calcule sur ce qui est dessiné, cadres des cartouches compris.
// Posé sur les dimensions théoriques, il laissait une large bande vide sous la
// colonne des cartouches et de part et d'autre de la métropole : la carte
// s'affichait alors plus petite qu'elle n'aurait pu, dans un bloc plus haut.
const tout = [
    ...dessines.flatMap(d => d.points),
    ...cartouches.flatMap(({ cadre }) => [
        [cadre.x, cadre.y],
        [cadre.x + cadre.largeur, cadre.y + cadre.hauteur]
    ])
];

const vue = englobante([tout]);
const cadrage = {
    x: vue.xMin - MARGE,
    y: vue.yMin - MARGE,
    largeur: vue.xMax - vue.xMin + MARGE * 2,
    hauteur: vue.yMax - vue.yMin + MARGE * 2
};

const arrondi = (v) => Number(v.toFixed(1));

const lignes = [];

lignes.push('<svg xmlns="http://www.w3.org/2000/svg"'
    + ` viewBox="${arrondi(cadrage.x)} ${arrondi(cadrage.y)}`
    + ` ${arrondi(cadrage.largeur)} ${arrondi(cadrage.hauteur)}"`
    + ' class="carte-departements" role="img"'
    + ' aria-label="Carte des départements français">');

lignes.push('  <g class="carte-metropole">');
dessines
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach(d => lignes.push(`    <path id="dep-${d.code}" data-code="${d.code}"`
        + ` data-nom="${attribut(d.nom)}" d="${d.chemins}"/>`));
lignes.push('  </g>');

cartouches.forEach(({ cadre, departement }) => {
    lignes.push(`  <g class="carte-cartouche" data-code="${departement.code}">`);
    lignes.push(`    <rect class="carte-cadre" x="${cadre.x}" y="${cadre.y}"`
        + ` width="${cadre.largeur}" height="${cadre.hauteur}" rx="3"/>`);
    lignes.push(`    <path id="dep-${departement.code}" data-code="${departement.code}"`
        + ` data-nom="${attribut(departement.nom)}" d="${departement.chemins}"/>`);
    lignes.push(`    <text class="carte-etiquette" x="${cadre.x + cadre.largeur / 2}"`
        + ` y="${cadre.y + cadre.largeur - 3}">${attribut(departement.nom)}</text>`);
    lignes.push('  </g>');
});

lignes.push('</svg>');

const svg = `${lignes.join('\n')}\n`;

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, svg);

const points = [...svg.matchAll(/[ML]/g)].length;

console.log(`${SORTIE} · ${Math.round(svg.length / 1024)} Ko`);
console.log(`  ${dessines.length} départements métropolitains`
    + ` + ${cartouches.length} en cartouche`);
console.log(`  ${points} points, simplifiés à ${TOLERANCE} unité près`);
console.log('  Contours IGN / ADMIN EXPRESS, Licence ouverte (Etalab)');
