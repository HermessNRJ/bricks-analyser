/**
 * Où se trouve le portefeuille
 *
 * Bricks ne publie ni région, ni département, ni coordonnées : il publie une
 * adresse en toutes lettres. Tout ce qui suit en est déduit, et le code postal
 * est la seule prise sûre — 270 des 291 projets d'un portefeuille réel en
 * portent un, sous la forme « … , 06220 Vallauris ».
 *
 * Ce que la déduction vaut, et ce qu'elle ne vaut pas : un code postal désigne
 * une zone de distribution postale, pas une commune. Il suffit pour le
 * département, qui est ce qui nous intéresse ; il ne suffirait pas pour poser
 * un point sur une carte. Les rares codes à cheval sur deux départements sont
 * rattachés à celui de leurs deux premiers chiffres, ce qui est la convention.
 *
 * Ce module ne classe que ce dont il est sûr. Une adresse sans code postal
 * n'est pas devinée d'après son texte : elle est rangée à part, comptée, et
 * dite comme telle à l'écran. Un portefeuille dont un dixième des biens
 * échapperait au classement doit le montrer, pas le dissimuler dans « Autre ».
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Les régions, nommées une fois
 *
 * Écrites en clair à chaque ligne du tableau, une faute de frappe aurait scindé
 * une région en deux sans que rien ne le signale : deux barres « Occitanie »,
 * dont l'une amputée.
 */
const ARA = 'Auvergne-Rhône-Alpes';
const BFC = 'Bourgogne-Franche-Comté';
const BRE = 'Bretagne';
const CVL = 'Centre-Val de Loire';
const COR = 'Corse';
const GES = 'Grand Est';
const HDF = 'Hauts-de-France';
const IDF = 'Île-de-France';
const NOR = 'Normandie';
const NAQ = 'Nouvelle-Aquitaine';
const OCC = 'Occitanie';
const PDL = 'Pays de la Loire';
const PAC = "Provence-Alpes-Côte d'Azur";

/** Ce qu'on écrit quand l'adresse ne permet pas de conclure */
export const IMPRECISE = 'Localisation imprécise';

/**
 * Les 101 départements, avec leur nom et leur région
 *
 * Les collectivités d'outre-mer forment chacune leur propre région : les ranger
 * sous un « Outre-mer » commun mêlerait la Guadeloupe et Mayotte, qui n'ont en
 * partage que d'être loin.
 */
