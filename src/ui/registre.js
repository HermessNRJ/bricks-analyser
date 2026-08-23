/**
 * Le registre des propriétés
 *
 * L'état de la liste — tri, filtres, recherche, page courante, taille de page —
 * et tout ce qui le rend : la grille de fiches, les puces de filtres actifs et
 * la pagination. Les fiches elles-mêmes sont composées par fiche.js.
 */

import { truncate } from '../utils/formatters.js';
import { escapeHtml } from '../utils/html.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { libelleLieu } from '../business/geographie.js';
import { TAILLES_PAGE, CLES_FILTRES, lirePreference, ecrirePreference } from '../core/preferences.js';
import { createPropertyCard } from './fiche.js';
import { filterProperties, sortProperties } from './registre/filtrage.js';
import { pagesAffichees, renderPagination } from './registre/pagination.js';
import { LIBELLES_FILTRES, libelleDepartement, populateCountryFilter, populateGeoFilters } from './registre/menus.js';

// Réexportée : uiUpdater sert de façade au registre, et le découpage interne de
// celui-ci n'a pas à remonter jusqu'à ses appelants.
export { pagesAffichees };

let taillePage = lirePreference('registreTaillePage');

// La liste complète, et l'état de ce qu'on en montre. Le registre est le seul
// à y toucher : c'est ce qui permet à un changement de filtre de ne redessiner
// que lui, sans repasser par le calcul.
let allProperties = [];
let currentSortBy = 'investment-desc';
let currentFilter = 'all';
let currentWarningFilter = 'all';
let currentCountryFilter = 'all';
let currentRegionFilter = 'all';
let currentDepartementFilter = 'all';
let currentLieuFilter = 'all';
let currentVersementFilter = 'all';
let currentSearch = '';
let currentPage = 1;
let idCible = null;

// Ventilation des versements par propriété et mois de référence : les fiches en
// ont besoin bien après le calcul, à chaque changement de page ou de filtre.
let versementsParPropriete = null;
let moisVersements = null;

/**
 * Charge le registre avec un portefeuille et rouvre les préférences
 *
 * Appelé à chaque nouveau calcul. Les filtres reviennent de la visite
 * précédente, mais la page repart à un : rester en page 5 d'une liste qui
 * vient de changer de taille ferait tomber sur autre chose que ce qu'on
 * regardait.
 *
 * @param {Array} properties - Propriétés du portefeuille
 * @param {Object} [versements] - { parPropriete, moisReference } issus du calcul
 */
export function initRegistre(properties, versements) {
    allProperties = properties;

    currentSortBy = lirePreference('propertySortBy');
    currentFilter = lirePreference('propertyFilter');
    currentWarningFilter = lirePreference('propertyWarningFilter');
    currentCountryFilter = lirePreference('propertyCountryFilter');
    currentRegionFilter = lirePreference('propertyRegionFilter');
    currentDepartementFilter = lirePreference('propertyDepartementFilter');
    currentLieuFilter = lirePreference('propertyLieuFilter');
    currentPage = 1;

    versementsParPropriete = versements?.parPropriete || null;
    moisVersements = versements?.moisReference || null;

    // Sans relevé, aucune fiche ne porte de pastille et le menu du filtre reste
    // caché. Un « Rien reçu » mémorisé viderait alors le registre sans laisser
    // de quoi le rouvrir : il est rouvert d'office, et l'oubli est enregistré.
    if (moisVersements) {
        currentVersementFilter = lirePreference('propertyVersementFilter');
    } else {
        currentVersementFilter = 'all';
        ecrirePreference('propertyVersementFilter', 'all');
    }

    populateCountryFilter(allProperties, currentCountryFilter);

    // Les menus disent lesquels de ces réglages ne correspondent plus à rien ;
    // c'est ici, où ils vivent, qu'ils sont rouverts.
    ({
        region: currentRegionFilter,
        departement: currentDepartementFilter,
        lieu: currentLieuFilter
    } = populateGeoFilters(allProperties, {
        region: currentRegionFilter,
        departement: currentDepartementFilter,
        lieu: currentLieuFilter
    }));
    updatePropertyList(allProperties);
}

