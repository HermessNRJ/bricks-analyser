/**
 * Préférences d'affichage du registre
 *
 * Tri, filtres et nombre de fiches par page survivent à la visite. Ils étaient
 * jusqu'ici lus dans `appInitializer` et écrits dans `uiUpdater`, chacun
 * répétant les noms de clés en clair : ajouter un filtre demandait de toucher
 * cinq endroits, et une faute de frappe dans l'un des deux se traduisait par un
 * réglage qui ne revenait jamais, sans rien signaler.
 *
 * Ce module est la seule déclaration de ce qui est retenu, sous quel nom, et
 * avec quelle valeur par défaut. Les identifiants sont aussi ceux des contrôles
 * correspondants dans `index.html`, ce qui permet de réaligner l'interface sur
 * l'état enregistré sans table de correspondance.
 *
 * L'écriture peut échouer — navigation privée, quota, stockage désactivé. Une
 * préférence d'affichage ne vaut pas d'interrompre l'application : l'échec est
 * journalisé, le réglage reste actif pour la session, et il est simplement
 * oublié à la prochaine visite.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { analyserVersion } from '../utils/version.js';

/**
 * Nombres de fiches par page proposés
 *
 * 24 par défaut : 241 fiches d'un bloc donnaient une page de 80 000 px. Le
 * choix reste ouvert parce que la bonne taille dépend de ce qu'on cherche —
 * feuilleter demande des pages courtes, chercher à l'œil demande tout d'un
 * coup. `Infinity` est la valeur de « Tout », et non un cas particulier à
 * tester partout : elle traverse `slice` et `Math.ceil` sans rien casser.
 */
export const TAILLES_PAGE = [24, 48, 96, Infinity];

const TAILLE_PAGE_DEFAUT = 24;

/**
 * Ce qui est retenu d'une visite à l'autre
 *
 * `decoder` et `encoder` ne servent qu'aux préférences qui ne sont pas des
 * chaînes ; `valide` écarte une valeur devenue caduque — un tri supprimé du
 * menu, une taille de page qui n'est plus proposée — plutôt que de la
 * réappliquer à un contrôle qui ne la connaît plus.
 */

/**
 * Aucun de ces réglages n'a de valeur vide : « tout afficher » s'écrit 'all'.
 * Une chaîne vide relue signifierait qu'une écriture a mal tourné, et se
 * traduirait par un <select> sans option correspondante.
 */
const nonVide = (valeur) => typeof valeur === 'string' && valeur !== '';

const DECLARATIONS = {
    // 'auto' n'est pas un thème : c'est l'absence de choix, et donc le défaut.
    // Tant qu'il tient, la page suit le réglage du système.
    theme: { defaut: 'auto', valide: (valeur) => ['auto', 'clair', 'sombre'].includes(valeur) },
    // Les deux seules entrées qui ne sont pas un réglage mais un souvenir : la
    // dernière version publiée qu'on ait vue, et la date où on l'a demandée.
    // Elles évitent de rejouer l'appel à chaque visite, et permettent
    // d'afficher le résultat connu sans attendre la réponse du réseau.
    //
    // La chaîne vide est ici une valeur légitime — « jamais vérifié » — au
    // contraire des filtres du registre ci-dessous.
    versionDistante: {
        defaut: '',
        valide: (valeur) => valeur === '' || analyserVersion(valeur) !== null
    },
    versionVerifieeLe: {
        defaut: 0,
        decoder: Number,
        encoder: String,
        valide: (valeur) => Number.isFinite(valeur) && valeur >= 0
    },
    propertySortBy: { defaut: 'investment-desc', valide: nonVide },
    propertyFilter: { defaut: 'all', valide: nonVide },
    propertyWarningFilter: { defaut: 'all', valide: nonVide },
    propertyCountryFilter: { defaut: 'all', valide: nonVide },
    propertyRegionFilter: { defaut: 'all', valide: nonVide },
    propertyDepartementFilter: { defaut: 'all', valide: nonVide },
    // Posé par un clic sur une ligne du tableau des localisations, sans menu
    // correspondant : sa validité se vérifie contre les lieux du portefeuille.
    propertyLieuFilter: { defaut: 'all', valide: nonVide },
    propertyVersementFilter: { defaut: 'all', valide: nonVide },
    registreTaillePage: {
        defaut: TAILLE_PAGE_DEFAUT,
        // « Tout » vaut Infinity, que ni JSON ni String ne savent restituer :
        // Number('Infinity') marche, mais String(Infinity) donne 'Infinity' et
        // JSON.stringify donne null. Le mot est donc écrit tel quel.
        decoder: (brut) => (brut === 'all' ? Infinity : Number(brut)),
        encoder: (valeur) => (Number.isFinite(valeur) ? String(valeur) : 'all'),
        valide: (valeur) => TAILLES_PAGE.includes(valeur)
    }
};

/** Les filtres du registre, dans l'ordre où la barre les présente */
export const CLES_FILTRES = [
    'propertyFilter',
    'propertyWarningFilter',
    'propertyCountryFilter',
    'propertyRegionFilter',
    'propertyDepartementFilter',
    'propertyVersementFilter'
];

function declaration(nom) {
    const decl = DECLARATIONS[nom];

    if (!decl) {
        // Toujours une faute de frappe dans le code appelant : aucune de ces
        // clés ne vient de l'utilisateur.
        throw new Error(`Préférence inconnue : ${nom}`);
    }

    return decl;
}

/**
 * Relit une préférence enregistrée
 * @param {string} nom - Clé déclarée dans DECLARATIONS
 * @returns {*} Valeur enregistrée si elle est encore valide, défaut sinon
 */
export function lirePreference(nom) {
    const { defaut, decoder, valide } = declaration(nom);

    let brut;
    try {
        brut = localStorage.getItem(nom);
    } catch (err) {
        logger.warn(LOG_CATEGORIES.UI, 'Preference unreadable', { nom, err: err.message });
        return defaut;
    }

    if (brut === null) {
        return defaut;
    }

    const valeur = decoder ? decoder(brut) : brut;

    return !valide || valide(valeur) ? valeur : defaut;
}

/**
 * Enregistre une préférence pour la prochaine visite
 * @param {string} nom - Clé déclarée dans DECLARATIONS
 * @param {*} valeur - Valeur à retenir
 * @returns {boolean} Vrai si elle a bien été écrite
 */
export function ecrirePreference(nom, valeur) {
    const { encoder, valide } = declaration(nom);

    if (valide && !valide(valeur)) {
        logger.warn(LOG_CATEGORIES.UI, 'Preference rejected', { nom, valeur });
        return false;
    }

    try {
        localStorage.setItem(nom, encoder ? encoder(valeur) : String(valeur));
        return true;
    } catch (err) {
        logger.warn(LOG_CATEGORIES.UI, 'Preference not persisted', { nom, err: err.message });
        return false;
    }
}
