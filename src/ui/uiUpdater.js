/**
 * Mise à jour de l'interface utilisateur
 */

import { formatCurrency, formatNumber, truncate, formatMonthName, formatPercentage } from '../utils/formatters.js';
import { afficherRevenusParAnnee } from './revenuAnnuel.js';
import { getCurrentMonthYYYYMM, addMonthsToYYYYMM, subtractMonths } from '../utils/dateHelpers.js';
import { escapeHtml, safeUrl, stripTags } from '../utils/html.js';
import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { NIVEAUX_RISQUE } from '../business/riskAnalysis.js';
import { ETATS, carnetVersements } from '../business/versements.js';

// Nombre de fiches par page : 241 fiches d'un bloc donnaient une page de 80 000 px
const TAILLE_PAGE = 24;

// Stocker les propriétés pour le tri/filtrage
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
        'risk-procedure': 'En défaut, échéances dues', 'risk-impaye': 'Impayé ou retard',
        'risk-signale': 'Signalé, sans incident', 'risk-sain': 'Sans signalement',
        'warning-last-month': 'Alerte sous 30 jours', 'warning-month-before': 'Alerte le mois d\'avant'
    },
    versementFilter: {
        verse: 'Versé', manquant: 'Rien reçu', attendu: 'Pas encore dû'
    }
};

/**
 * Libellé de la pastille d'état de versement portée par chaque fiche
 */
const LIBELLES_VERSEMENT = {
    [ETATS.VERSE]: 'Versé',
    [ETATS.MANQUANT]: 'Rien reçu',
    [ETATS.ATTENDU]: 'Pas encore',
    [ETATS.SOLDE]: 'Soldé'
};

/**
 * Met à jour toute l'interface avec les résultats calculés
 * @param {Object} results - Résultats des calculs
 */
export function updateUI(results) {
    logger.info(LOG_CATEGORIES.UI, 'Updating UI with results');

    updateStatCards(results);

    // Stocker les propriétés globalement pour le tri/filtrage
    allProperties = results.properties;

    // Charger les préférences de tri/filtrage
    currentSortBy = localStorage.getItem('propertySortBy') || 'investment-desc';
    currentFilter = localStorage.getItem('propertyFilter') || 'all';
    currentWarningFilter = localStorage.getItem('propertyWarningFilter') || 'all';
    currentCountryFilter = localStorage.getItem('propertyCountryFilter') || 'all';
    currentVersementFilter = localStorage.getItem('propertyVersementFilter') || 'all';
    currentPage = 1;

    versementsParPropriete = results.versements?.parPropriete || null;
    moisVersements = results.versements?.moisReference || null;
    renderBilanVersements(results.versements);

    // Remplir le dropdown des pays disponibles
    populateCountryFilter(allProperties);

    renderMur(allProperties);
    updatePropertyList(allProperties);
    afficherRevenusParAnnee(results);
    updateProjections(results.netRevenueEvolutionData);

    logger.info(LOG_CATEGORIES.UI, 'UI updated successfully');
}

/**
 * Affiche le bilan des versements du mois et ouvre le filtre correspondant
 *
 * Tout reste caché sans état de compte : sans lui, aucune fiche ne porte de
 * pastille, et un filtre qui ne trierait rien n'aurait pas de sens.
 *
 * @param {Object|null} versements - { moisReference, comptes } issus du calcul
 */