/**
 * Change le nombre de fiches par page et revient au début du registre
 *
 * Rester à la page 5 après être passé de 24 à 96 fiches ferait sauter par-dessus
 * les trois quarts de la liste sans qu'on l'ait demandé.
 *
 * @param {number|string} valeur - Taille, ou 'all' pour tout afficher
 */
export function setTaillePage(valeur) {
    const taille = valeur === 'all' || valeur === Infinity ? Infinity : Number(valeur);

    if (!TAILLES_PAGE.includes(taille)) {
        return;
    }

    taillePage = taille;
    currentPage = 1;

    ecrirePreference('registreTaillePage', taille);

    logger.debug(LOG_CATEGORIES.UI, 'Registry page size changed', { taillePage });
    updatePropertyList(allProperties);
}

/**
 * Rassemble ce que la barre de filtres demande en ce moment
 *
 * Les huit réglages vivent ici, en huit variables ; le filtrage, lui, est une
 * fonction pure qui ne connaît pas ce module. Ce petit assemblage est la
 * frontière entre les deux, et le seul endroit où l'ordre des critères se lit.
 *
 * @returns {Object} Critères à passer à filterProperties
 */
function criteresCourants() {
    return {
        statut: currentFilter,
        alerte: currentWarningFilter,
        versement: currentVersementFilter,
        pays: currentCountryFilter,
        region: currentRegionFilter,
        departement: currentDepartementFilter,
        lieu: currentLieuFilter,
        recherche: currentSearch
    };
}

/**
 * Renvoie le nombre de fiches par page en vigueur
 * @returns {number} Taille courante, Infinity si tout est affiché
 */
export function taillePageCourante() {
    return taillePage;
}

/**
 * Renvoie la page du registre actuellement ouverte
 *
 * Sert à rendre sa place à qui l'a quittée sans le vouloir : l'export déplie
 * tout le registre pour le capturer, et doit ensuite reposer la vue là où elle
 * était.
 *
 * @returns {number} Numéro de la page affichée
 */
export function pageCourante() {
    return currentPage;
}






/**
 * Met en avant une propriété : lève les filtres qui la masqueraient,
 * la place sur la bonne page, puis y amène l'écran.
 * @param {string} propertyId - Identifiant de la propriété
 */