export const DEPARTEMENTS = {
    '01': ['Ain', ARA], '02': ['Aisne', HDF], '03': ['Allier', ARA],
    '04': ['Alpes-de-Haute-Provence', PAC], '05': ['Hautes-Alpes', PAC],
    '06': ['Alpes-Maritimes', PAC], '07': ['Ardèche', ARA], '08': ['Ardennes', GES],
    '09': ['Ariège', OCC], '10': ['Aube', GES], '11': ['Aude', OCC],
    '12': ['Aveyron', OCC], '13': ['Bouches-du-Rhône', PAC], '14': ['Calvados', NOR],
    '15': ['Cantal', ARA], '16': ['Charente', NAQ], '17': ['Charente-Maritime', NAQ],
    '18': ['Cher', CVL], '19': ['Corrèze', NAQ],
    '2A': ['Corse-du-Sud', COR], '2B': ['Haute-Corse', COR],
    21: ["Côte-d'Or", BFC], 22: ["Côtes-d'Armor", BRE], 23: ['Creuse', NAQ],
    24: ['Dordogne', NAQ], 25: ['Doubs', BFC], 26: ['Drôme', ARA],
    27: ['Eure', NOR], 28: ['Eure-et-Loir', CVL], 29: ['Finistère', BRE],
    30: ['Gard', OCC], 31: ['Haute-Garonne', OCC], 32: ['Gers', OCC],
    33: ['Gironde', NAQ], 34: ['Hérault', OCC], 35: ['Ille-et-Vilaine', BRE],
    36: ['Indre', CVL], 37: ['Indre-et-Loire', CVL], 38: ['Isère', ARA],
    39: ['Jura', BFC], 40: ['Landes', NAQ], 41: ['Loir-et-Cher', CVL],
    42: ['Loire', ARA], 43: ['Haute-Loire', ARA], 44: ['Loire-Atlantique', PDL],
    45: ['Loiret', CVL], 46: ['Lot', OCC], 47: ['Lot-et-Garonne', NAQ],
    48: ['Lozère', OCC], 49: ['Maine-et-Loire', PDL], 50: ['Manche', NOR],
    51: ['Marne', GES], 52: ['Haute-Marne', GES], 53: ['Mayenne', PDL],
    54: ['Meurthe-et-Moselle', GES], 55: ['Meuse', GES], 56: ['Morbihan', BRE],
    57: ['Moselle', GES], 58: ['Nièvre', BFC], 59: ['Nord', HDF],
    60: ['Oise', HDF], 61: ['Orne', NOR], 62: ['Pas-de-Calais', HDF],
    63: ['Puy-de-Dôme', ARA], 64: ['Pyrénées-Atlantiques', NAQ],
    65: ['Hautes-Pyrénées', OCC], 66: ['Pyrénées-Orientales', OCC],
    67: ['Bas-Rhin', GES], 68: ['Haut-Rhin', GES], 69: ['Rhône', ARA],
    70: ['Haute-Saône', BFC], 71: ['Saône-et-Loire', BFC], 72: ['Sarthe', PDL],
    73: ['Savoie', ARA], 74: ['Haute-Savoie', ARA], 75: ['Paris', IDF],
    76: ['Seine-Maritime', NOR], 77: ['Seine-et-Marne', IDF], 78: ['Yvelines', IDF],
    79: ['Deux-Sèvres', NAQ], 80: ['Somme', HDF], 81: ['Tarn', OCC],
    82: ['Tarn-et-Garonne', OCC], 83: ['Var', PAC], 84: ['Vaucluse', PAC],
    85: ['Vendée', PDL], 86: ['Vienne', NAQ], 87: ['Haute-Vienne', NAQ],
    88: ['Vosges', GES], 89: ['Yonne', BFC], 90: ['Territoire de Belfort', BFC],
    91: ['Essonne', IDF], 92: ['Hauts-de-Seine', IDF], 93: ['Seine-Saint-Denis', IDF],
    94: ['Val-de-Marne', IDF], 95: ["Val-d'Oise", IDF],
    971: ['Guadeloupe', 'Guadeloupe'], 972: ['Martinique', 'Martinique'],
    973: ['Guyane', 'Guyane'], 974: ['La Réunion', 'La Réunion'],
    976: ['Mayotte', 'Mayotte']
};

/**
 * Le département dont relève un code postal
 *
 * Trois exceptions à « les deux premiers chiffres » : l'outre-mer en prend
 * trois, et la Corse n'a pas de département 20 — elle a 2A et 2B, que la Poste
 * sépare autour de 20190. La coupure est la convention retenue partout ; elle
 * se trompe sur quelques communes limitrophes, ce que ni Bricks ni cette page
 * ne sauraient trancher depuis une adresse.
 *
 * @param {string} codePostal - Cinq chiffres
 * @returns {string|null} Code du département, null s'il n'existe pas
 */
export function departementDuCode(codePostal) {
    if (!/^\d{5}$/.test(codePostal)) {
        return null;
    }

    let code;

    if (codePostal.startsWith('97') || codePostal.startsWith('98')) {
        code = codePostal.slice(0, 3);
    } else if (codePostal.startsWith('20')) {
        code = Number(codePostal) <= 20190 ? '2A' : '2B';
    } else {
        code = codePostal.slice(0, 2);
    }

    return code in DEPARTEMENTS ? code : null;
}

/**
 * Situe une adresse
 *
 * Le pays vient de l'appelant et non du texte : l'application le détecte déjà
 * depuis l'emoji de drapeau du nom du projet, et refaire ce travail ici aurait
 * donné deux réponses possibles à la même question.
 *
 * @param {string} adresse - Adresse telle que Bricks la publie
 * @param {string} [pays] - Pays déjà détecté pour ce projet
 * @returns {Object} { codePostal, ville, departement, nomDepartement, region, situe }
 */
