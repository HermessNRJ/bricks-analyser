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
import { NIVEAUX_RISQUE } from '../business/riskAnalysis.js';
import { TAILLES_PAGE, CLES_FILTRES, lirePreference, ecrirePreference } from '../core/preferences.js';
import { createPropertyCard } from './fiche.js';
import { hasWarningInCurrentMonth, hasWarningInLastMonth, hasWarningInMonthBefore } from './alertes.js';

let taillePage = lirePreference('registreTaillePage');

// La liste complète, et l'état de ce qu'on en montre. Le registre est le seul
// à y toucher : c'est ce qui permet à un changement de filtre de ne redessiner
// que lui, sans repasser par le calcul.
let allProperties = [];
let currentSortBy = 'investment-desc';
let currentFilter = 'all';
let currentWarningFilter = 'all';
let currentCountryFilter = 'all';
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

    populateCountryFilter(allProperties);
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
 * Renvoie le nombre de fiches par page en vigueur
 * @returns {number} Taille courante, Infinity si tout est affiché
 */
export function taillePageCourante() {
    return taillePage;
}

/**
 * Libellés des filtres, pour les puces de rappel
 * La clé 'all' n'apparaît jamais : c'est l'état neutre.
 */
const LIBELLES_FILTRES = {
    filter: {
        active: 'Actives', refunded: 'Remboursées',
        ongoing: 'En financement', upcoming: 'À venir'
    },
    warningFilter: {
        'warning-current-month': 'Alerte ce mois-ci',
        'has-warning': 'Avec alerte', 'no-warning': 'Sans alerte',
        'risk-procedure': 'En défaut, échéances dues', 'risk-impaye': 'En retard, défaut non déclaré',
        'risk-signale': 'Signalé, sans incident', 'risk-sain': 'Sans signalement',
        'warning-last-month': 'Alerte sous 30 jours', 'warning-month-before': 'Alerte le mois d\'avant'
    },
    versementFilter: {
        verse: 'Versé', manquant: 'Rien reçu', attendu: 'Pas encore dû'
    }
};

/**
 * Remplit le dropdown des pays avec les pays disponibles
 * @param {Array} properties - Liste des propriétés
 */
function populateCountryFilter(properties) {
    const countryFilterSelect = document.getElementById('propertyCountryFilter');
    if (!countryFilterSelect) return;

    // Extraire les pays uniques
    const countries = [...new Set(properties.map(p => p.country))].sort();

    // Garder l'option "Tous" et ajouter les pays
    countryFilterSelect.innerHTML = '<option value="all">Tous</option>';

    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        countryFilterSelect.appendChild(option);
    });

    // Restaurer la sélection sauvegardée
    countryFilterSelect.value = currentCountryFilter;

    logger.debug(LOG_CATEGORIES.UI, 'Country filter populated', { countries: countries.length });
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
    currentSearch = '';
    idCible = propertyId;

    persistFilters();
    syncControls();

    // Retrouver sa position dans la liste triée pour ouvrir la bonne page
    const ordonnees = sortProperties(filterProperties(allProperties), currentSortBy);
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

    const filtrees = filterProperties(properties, currentFilter, currentWarningFilter, currentCountryFilter);
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
    renderPagination(triees.length, nbPages);
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
 * Nombre de pages affichées de part et d'autre de la page courante
 * Au-delà, un signe de troncature remplace la suite.
 */
const PAGES_VOISINES = 1;

/** En deçà, toutes les pages tiennent sans troncature */
const PAGES_SANS_TRONCATURE = 9;

/**
 * Choisit les pages à montrer, et où couper
 *
 * Vingt-quatre onglets alignés ne se lisent plus : la première, la dernière et
 * les voisines de la courante suffisent à situer où l'on est et à revenir aux
 * extrémités. Le reste se parcourt par « Précédent » et « Suivant ».
 *
 * @param {number} nbPages - Nombre total de pages
 * @param {number} courante - Page affichée
 * @returns {Array<number|null>} Numéros de page, null pour une coupure
 */