export function focusProperty(propertyId) {
    const cible = allProperties.find(p => p.id === propertyId);

    if (!cible) {
        return;
    }

    // Un filtre actif pourrait exclure la propriété visée : on repart à zéro
    currentFilter = 'all';
    currentWarningFilter = 'all';
    currentCountryFilter = 'all';
    currentRegionFilter = 'all';
    currentDepartementFilter = 'all';
    currentLieuFilter = 'all';
    currentSearch = '';
    idCible = propertyId;

    persistFilters();
    syncControls();

    // Retrouver sa position dans la liste triée pour ouvrir la bonne page
    const ordonnees = sortProperties(filterProperties(allProperties, criteresCourants()), currentSortBy);
    const position = ordonnees.findIndex(p => p.id === propertyId);
    currentPage = position >= 0 ? Math.floor(position / taillePage) + 1 : 1;

    updatePropertyList(allProperties);

    const carte = document.querySelector(`[data-property-id="${CSS.escape(propertyId)}"].property-card`);
    if (carte) {
        carte.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    logger.debug(LOG_CATEGORIES.UI, 'Property focused from mur', { propertyId, page: currentPage });
}

/**
 * Met à jour la liste des propriétés avec tri, filtrage et pagination
 * @param {Array} properties - Liste des propriétés
 */
function updatePropertyList(properties) {
    const container = document.getElementById('propertiesList');
    const countElement = document.getElementById('propertyCount');

    if (!container) {
        logger.warn(LOG_CATEGORIES.UI, 'Properties list container not found');
        return;
    }

    const filtrees = filterProperties(properties, criteresCourants());
    const triees = sortProperties(filtrees, currentSortBy);

    // Une page vidée par un changement de filtre doit reculer, pas rester vide
    const nbPages = Math.max(1, Math.ceil(triees.length / taillePage));
    currentPage = Math.min(Math.max(1, currentPage), nbPages);

    // (1 - 1) × Infinity vaut NaN : avec « Tout », le début se pose à la main
    const debut = Number.isFinite(taillePage) ? (currentPage - 1) * taillePage : 0;
    const page = triees.slice(debut, debut + taillePage);

    if (countElement) {
        countElement.textContent = triees.length;
    }

    const countLabel = document.getElementById('propertyCountLabel');
    if (countLabel) {
        countLabel.textContent = triees.length > 1 ? 'propriétés' : 'propriété';
    }

    if (triees.length === 0) {
        container.innerHTML = `
            <div class="etat-vide">
                <p>Aucune propriété ne correspond à ces critères.</p>
                <button type="button" class="bouton bouton-secondaire" data-action="reinitialiser">
                    Réinitialiser les filtres
                </button>
            </div>
        `;
    } else {
        const versements = { parPropriete: versementsParPropriete, moisReference: moisVersements };
        container.innerHTML = page.map(property => createPropertyCard(property, versements)).join('');
    }

    attachPropertyCardListener(container);
    renderFiltresActifs();
    renderPagination(triees.length, nbPages, { page: currentPage, taille: taillePage });
    highlightCible(container);

    logger.debug(LOG_CATEGORIES.UI, 'Property list updated', {
        total: properties.length,
        filtered: triees.length,
        displayed: page.length,
        page: currentPage,
        sortBy: currentSortBy
    });
}

/**
 * Souligne la propriété visée depuis le mur
 * @param {HTMLElement} container - Conteneur de la liste
 */
function highlightCible(container) {
    if (!idCible) {
        return;
    }

    const carte = container.querySelector(`[data-property-id="${CSS.escape(idCible)}"]`);
    if (carte) {
        carte.classList.add('est-ciblee');
    }
}

/**
 * Affiche les puces de filtres actifs et le bouton de remise à zéro
 */
function renderFiltresActifs() {
    const zone = document.getElementById('activeFilters');
    if (!zone) return;

    const puces = [];

    if (currentSearch) {
        puces.push({ cle: 'search', texte: `« ${truncate(currentSearch, 24)} »` });
    }
    if (currentFilter !== 'all') {
        puces.push({ cle: 'filter', texte: LIBELLES_FILTRES.filter[currentFilter] || currentFilter });
    }
    if (currentWarningFilter !== 'all') {
        puces.push({ cle: 'warningFilter', texte: LIBELLES_FILTRES.warningFilter[currentWarningFilter] || currentWarningFilter });
    }
    if (currentCountryFilter !== 'all') {
        puces.push({ cle: 'countryFilter', texte: currentCountryFilter });
    }
    if (currentRegionFilter !== 'all') {
        puces.push({ cle: 'regionFilter', texte: currentRegionFilter });
    }
    if (currentDepartementFilter !== 'all') {
        puces.push({ cle: 'departementFilter', texte: libelleDepartement(currentDepartementFilter) });
    }
    if (currentLieuFilter !== 'all') {
        puces.push({ cle: 'lieuFilter', texte: libelleLieu(currentLieuFilter) });
    }
    if (currentVersementFilter !== 'all') {
        puces.push({ cle: 'versementFilter', texte: LIBELLES_FILTRES.versementFilter[currentVersementFilter] || currentVersementFilter });
    }

    if (puces.length === 0) {
        zone.innerHTML = '';
        return;
    }

    zone.innerHTML = puces.map(p => `
        <span class="puce">${escapeHtml(p.texte)}
            <button type="button" data-clear="${p.cle}" aria-label="Retirer le filtre ${escapeHtml(p.texte)}">×</button>
        </span>
    `).join('') + `
        <button type="button" class="bouton bouton-secondaire" data-action="reinitialiser">Tout réinitialiser</button>
    `;

    attachFiltresListener(zone);
}

/**
 * Installe (une seule fois) le listener des puces de filtres
 * @param {HTMLElement} zone - Conteneur des puces
 */
function attachFiltresListener(zone) {
    if (zone.dataset.listenerAttached === 'true') {
        return;
    }

    zone.addEventListener('click', (event) => {
        const retrait = event.target.closest('[data-clear]');
        if (retrait) {
            clearFiltre(retrait.dataset.clear);
            return;
        }

        if (event.target.closest('[data-action="reinitialiser"]')) {
            resetFilters();
        }
    });

    zone.dataset.listenerAttached = 'true';
}

/**
 * Retire un filtre précis
 * @param {string} cle - Clé du filtre à neutraliser
 */
function clearFiltre(cle) {
    if (cle === 'search') currentSearch = '';
    if (cle === 'filter') currentFilter = 'all';
    if (cle === 'warningFilter') currentWarningFilter = 'all';
    if (cle === 'countryFilter') currentCountryFilter = 'all';
    if (cle === 'regionFilter') currentRegionFilter = 'all';
    if (cle === 'departementFilter') currentDepartementFilter = 'all';
    if (cle === 'lieuFilter') currentLieuFilter = 'all';
    if (cle === 'versementFilter') currentVersementFilter = 'all';

    currentPage = 1;
    idCible = null;
    persistFilters();
    syncControls();
    updatePropertyList(allProperties);
}

/**
 * Remet tous les filtres et la recherche à leur état neutre
 */
export function resetFilters() {
    currentFilter = 'all';
    currentWarningFilter = 'all';
    currentCountryFilter = 'all';
    currentRegionFilter = 'all';
    currentDepartementFilter = 'all';
    currentLieuFilter = 'all';
    currentVersementFilter = 'all';
    currentSearch = '';
    currentPage = 1;
    idCible = null;

    persistFilters();
    syncControls();
    updatePropertyList(allProperties);

    logger.info(LOG_CATEGORIES.UI, 'Filters reset');
}

/**
 * Enregistre les filtres courants pour la prochaine visite
 */
function persistFilters() {
    const valeurs = {
        propertyFilter: currentFilter,
        propertyWarningFilter: currentWarningFilter,
        propertyCountryFilter: currentCountryFilter,
        propertyRegionFilter: currentRegionFilter,
        propertyDepartementFilter: currentDepartementFilter,
        propertyLieuFilter: currentLieuFilter,
        propertyVersementFilter: currentVersementFilter
    };

    CLES_FILTRES.forEach(cle => ecrirePreference(cle, valeurs[cle]));
}

/**
 * Réaligne les contrôles du DOM sur l'état courant
 */
function syncControls() {
    const champs = {
        propertyFilter: currentFilter,
        propertyWarningFilter: currentWarningFilter,
        propertyCountryFilter: currentCountryFilter,
        propertyRegionFilter: currentRegionFilter,
        propertyDepartementFilter: currentDepartementFilter,
        propertyLieuFilter: currentLieuFilter,
        propertyVersementFilter: currentVersementFilter,
        propertySearch: currentSearch,
        propertySortBy: currentSortBy
    };

    Object.entries(champs).forEach(([id, valeur]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = valeur;
        }
    });
}