export function analyserAdresse(adresse, pays = 'France') {
    const inconnu = {
        codePostal: null, ville: null, departement: null,
        nomDepartement: null, region: IMPRECISE, situe: false
    };

    // Un bien à l'étranger n'a pas de département français : sa région est son
    // pays, ce qui le range à part dans les barres sans le faire disparaître.
    if (pays && pays !== 'France') {
        return { ...inconnu, region: pays, ville: derniereSection(adresse), situe: true };
    }

    if (typeof adresse !== 'string') {
        return inconnu;
    }

    // Le DERNIER groupe de cinq chiffres, et non le premier : un numéro de rue
    // ou une boîte postale peut en présenter un plus tôt, jamais plus tard —
    // l'adresse française finit sur « code postal, ville ».
    const trouves = [...adresse.matchAll(/\b(\d{5})\b/g)];
    const dernier = trouves[trouves.length - 1];

    if (!dernier) {
        return inconnu;
    }

    const codePostal = dernier[1];
    const departement = departementDuCode(codePostal);

    if (!departement) {
        return { ...inconnu, codePostal };
    }

    const [nomDepartement, region] = DEPARTEMENTS[departement];

    return {
        codePostal,
        ville: villeApres(adresse, dernier.index + codePostal.length),
        departement,
        nomDepartement,
        region,
        situe: true
    };
}

/**
 * La dernière section d'une adresse étrangère
 *
 * Sans code postal reconnaissable, il n'y a rien pour délimiter la commune —
 * mais une adresse va du plus fin au plus large, et la ville est donc au bout.
 * « Cais Velho, Setúbal » donne Setúbal ; prendre le début aurait donné la rue.
 *
 * @param {string} adresse - Adresse complète
 * @returns {string|null} Dernière section, null si l'adresse est vide
 */
function derniereSection(adresse) {
    if (typeof adresse !== 'string') {
        return null;
    }

    const sections = adresse
        // Le drapeau qui sert à détecter le pays n'appartient pas au nom de ville
        .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
        .split(/[,;\n]/)
        .map(section => section.trim())
        .filter(Boolean);

    return sections[sections.length - 1] || null;
}

/**
 * Ce qui suit le code postal, nettoyé
 * @param {string} adresse - Adresse complète
 * @param {number} depuis - Position après le code postal
 * @returns {string|null} Nom de commune, null s'il n'y en a pas
 */
function villeApres(adresse, depuis) {
    if (typeof adresse !== 'string') {
        return null;
    }

    const ville = adresse.slice(depuis)
        .replace(/^[\s,;-]+/, '')
        // « Cedex 3 », « CEDEX » : une mention postale, pas un nom de commune
        .replace(/\s+cedex\s*\d*$/i, '')
        .split(/[,;\n]/)[0]
        .trim();

    return ville || null;
}

/**
 * Rattache sa situation à chaque propriété
 * @param {Array} properties - Propriétés du registre, modifiées sur place
 * @returns {Array} Les mêmes propriétés
 */
export function annoterGeographie(properties) {
    if (!Array.isArray(properties)) {
        return [];
    }

    properties.forEach(p => {
        p.geo = analyserAdresse(p.address, p.country);
    });

    const situees = properties.filter(p => p.geo.situe).length;

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Geography resolved', {
        properties: properties.length,
        located: situees
    });

    return properties;
}

/**
 * Les propriétés qui pèsent encore quelque chose
 *
 * Un projet remboursé vaut zéro euro : le compter parmi les départements
 * couverts annoncerait une présence là où il n'y a plus rien d'engagé.
 *
 * @param {Array} properties - Propriétés annotées
 * @returns {Array} Celles qui portent du capital
 */
function engagees(properties) {
    if (!Array.isArray(properties)) {
        return [];
    }

    return properties.filter(p => !p.isRefunded && p.investment > 0);
}

/**
 * Capital par région, de la plus lourde à la plus légère
 * @param {Array} properties - Propriétés annotées
 * @returns {Array<Object>} [{ region, capital, projets, part }]
 */