function renderBilanVersements(versements) {
    const bilan = document.getElementById('versementsBilan');
    const compte = document.getElementById('versementsCompte');
    const filtre = document.getElementById('versementFilterLabel');

    const disponible = Boolean(versements?.moisReference);

    bilan?.classList.toggle('hidden', !disponible);
    filtre?.classList.toggle('hidden', !disponible);

    if (!disponible) {
        // Le filtre mémorisé survivrait à la disparition du relevé et viderait
        // le registre sans laisser de quoi le rouvrir, puisque le menu est caché.
        if (currentVersementFilter !== 'all') {
            currentVersementFilter = 'all';
            localStorage.setItem('propertyVersementFilter', 'all');
        }
        return;
    }

    if (!compte) {
        return;
    }

    const { verse, manquant, attendu } = versements.comptes;

    compte.innerHTML = `
        <span class="versements-mois">Versements ${escapeHtml(deMois(versements.moisReference))}</span>
        <span class="versements-part est-verse">${formatNumber(verse)} versée${pluriel(verse)}</span>
        <span class="versements-part est-manquant">${formatNumber(manquant)} sans versement</span>
        <span class="versements-part est-attendu">${formatNumber(attendu)} pas encore due${pluriel(attendu)}</span>
    `;
}

/**
 * Marque du pluriel : en français, zéro et un restent au singulier
 * @param {number} nombre - Quantité décrite
 * @returns {string} « s » au-delà de un, chaîne vide sinon
 */
function pluriel(nombre) {
    return nombre > 1 ? 's' : '';
}

/**
 * Écrit un mois en incise, sans la majuscule de début de phrase
 * @param {string} mois - Mois au format YYYY-MM
 * @returns {string} Par exemple « août 2026 »
 */
function moisEnIncise(mois) {
    const nom = formatMonthName(mois);
    return `${nom.charAt(0).toLowerCase()}${nom.slice(1)}`;
}

/**
 * Introduit un mois par « de », élidé devant avril, août et octobre
 * @param {string} mois - Mois au format YYYY-MM
 * @returns {string} Par exemple « d'août 2026 » ou « de juillet 2026 »
 */
function deMois(mois) {
    const nom = moisEnIncise(mois);
    return /^[aeiouâéèêîôûy]/.test(nom) ? `d'${nom}` : `de ${nom}`;
}

/**
 * Dessine « le mur » : une brique par propriété, largeur ∝ investissement
 * Les projets remboursés valent 0 € et n'ont donc pas de largeur : le mur
 * représente le portefeuille tel qu'il est engagé aujourd'hui.
 * @param {Array} properties - Liste des propriétés
 */
function renderMur(properties) {
    const strip = document.getElementById('murStrip');
    const totalLabel = document.getElementById('murTotal');

    if (!strip) {
        return;
    }

    const engagees = properties
        .filter(p => p.investment > 0)
        .sort((a, b) => b.investment - a.investment);

    const total = engagees.reduce((somme, p) => somme + p.investment, 0);

    strip.innerHTML = engagees.map(p => {
        const aAlerte = hasWarningInLastMonth(p);
        const part = total > 0 ? (p.investment / total) * 100 : 0;
        const statut = p.isRefunded ? 'refunded' : (p.projectStatus || 'financed');
        const titre = `${p.name} — ${formatCurrency(p.investment, 0)} (${formatPercentage(part)})`;

        return `<button type="button" class="brique" role="listitem"
            data-property-id="${escapeHtml(p.id)}"
            data-statut="${escapeHtml(statut)}"
            data-alerte="${aAlerte}"
            style="flex-grow:${p.investment}"
            title="${escapeHtml(titre)}"
            aria-label="${escapeHtml(titre)}"></button>`;
    }).join('');

    if (totalLabel) {
        totalLabel.textContent = `${engagees.length} propriétés engagées · ${formatCurrency(total, 0)}`;
    }

    attachMurListener(strip);

    logger.debug(LOG_CATEGORIES.UI, 'Mur rendered', { briques: engagees.length });
}

/**
 * Installe (une seule fois) le listener de navigation du mur
 * @param {HTMLElement} strip - Conteneur des briques
 */