/**


/**
 * Change de page
 * @param {number} delta - -1 pour reculer, +1 pour avancer
 */
export function changePage(delta) {
    allerALaPage(currentPage + delta);
}

/**
 * Ouvre une page du registre
 *
 * Le défilement accompagne un clic : on a demandé la page suivante, la grille
 * doit venir sous les yeux. Il n'a rien à faire quand c'est le code qui repose
 * une page derrière lui — après un export, par exemple —, où déplacer la vue
 * serait un effet de bord que personne n'a demandé.
 *
 * @param {number} page - Numéro de page, borné à l'affichage
 * @param {Object} [options] - Réglages
 * @param {boolean} [options.defiler] - Amener la grille à l'écran
 */
export function allerALaPage(page, { defiler = true } = {}) {
    if (!Number.isFinite(page)) {
        return;
    }

    currentPage = page;
    idCible = null;
    updatePropertyList(allProperties);

    const liste = document.getElementById('propertiesList');
    if (defiler && liste) {
        liste.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Applique une recherche libre sur le nom et l'adresse
 * @param {string} terme - Texte saisi
 */
export function setSearch(terme) {
    currentSearch = (terme || '').trim();
    currentPage = 1;
    idCible = null;
    updatePropertyList(allProperties);
}

/**
 * Installe (une seule fois) le listener délégué d'ouverture des fiches propriété
 * @param {HTMLElement} container - Conteneur de la liste des propriétés
 */
function attachPropertyCardListener(container) {
    if (container.dataset.cardListenerAttached === 'true') {
        return;
    }

    // La fiche entière est un lien vers Bricks, mais elle contient désormais des
    // dépliants. Sans cette exception, ouvrir les actualités ouvrait le projet
    // dans un onglet — le clic sur le résumé remontait jusqu'à la carte.
    const dansUnDepliant = cible => Boolean(cible.closest('summary'));

    container.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="reinitialiser"]')) {
            resetFilters();
            return;
        }

        if (dansUnDepliant(event.target)) {
            return;
        }

        const card = event.target.closest('[data-project-url]');
        if (card) {
            window.open(card.dataset.projectUrl, '_blank', 'noopener');
        }
    });

    // Les fiches sont des liens : elles doivent répondre au clavier
    container.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        // Entrée et Espace déplient nativement un <summary> : les intercepter
        // priverait le clavier du seul moyen d'ouvrir les actualités.
        if (dansUnDepliant(event.target)) {
            return;
        }

        const card = event.target.closest('[data-project-url]');
        if (card) {
            event.preventDefault();
            window.open(card.dataset.projectUrl, '_blank', 'noopener');
        }
    });

    container.dataset.cardListenerAttached = 'true';
}