export function pagesAffichees(nbPages, courante) {
    if (nbPages <= PAGES_SANS_TRONCATURE) {
        return Array.from({ length: nbPages }, (_, i) => i + 1);
    }

    const retenues = new Set([1, nbPages]);

    for (let p = courante - PAGES_VOISINES; p <= courante + PAGES_VOISINES; p++) {
        if (p >= 1 && p <= nbPages) {
            retenues.add(p);
        }
    }

    const triees = [...retenues].sort((a, b) => a - b);
    const avecCoupures = [];

    triees.forEach((page, rang) => {
        // Une coupure ne vaut que pour au moins deux pages sautées : mise pour
        // une seule, elle occuperait la place de la page qu'elle cache.
        if (rang > 0 && page - triees[rang - 1] > 1) {
            avecCoupures.push(null);
        }
        avecCoupures.push(page);
    });

    return avecCoupures;
}

/**
 * Affiche la pagination
 *
 * Les onglets portent la PLAGE de fiches qu'ils ouvrent, non un numéro de page.
 * Le registre est trié — par investissement, par nom, par rendement — et « 3 »
 * ne dit alors rien de ce qu'on y trouvera, quand « 49–72 » situe d'emblée dans
 * l'ordre choisi. C'est aussi ce que l'indicateur disait déjà en toutes lettres.
 *
 * @param {number} total - Nombre de propriétés filtrées
 * @param {number} nbPages - Nombre de pages
 */
function renderPagination(total, nbPages) {
    const nav = document.getElementById('pagination');
    const onglets = document.getElementById('pageTabs');
    const precedent = document.getElementById('prevPage');
    const suivant = document.getElementById('nextPage');

    if (!nav || !onglets || !precedent || !suivant) {
        return;
    }

    // Une seule page, mais le choix de la taille doit rester atteignable :
    // sans lui, un registre réglé sur « Tout » n'aurait plus de quoi revenir.
    if (nbPages <= 1 && taillePage >= total) {
        nav.classList.toggle('hidden', total <= TAILLES_PAGE[0]);
        onglets.innerHTML = '';
        precedent.disabled = true;
        suivant.disabled = true;
        return;
    }

    nav.classList.remove('hidden');
    precedent.disabled = currentPage <= 1;
    suivant.disabled = currentPage >= nbPages;

    onglets.innerHTML = pagesAffichees(nbPages, currentPage).map(page => {
        if (page === null) {
            return '<span class="pagination-coupure" aria-hidden="true">…</span>';
        }

        const premier = (page - 1) * taillePage + 1;
        const dernier = Math.min(page * taillePage, total);
        const plage = premier === dernier ? `${premier}` : `${premier}–${dernier}`;
        const courante = page === currentPage;

        return `<button type="button" class="pagination-onglet" data-page="${page}"
            ${courante ? 'aria-current="page"' : ''}
            aria-label="Propriétés ${plage}">${plage}</button>`;
    }).join('');
}

/**
 * Change de page
 * @param {number} delta - -1 pour reculer, +1 pour avancer
 */
export function changePage(delta) {
    allerALaPage(currentPage + delta);
}

/**
 * Ouvre une page du registre
 * @param {number} page - Numéro de page, borné à l'affichage
 */