function attachMurListener(strip) {
    if (strip.dataset.listenerAttached === 'true') {
        return;
    }

    strip.addEventListener('click', (event) => {
        const brique = event.target.closest('[data-property-id]');
        if (brique) {
            focusProperty(brique.dataset.propertyId);
        }
    });

    strip.dataset.listenerAttached = 'true';
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
    currentPage = position >= 0 ? Math.floor(position / TAILLE_PAGE) + 1 : 1;

    updatePropertyList(allProperties);

    const carte = document.querySelector(`[data-property-id="${CSS.escape(propertyId)}"].property-card`);
    if (carte) {
        carte.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    logger.debug(LOG_CATEGORIES.UI, 'Property focused from mur', { propertyId, page: currentPage });
}

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
 * Met à jour les cartes de statistiques
 * @param {Object} results - Résultats des calculs
 */
function updateStatCards(results) {
    document.getElementById('totalBricks').textContent = formatNumber(results.totalBricks);
    document.getElementById('totalInvestment').textContent = formatCurrency(results.totalInvestment, 0);
    document.getElementById('monthlyRevenue').textContent = formatCurrency(results.monthlyRevenue);
    document.getElementById('totalProperties').textContent = formatNumber(results.activePropertiesCount || 0);
    document.getElementById('totalNetRevenueSinceBeginning').textContent = formatCurrency(results.totalNetRevenueSinceBeginning);
    document.getElementById('totalTaxesSinceBeginning').textContent = formatCurrency(results.totalTaxesSinceBeginning);
    document.getElementById('refundedProjectsCountValue').textContent = formatNumber(results.refundedProjectsCount || 0);
    document.getElementById('fundingProjectsCountValue').textContent = formatNumber(results.fundingOrUpcomingProjectsCount || 0);

    majDetailRevenus(results);
    updateRiskCards(results);

    logger.debug(LOG_CATEGORIES.UI, 'Stat cards updated');
}

/**
 * Confronte les revenus attendus au dernier mois réellement encaissé
 *
 * La tuile affiche une espérance : chaque projet détenu est censé verser son
 * coupon. Les échéances impayées font que le versement réel s'en écarte, et
 * c'est précisément cet écart qu'on veut voir sans avoir à ouvrir Bricks. Le
 * mois courant est écarté tant qu'il n'est pas terminé.
 *
 * @param {Object} results - Résultats des calculs
 */
function majDetailRevenus(results) {
    const reels = results.revenusReels;

    if (!reels?.mensuel) {
        setDetail('detailRevenusMensuels', 'Estimation : les impayés y sont comptés comme versés.');
        return;
    }

    const complets = Object.keys(reels.mensuel)
        .sort()
        .filter(mois => mois !== reels.moisPartiel);

    const dernier = complets[complets.length - 1];

    if (!dernier) {
        setDetail('detailRevenusMensuels', 'Aucun mois complet encaissé pour le moment.');
        return;
    }

    const percu = reels.mensuel[dernier].net;
    setDetail('detailRevenusMensuels', `Perçu en ${formatMonthName(dernier)} : ${formatCurrency(percu)}`);
}

/**
 * Écrit un texte de détail sous une tuile, si la tuile existe
 * @param {string} id - Identifiant de l'élément de détail
 * @param {string} texte - Texte à afficher
 */
function setDetail(id, texte) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = texte;
    }
}

/**
 * Renseigne les pourcentages et les tuiles d'incident
 * Les parts se rapportent aux propriétés encore détenues : un projet remboursé
 * ne fait plus partie du portefeuille.
 * @param {Object} results - Résultats des calculs
 */