/**
 * Met à jour le tri et les filtres du registre
 *
 * Les critères sont nommés : la forme positionnelle imposait des chaînes
 * d'« undefined » pour ne toucher qu'un seul filtre, et se décalait
 * silencieusement dès qu'un critère disparaissait.
 *
 * @param {Object} [changements] - Critères à modifier, les autres sont conservés
 * @param {string} [changements.sortBy] - Nouveau critère de tri
 * @param {string} [changements.filter] - Nouveau filtre de statut
 * @param {string} [changements.warningFilter] - Nouveau filtre d'alerte
 * @param {string} [changements.countryFilter] - Nouveau filtre de pays
 * @param {string} [changements.regionFilter] - Nouveau filtre de région
 * @param {string} [changements.departementFilter] - Nouveau filtre de département
 * @param {string} [changements.lieuFilter] - Nouveau filtre de localisation
 * @param {string} [changements.versementFilter] - Nouveau filtre de versement
 */
export function updatePropertySortAndFilter({
    sortBy, filter, warningFilter, countryFilter, regionFilter, departementFilter, lieuFilter,
    versementFilter
} = {}) {
    if (sortBy !== undefined) {
        currentSortBy = sortBy;
        ecrirePreference('propertySortBy', sortBy);
    }

    if (filter !== undefined) {
        currentFilter = filter;
        ecrirePreference('propertyFilter', filter);
    }

    if (warningFilter !== undefined) {
        currentWarningFilter = warningFilter;
        ecrirePreference('propertyWarningFilter', warningFilter);
    }

    if (countryFilter !== undefined) {
        currentCountryFilter = countryFilter;
        ecrirePreference('propertyCountryFilter', countryFilter);
    }

    if (regionFilter !== undefined) {
        currentRegionFilter = regionFilter;
        ecrirePreference('propertyRegionFilter', regionFilter);
    }

    if (departementFilter !== undefined) {
        currentDepartementFilter = departementFilter;
        ecrirePreference('propertyDepartementFilter', departementFilter);
    }

    if (lieuFilter !== undefined) {
        currentLieuFilter = lieuFilter;
        ecrirePreference('propertyLieuFilter', lieuFilter);
    }

    if (versementFilter !== undefined) {
        currentVersementFilter = versementFilter;
        ecrirePreference('propertyVersementFilter', versementFilter);
    }

    // Tout changement de critère renvoie au début de la liste
    currentPage = 1;
    idCible = null;

    updatePropertyList(allProperties);

    logger.info(LOG_CATEGORIES.UI, 'Property sort/filter updated', {
        sortBy: currentSortBy,
        filter: currentFilter,
        countryFilter: currentCountryFilter
    });
}