export function allerALaPage(page) {
    if (!Number.isFinite(page)) {
        return;
    }

    currentPage = page;
    idCible = null;
    updatePropertyList(allProperties);

    const liste = document.getElementById('propertiesList');
    if (liste) {
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
 * Vérifie qu'une propriété correspond à la recherche libre
 * @param {Object} property - Propriété
 * @param {string} terme - Terme recherché (déjà normalisé)
 * @returns {boolean}
 */
function matchesSearch(property, terme) {
    if (!terme) {
        return true;
    }

    const cible = `${property.name || ''} ${property.address || ''}`.toLowerCase();
    return cible.includes(terme);
}

/**
 * Filtre les propriétés selon le critère
 * @param {Array} properties - Propriétés à filtrer
 * @param {string} filterType - Type de filtre
 * @param {string} warningFilterType - Type de filtre de warning
 * @param {string} countryFilterType - Type de filtre de pays
 * @returns {Array} Propriétés filtrées
 */
function filterProperties(properties, filterType = currentFilter, warningFilterType = currentWarningFilter, countryFilterType = currentCountryFilter) {
    let filtered = properties;

    // Filtre par statut
    switch (filterType) {
        case 'active':
            filtered = filtered.filter(p => !p.isRefunded && p.projectStatus === 'financed');
            break;
        case 'refunded':
            filtered = filtered.filter(p => p.isRefunded);
            break;
        case 'ongoing':
            filtered = filtered.filter(p => p.projectStatus === 'ongoing');
            break;
        case 'upcoming':
            filtered = filtered.filter(p => p.projectStatus === 'upcoming');
            break;
    }

    // Filtre par warning
    switch (warningFilterType) {
        case 'warning-current-month':
            filtered = filtered.filter(p => hasWarningInCurrentMonth(p));
            break;
        case 'has-warning':
            filtered = filtered.filter(p => p.warningsCount > 0);
            break;
        case 'no-warning':
            filtered = filtered.filter(p => p.warningsCount === 0);
            break;
        case 'warning-last-month':
            filtered = filtered.filter(p => hasWarningInLastMonth(p));
            break;
        case 'warning-month-before':
            filtered = filtered.filter(p => hasWarningInMonthBefore(p));
            break;
        // Les remboursées sont écartées comme dans les tuiles d'incident : un
        // projet soldé ne porte plus de risque, et le raccourci « Voir » doit
        // montrer exactement les fiches derrière le chiffre annoncé.
        case 'risk-procedure':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.PROCEDURE);
            break;
        case 'risk-impaye':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.IMPAYE);
            break;
        case 'risk-signale':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.SIGNALE);
            break;
        case 'risk-sain':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.SAIN);
            break;
    }

    // Filtre par état de versement du mois de référence
    if (currentVersementFilter !== 'all') {
        filtered = filtered.filter(p => p.versement?.etat === currentVersementFilter);
    }

    // Filtre par pays
    if (countryFilterType !== 'all') {
        filtered = filtered.filter(p => p.country === countryFilterType);
    }

    // Recherche libre
    const terme = currentSearch.toLowerCase();
    if (terme) {
        filtered = filtered.filter(p => matchesSearch(p, terme));
    }

    return filtered;
}

/**
 * Trie les propriétés selon le critère
 * @param {Array} properties - Propriétés à trier
 * @param {string} sortBy - Critère de tri
 * @returns {Array} Propriétés triées
 */
function sortProperties(properties, sortBy) {
    const sorted = [...properties];

    switch (sortBy) {
        case 'investment-desc':
            return sorted.sort((a, b) => b.investment - a.investment);
        case 'investment-asc':
            return sorted.sort((a, b) => a.investment - b.investment);

        case 'bricks-desc':
            return sorted.sort((a, b) => b.ownedBricks - a.ownedBricks);
        case 'bricks-asc':
            return sorted.sort((a, b) => a.ownedBricks - b.ownedBricks);

        case 'return-desc':
            return sorted.sort((a, b) => b.yearlyReturn - a.yearlyReturn);
        case 'return-asc':
            return sorted.sort((a, b) => a.yearlyReturn - b.yearlyReturn);

        case 'revenue-desc':
            return sorted.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
        case 'revenue-asc':
            return sorted.sort((a, b) => a.monthlyRevenue - b.monthlyRevenue);

        case 'name-asc':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'name-desc':
            return sorted.sort((a, b) => b.name.localeCompare(a.name));

        case 'revenuestart-desc':
            return sorted.sort((a, b) => {
                if (!a.revenueStartDate) return 1;
                if (!b.revenueStartDate) return -1;
                return b.revenueStartDate.localeCompare(a.revenueStartDate);
            });
        case 'revenuestart-asc':
            return sorted.sort((a, b) => {
                if (!a.revenueStartDate) return 1;
                if (!b.revenueStartDate) return -1;
                return a.revenueStartDate.localeCompare(b.revenueStartDate);
            });

        default:
            return sorted;
    }
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
 * @param {string} [changements.versementFilter] - Nouveau filtre de versement
 */
export function updatePropertySortAndFilter({ sortBy, filter, warningFilter, countryFilter, versementFilter } = {}) {
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