function updateRiskCards(results) {
    const detenues = results.detenuesCount ?? 0;
    const total = (results.properties || []).length;

    setDetail('detailDetenues', total > 0
        ? `${formatPercentage(results.partDetenues ?? 0, 0)} des ${formatNumber(total)} suivies`
        : '');
    setDetail('detailRembourses', total > 0
        ? `${formatPercentage(results.partRemboursees ?? 0, 0)} des ${formatNumber(total)} suivies`
        : '');
    setDetail('detailFinancement', detenues > 0
        ? `${formatPercentage(results.partFinancement ?? 0)} des détenues`
        : '');

    const risque = results.risque;
    if (!risque) {
        return;
    }

    const ecrire = (id, valeur) => {
        const element = document.getElementById(id);
        if (element) element.textContent = valeur;
    };

    // Les quatre niveaux forment une partition : afficher trois d'entre eux
    // donnait des chiffres qui semblaient devoir s'additionner sans y arriver.
    const niveaux = [
        [NIVEAUX_RISQUE.PROCEDURE, 'procedureCount', 'detailProcedure'],
        [NIVEAUX_RISQUE.IMPAYE, 'impayeCount', 'detailImpaye'],
        [NIVEAUX_RISQUE.SIGNALE, 'signaleCount', 'detailSignale'],
        [NIVEAUX_RISQUE.SAIN, 'sainCount', 'detailSain']
    ];

    niveaux.forEach(([niveau, idValeur, idDetail]) => {
        const entree = risque.repartition[niveau];
        ecrire(idValeur, formatNumber(entree.nombre));
        setDetail(idDetail, `${formatPercentage(entree.part)} · ${formatCurrency(entree.capital, 0)}`);
    });

    const resume = document.getElementById('risqueResume');
    if (resume) {
        const regularises = risque.defautsRegularises
            ? ` · ${formatNumber(risque.defautsRegularises)} défauts passés, aujourd'hui régularisés`
            : '';

        resume.textContent = risque.enDifficulte.nombre > 0
            ? `${formatCurrency(risque.enDifficulte.capital, 0)} exposés, soit ${formatPercentage(risque.enDifficulte.partCapital)} du capital détenu${regularises}`
            : `Aucune échéance due aujourd'hui${regularises}`;
    }

    // Le total est rappelé pour que la somme des tuiles soit vérifiable d'un coup d'œil
    const note = document.getElementById('risqueNote');
    if (note) {
        const source = risque.statutsConnus > 0
            ? `d'après le suivi officiel de ${formatNumber(risque.statutsConnus)} projets`
            : `d'après le texte des alertes`;

        note.textContent = `Répartition des ${formatNumber(detenues)} propriétés détenues, ${source} :`
            + ` chaque propriété compte dans une seule case, et les quatre totalisent ${formatNumber(detenues)}.`
            + (risque.statutsConnus > 0
                ? ''
                : ` Cette lecture n'est qu'une approximation : cliquez sur « Vérifier les statuts » pour interroger la source qui fait foi.`);
    }
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
    const nbPages = Math.max(1, Math.ceil(triees.length / TAILLE_PAGE));
    currentPage = Math.min(Math.max(1, currentPage), nbPages);

    const debut = (currentPage - 1) * TAILLE_PAGE;
    const page = triees.slice(debut, debut + TAILLE_PAGE);

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
        container.innerHTML = page.map(property => createPropertyCard(property)).join('');
    }

    attachPropertyCardListener(container);
    renderFiltresActifs();
    renderPagination(triees.length, nbPages, debut, page.length);
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
    localStorage.setItem('propertyFilter', currentFilter);
    localStorage.setItem('propertyWarningFilter', currentWarningFilter);
    localStorage.setItem('propertyCountryFilter', currentCountryFilter);
    localStorage.setItem('propertyVersementFilter', currentVersementFilter);
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
 * Affiche la pagination
 * @param {number} total - Nombre de propriétés filtrées
 * @param {number} nbPages - Nombre de pages
 * @param {number} debut - Index de départ de la page courante
 * @param {number} affichees - Nombre de fiches sur la page
 */
function renderPagination(total, nbPages, debut, affichees) {
    const nav = document.getElementById('pagination');
    const indicateur = document.getElementById('pageIndicator');
    const precedent = document.getElementById('prevPage');
    const suivant = document.getElementById('nextPage');

    if (!nav || !indicateur || !precedent || !suivant) {
        return;
    }

    if (total <= TAILLE_PAGE) {
        nav.classList.add('hidden');
        return;
    }

    nav.classList.remove('hidden');
    indicateur.textContent = `${debut + 1}–${debut + affichees} sur ${total}`;
    precedent.disabled = currentPage <= 1;
    suivant.disabled = currentPage >= nbPages;
}