export function agregerParRegion(properties) {
    const retenues = engagees(properties);
    const total = retenues.reduce((somme, p) => somme + p.investment, 0);
    const parRegion = new Map();

    retenues.forEach(p => {
        const region = p.geo?.region || IMPRECISE;
        const cumul = parRegion.get(region) || { region, capital: 0, projets: 0 };

        cumul.capital += p.investment;
        cumul.projets += 1;
        parRegion.set(region, cumul);
    });

    return [...parRegion.values()]
        .map(r => ({ ...r, part: total > 0 ? r.capital / total * 100 : 0 }))
        // Départage par le nom : deux régions à égalité parfaite sont rares,
        // mais leur ordre ne doit pas dépendre de celui des propriétés reçues.
        .sort((a, b) => b.capital - a.capital || a.region.localeCompare(b.region, 'fr'));
}

/**
 * Ce qui identifie un lieu
 *
 * Deux biens de la même commune se rejoignent ; deux communes homonymes de
 * départements différents restent séparées. La même clé sert au regroupement du
 * tableau et au filtre du registre : la reconstruire des deux côtés aurait fait
 * qu'un clic sur une ligne ne retrouve pas toujours les biens qu'elle compte.
 *
 * Le tiret cadratin marque l'absence — un code de département ne contient
 * jamais de barre oblique, si bien que la première sépare toujours les deux
 * moitiés, y compris pour une commune qui en porterait une.
 *
 * @param {Object} [geo] - Situation d'une propriété
 * @returns {string} Clé du lieu
 */
export function cleLieu(geo) {
    return `${geo?.departement || '—'}/${geo?.ville || '—'}`;
}

/**
 * Nomme un lieu à partir de sa clé, pour la puce de rappel du registre
 * @param {string} cle - Clé rendue par cleLieu
 * @returns {string} « Cahors (46) », « Setúbal », ou l'aveu d'ignorance
 */
export function libelleLieu(cle) {
    if (typeof cle !== 'string' || !cle.includes('/')) {
        return cle || '';
    }

    const separateur = cle.indexOf('/');
    const departement = cle.slice(0, separateur);
    const ville = cle.slice(separateur + 1);

    if (ville === '—') {
        return departement === '—' ? 'Sans adresse exploitable' : `Département ${departement}`;
    }

    return departement === '—' ? ville : `${ville} (${departement})`;
}

/**
 * Capital par commune, de la plus lourde à la plus légère
 * @param {Array} properties - Propriétés annotées
 * @returns {Array<Object>} [{ cle, region, departement, nomDepartement, ville, capital, projets, part }]
 */
export function localisations(properties) {
    const retenues = engagees(properties);
    const total = retenues.reduce((somme, p) => somme + p.investment, 0);
    const parLieu = new Map();

    retenues.forEach(p => {
        const geo = p.geo || {};
        const cle = cleLieu(geo);
        const lieu = parLieu.get(cle) || {
            cle,
            region: geo.region || IMPRECISE,
            departement: geo.departement || null,
            nomDepartement: geo.nomDepartement || null,
            ville: geo.ville || null,
            capital: 0,
            projets: 0
        };

        lieu.capital += p.investment;
        lieu.projets += 1;
        parLieu.set(cle, lieu);
    });

    return [...parLieu.values()]
        .map(l => ({ ...l, part: total > 0 ? l.capital / total * 100 : 0 }))
        .sort((a, b) => b.capital - a.capital || (a.ville || '').localeCompare(b.ville || '', 'fr'));
}

/**
 * Capital par département, pour la carte
 *
 * L'outre-mer y figure comme le reste : c'est la carte qui le range en
 * cartouche, pas le calcul qui l'écarte.
 *
 * @param {Array} properties - Propriétés annotées
 * @returns {Array<Object>} [{ code, nom, region, capital, projets, part }]
 */
export function agregerParDepartement(properties) {
    const retenues = engagees(properties);
    const total = retenues.reduce((somme, p) => somme + p.investment, 0);
    const parCode = new Map();

    retenues.forEach(p => {
        const code = p.geo?.departement;

        // Un bien à l'étranger ou sans adresse exploitable n'a pas de
        // département : il ne peut pas être posé sur une carte de France, et
        // les barres par région le disent déjà.
        if (!code) {
            return;
        }

        const cumul = parCode.get(code) || {
            code,
            nom: DEPARTEMENTS[code][0],
            region: DEPARTEMENTS[code][1],
            capital: 0,
            projets: 0
        };

        cumul.capital += p.investment;
        cumul.projets += 1;
        parCode.set(code, cumul);
    });

    return [...parCode.values()]
        .map(d => ({ ...d, part: total > 0 ? d.capital / total * 100 : 0 }))
        .sort((a, b) => b.capital - a.capital || a.code.localeCompare(b.code));
}

/**
 * Range des montants en cinq paliers, du plus léger au plus lourd
 *
 * Les bornes sont prises sur le DÉPARTEMENT LE PLUS CHARGÉ, et non sur des
 * montants ronds. Un palier fixe — « au-delà de 10 000 € » — ne dirait rien sur
 * un petit portefeuille, où tout tomberait dans le premier ; et des quantiles
 * teindraient toujours un cinquième de la carte en foncé, même quand les écarts
 * sont dérisoires.
 *
 * POURQUOI UNE RACINE CARRÉE. Un portefeuille se concentre : quelques
 * départements portent l'essentiel, la longue traîne pèse peu. Découpé
 * linéairement, le rapport au maximum entassait tout au premier palier et en
 * laissait deux vides — mesuré sur deux portefeuilles réels, 32 départements
 * sur 46 dans la teinte la plus pâle et rien dans les deux du milieu. La carte
 * était alors uniformément blafarde, ce qui ne dit rien. La racine étale le bas
 * de l'échelle et occupe les cinq teintes, sans faire passer une petite ligne
 * pour une grosse : elle reste monotone, donc plus foncé veut toujours dire
 * plus lourd. En montants bruts, les bornes tombent à 4, 16, 36 et 64 % du
 * département le plus chargé.
 *
 * Zéro n'est pas un palier. Un département sans bien n'est pas « très peu
 * engagé », il est hors du sujet, et la carte doit le montrer autrement qu'en
 * pâle — sans quoi elle ment sur les départements où il n'y a rien.
 *
 * @param {number} montant - Capital du département
 * @param {number} maximum - Capital du département le plus chargé
 * @returns {number} 0 si rien, sinon le palier de 1 à 5
 */
export function palier(montant, maximum) {
    if (!(montant > 0) || !(maximum > 0)) {
        return 0;
    }

    const part = Math.sqrt(montant / maximum);

    if (part > 0.8) return 5;
    if (part > 0.6) return 4;
    if (part > 0.4) return 3;
    if (part > 0.2) return 2;
    return 1;
}

/**
 * Ce que la géographie dit en trois chiffres
 * @param {Array} properties - Propriétés annotées
 * @returns {Object} { capital, departements, villes, premiere, imprecises }
 */
export function resumeGeographie(properties) {
    const retenues = engagees(properties);
    const regions = agregerParRegion(retenues);

    return {
        capital: retenues.reduce((somme, p) => somme + p.investment, 0),
        departements: new Set(retenues.map(p => p.geo?.departement).filter(Boolean)).size,
        villes: new Set(
            retenues.filter(p => p.geo?.departement)
                .map(p => `${p.geo.departement}/${p.geo.ville}`)
                .filter(cle => !cle.endsWith('/null'))
        ).size,
        premiere: regions[0] || null,
        // Compté et montré, jamais fondu dans « Autre » : c'est la mesure de ce
        // que cette section ne sait pas.
        imprecises: retenues.filter(p => !p.geo?.situe).length
    };
}

/**
 * Les régions présentes, pour le menu du registre
 * @param {Array} properties - Propriétés annotées
 * @returns {Array<string>} Régions triées, « Localisation imprécise » en dernier
 */
export function regionsPresentes(properties) {
    const regions = [...new Set(engagees(properties).map(p => p.geo?.region).filter(Boolean))];

    return regions.sort((a, b) => {
        if (a === IMPRECISE) return 1;
        if (b === IMPRECISE) return -1;
        return a.localeCompare(b, 'fr');
    });
}

/**
 * Les départements présents, pour le menu du registre
 * @param {Array} properties - Propriétés annotées
 * @returns {Array<Object>} [{ code, nom }] triés par code
 */
export function departementsPresents(properties) {
    const codes = [...new Set(engagees(properties).map(p => p.geo?.departement).filter(Boolean))];

    return codes
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(code => ({ code, nom: DEPARTEMENTS[code][0] }));
}