/**
 * Change de page
 * @param {number} delta - -1 pour reculer, +1 pour avancer
 */
export function changePage(delta) {
    currentPage += delta;
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

    container.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="reinitialiser"]')) {
            resetFilters();
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
 * Vérifie si une propriété a une alerte datée du mois calendaire en cours
 *
 * À distinguer de hasWarningInLastMonth, qui regarde 30 jours glissants : le
 * 2 du mois, une alerte du 25 précédent entre dans les 30 jours mais pas dans
 * le mois courant. C'est bien « ce mois-ci » qui est demandé ici.
 *
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
function hasWarningInCurrentMonth(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const moisCourant = getCurrentMonthYYYYMM();

    return property.warnings.some(w => {
        const date = new Date(w.date);
        if (Number.isNaN(date.getTime())) return false;

        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return mois === moisCourant;
    });
}

/**
 * Vérifie si une propriété a un warning dans le dernier mois
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
function hasWarningInLastMonth(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const oneMonthAgo = subtractMonths(new Date(), 1);

    return property.warnings.some(w => {
        const warningDate = new Date(w.date);
        return warningDate >= oneMonthAgo;
    });
}

/**
 * Vérifie si une propriété a un warning entre -2 mois et -1 mois
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
function hasWarningInMonthBefore(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const now = new Date();
    const twoMonthsAgo = subtractMonths(now, 2);
    const oneMonthAgo = subtractMonths(now, 1);

    return property.warnings.some(w => {
        const warningDate = new Date(w.date);
        return warningDate >= twoMonthsAgo && warningDate < oneMonthAgo;
    });
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
        localStorage.setItem('propertySortBy', sortBy);
    }

    if (filter !== undefined) {
        currentFilter = filter;
        localStorage.setItem('propertyFilter', filter);
    }

    if (warningFilter !== undefined) {
        currentWarningFilter = warningFilter;
        localStorage.setItem('propertyWarningFilter', warningFilter);
    }

    if (countryFilter !== undefined) {
        currentCountryFilter = countryFilter;
        localStorage.setItem('propertyCountryFilter', countryFilter);
    }

    if (versementFilter !== undefined) {
        currentVersementFilter = versementFilter;
        localStorage.setItem('propertyVersementFilter', versementFilter);
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

/**
 * Construit le bandeau du suivi officiel d'une propriété
 *
 * Échéances dues, pénalités, contentieux : ce que le texte des alertes ne dit
 * pas toujours. Absent tant que les statuts n'ont pas été récupérés.
 *
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML du bandeau, vide s'il n'y a rien à signaler
 */
function createSuiviSection(property) {
    const suivi = property.suivi;

    if (!suivi || !suivi.suivi) {
        return '';
    }

    const faits = [];

    if (suivi.contentieux) {
        faits.push('contentieux ouvert');
    }

    if (suivi.impayees > 0) {
        faits.push(`${suivi.impayees} échéance${suivi.impayees > 1 ? 's' : ''} due${suivi.impayees > 1 ? 's' : ''}`);
    }

    if (suivi.penalites > 0) {
        faits.push(`${formatCurrency(suivi.penalites, 0)} de pénalités`);
    }

    if (faits.length === 0) {
        // Un dossier existe mais plus rien n'est dû : le dire évite de laisser
        // croire à un incident en cours.
        faits.push('incident passé, plus rien de dû');
    }

    const grave = suivi.contentieux || suivi.impayees > 0;
    // formatMonthName capitalise le mois : en incise, il se lit en minuscule
    const mois = suivi.derniereEcheanceImpayee
        ? formatMonthName(String(suivi.derniereEcheanceImpayee).slice(0, 7))
        : '';
    const depuis = mois
        ? ` · dernière échéance due en ${mois.charAt(0).toLowerCase()}${mois.slice(1)}`
        : '';

    return `
        <div class="suivi-officiel${grave ? ' est-grave' : ''}">
            ${escapeHtml(faits.join(' · '))}${escapeHtml(depuis)}
        </div>
    `;
}

/**
 * Construit le bloc des actualités officielles d'une propriété
 *
 * Le flux du projet est bien plus circonstancié que les alertes du
 * portefeuille : il détaille démarches, retards et relances.
 *
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML des actualités, vide s'il n'y en a pas
 */
function createActualitesSection(property) {
    const actualites = property.suivi?.actualites;

    if (!Array.isArray(actualites) || actualites.length === 0) {
        return '';
    }

    const liste = actualites.map(a => {
        const date = a.date ? new Date(a.date) : null;
        const dateLisible = date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Date inconnue';

        return `
            <div class="actualite-item">
                <div class="alerte-date">${escapeHtml(dateLisible)}</div>
                <div class="alerte-texte">${escapeHtml(a.texte)}${a.tronquee ? '…' : ''}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="alertes">
            <div class="actualites-entete">
                ${actualites.length} actualité${actualites.length > 1 ? 's' : ''} du projet
            </div>
            <div class="alertes-liste">${liste}</div>
        </div>
    `;
}

/**
 * Construit le bloc des alertes d'une propriété
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML des alertes, vide s'il n'y en a pas
 */
function createAlertesSection(property) {
    if (!property.warningsCount || property.warningsCount === 0) {
        return '';
    }

    const recente = hasWarningInLastMonth(property);
    const classeAge = recente ? '' : ' est-ancienne';
    const nombre = property.warningsCount;
    const pluriel = nombre > 1 ? 's' : '';
    const mention = recente ? `récente${pluriel}` : `ancienne${pluriel}`;

    const liste = property.warnings.map(w => {
        const date = new Date(w.date);
        const dateLisible = Number.isNaN(date.getTime())
            ? 'Date inconnue'
            : date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

        const texte = stripTags(w.description).substring(0, 150);
        const suite = texte.length >= 150 ? '…' : '';

        return `
            <div class="alerte-item${classeAge}">
                <div class="alerte-date">${escapeHtml(dateLisible)}</div>
                <div class="alerte-texte">${escapeHtml(texte)}${suite}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="alertes">
            <div class="alertes-entete${classeAge}">
                <span aria-hidden="true">▲</span>
                ${nombre} alerte${pluriel} ${mention}
            </div>
            <div class="alertes-liste">${liste}</div>
        </div>
    `;
}

/**
 * Construit le carnet de versements d'une propriété
 *
 * Une pastille dit l'état du mois, un carnet dit le rythme. Les deux ensemble :
 * douze mois pleins suivis d'un blanc ne se lisent pas comme un silence d'un an,
 * et c'est cette différence qui rend un « rien reçu » exploitable.
 *
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML du bloc, vide sans état de compte
 */
function createVersementSection(property) {
    const versement = property.versement;

    if (!versement || versement.etat === ETATS.INCONNU || !moisVersements) {
        return '';
    }

    const libelle = LIBELLES_VERSEMENT[versement.etat] || '';
    const montant = versement.etat === ETATS.VERSE
        ? `<span class="versement-montant">${formatCurrency(versement.montant)}</span>`
        : '';

    const carnet = carnetVersements(property, versementsParPropriete, moisVersements);
    const verses = carnet.filter(c => c.etat === ETATS.VERSE).length;
    const sans = carnet.filter(c => c.etat === ETATS.MANQUANT).length;

    const marques = carnet.map(c => `<span class="carnet-mois est-${c.etat}"
            title="${escapeHtml(titreMoisCarnet(c))}"></span>`).join('');

    const resume = `${carnet.length} derniers mois : ${verses} versement${pluriel(verses)}`
        + (sans > 0 ? `, ${sans} mois sans versement` : '');

    return `
        <div class="versement-bloc">
            <div class="versement-ligne">
                <span class="versement-pastille est-${versement.etat}">${escapeHtml(libelle)}</span>
                ${montant}
                <span class="carnet" role="img" aria-label="${escapeHtml(resume)}">${marques}</span>
            </div>
            ${legendeVersement(versement)}
        </div>
    `;
}

/**
 * Rédige l'infobulle d'un mois du carnet
 * @param {Object} case_ - Case du carnet { mois, etat, montant }
 * @returns {string} Texte de l'infobulle
 */
function titreMoisCarnet({ mois, etat, montant }) {
    const nom = formatMonthName(mois);

    if (etat === ETATS.VERSE) {
        return `${nom} : ${formatCurrency(montant)}`;
    }

    return etat === ETATS.MANQUANT
        ? `${nom} : rien reçu`
        : `${nom} : aucun versement attendu`;
}

/**
 * Précise ce que la pastille laisse ouvert
 * @param {Object} versement - État de versement de la propriété
 * @returns {string} HTML de la légende, vide quand la pastille se suffit
 */
function legendeVersement(versement) {
    let texte = '';

    if (versement.etat === ETATS.MANQUANT) {
        texte = versement.dernierMois
            ? `Dernier versement en ${moisEnIncise(versement.dernierMois)}`
            : 'Aucun versement à ce jour';
    }

    if (versement.etat === ETATS.ATTENDU) {
        if (versement.motif === 'financement') {
            texte = 'Projet encore en financement';
        } else if (versement.motif === 'inconnu') {
            texte = 'Aucune date de versement annoncée';
        } else {
            texte = `Premier versement annoncé en ${moisEnIncise(versement.debut)}`;
        }
    }

    return texte ? `<p class="versement-legende">${escapeHtml(texte)}</p>` : '';
}

/**
 * Crée le HTML pour une carte de propriété
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML de la carte
 */
function createPropertyCard(property) {
    const thumbnailUrl = safeUrl(property.thumbnailUrl);
    const imageHtml = thumbnailUrl
        ? `<img src="${escapeHtml(thumbnailUrl)}" alt="" class="property-thumbnail" loading="lazy" decoding="async">`
        : '';

    let cardClasses = 'property-card';
    if (property.niveauRisque === NIVEAUX_RISQUE.PROCEDURE) cardClasses += ' property-en-defaut';
    if (property.isRefunded) cardClasses += ' property-refunded';
    if (property.projectStatus === 'ongoing') cardClasses += ' property-ongoing';
    if (property.projectStatus === 'upcoming') cardClasses += ' property-upcoming';

    let statusBadge = '';
    if (property.isRefunded) {
        statusBadge = '<span class="badge-statut">Remboursé</span>';
    } else if (property.projectStatus === 'ongoing') {
        statusBadge = '<span class="badge-statut">En financement</span>';
    } else if (property.projectStatus === 'upcoming') {
        statusBadge = '<span class="badge-statut">À venir</span>';
    }

    // Formatage des dates
    const revenueStartDisplay = property.revenueStartDate
        ? formatMonthName(property.revenueStartDate)
        : 'N/D';
    const refundDateDisplay = property.refundDate
        ? `${formatMonthName(property.refundDate)} (est.)`
        : (property.isRefunded ? 'Remboursé' : 'N/D');

    // URL du projet sur Bricks.co
    const projectUrl = `https://app.bricks.co/project/${encodeURIComponent(property.id)}`;

    return `
        <div class="${cardClasses}" role="link" tabindex="0"
             data-project-url="${escapeHtml(projectUrl)}"
             data-property-id="${escapeHtml(property.id)}">
            ${imageHtml}
            <div class="property-name" title="${escapeHtml(property.name)}">${escapeHtml(property.name)}${statusBadge}</div>
            <div class="property-adresse" title="${escapeHtml(property.address)}">${escapeHtml(property.address)}</div>
            <dl class="property-details">
                <div class="paire">
                    <dt>Investissement</dt>
                    <dd>${formatCurrency(property.investment)}</dd>
                </div>
                <div class="paire">
                    <dt>Rendement annuel</dt>
                    <dd class="rendement">${formatPercentage(property.yearlyReturn)}</dd>
                </div>
                <div class="paire">
                    <dt>Briques</dt>
                    <dd>${formatNumber(property.ownedBricks)}</dd>
                </div>
                <div class="paire">
                    <dt>Revenus nets / mois</dt>
                    <dd>${formatCurrency(property.monthlyRevenue)}</dd>
                </div>
                <div class="paire">
                    <dt>Premier versement</dt>
                    <dd>${escapeHtml(revenueStartDisplay)}</dd>
                </div>
                <div class="paire">
                    <dt>Remboursement</dt>
                    <dd>${escapeHtml(refundDateDisplay)}</dd>
                </div>
            </dl>
            ${createVersementSection(property)}
            ${createSuiviSection(property)}
            ${createActualitesSection(property) || createAlertesSection(property)}
        </div>
    `;
}

/**
 * Met à jour les projections de revenus
 * @param {Object} netRevenueData - Données de revenus nets
 */
function updateProjections(netRevenueData) {
    const container = document.getElementById('projectedRevenuesDisplay');

    if (!container) {
        logger.warn(LOG_CATEGORIES.UI, 'Projections container not found');
        return;
    }

    const currentMonth = getCurrentMonthYYYYMM();
    const revenueData = netRevenueData || {};
    const cards = [];

    // Les mois suivants ne bougent que si un projet commence à verser. Répéter
    // le même montant sur M+2 et M+3 n'apprend rien : on ne montre les mois que
    // jusqu'au dernier changement, et on dit à partir de quand c'est stable.
    let dernierChangement = 0;
    let precedent = revenueData[currentMonth];

    for (let i = 1; i < CONFIG.PROJECTIONS_MONTHS; i++) {
        const valeur = revenueData[addMonthsToYYYYMM(currentMonth, i)];

        // Une donnée absente n'est pas une variation : la série s'arrête là
        if (typeof valeur !== 'number') {
            break;
        }

        if (valeur !== precedent) {
            dernierChangement = i;
        }
        precedent = valeur;
    }

    for (let i = 0; i <= dernierChangement; i++) {
        const monthKey = addMonthsToYYYYMM(currentMonth, i);
        const value = revenueData[monthKey];
        const revenueDisplay = typeof value === 'number' ? formatCurrency(value) : 'N/D';
        const label = i === 0 ? 'Ce Mois-ci (est.)' : formatMonthName(monthKey);

        cards.push(`
            <div class="stat-card">
                <div class="stat-value">${revenueDisplay}</div>
                <div class="stat-label">${escapeHtml(label)}</div>
            </div>
        `);
    }

    container.innerHTML = cards.join('');

    const note = document.getElementById('projectionsNote');
    if (note) {
        const moisStable = addMonthsToYYYYMM(currentMonth, dernierChangement);
        note.textContent = dernierChangement === 0
            ? 'Versés autour du 8 du mois. Aucun nouveau projet ne commence à verser dans les mois à venir : le montant reste stable.'
            : `Versés autour du 8 du mois. Stable à partir de ${formatMonthName(moisStable)}, aucun autre projet ne commence à verser ensuite.`;
    }

    logger.debug(LOG_CATEGORIES.UI, 'Projections updated', { moisAffiches: cards.length });
}

/**
 * Affiche la section des résultats
 */
export function showResults() {
    const resultsSection = document.getElementById('results');
    if (resultsSection) {
        resultsSection.classList.remove('hidden');
    }

    // Une fois les données à l'écran, le panneau de saisie se replie
    const upload = document.getElementById('uploadSection');
    if (upload) {
        upload.classList.add('est-repliee');
    }
}

/**
 * Cache la section des résultats
 */
export function hideResults() {
    const resultsSection = document.getElementById('results');
    if (resultsSection) {
        resultsSection.classList.add('hidden');
    }
}
