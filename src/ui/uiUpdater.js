/**
 * Mise à jour de l'interface utilisateur
 *
 * Point d'entrée du rendu : reçoit les résultats du calcul et distribue aux
 * trois modules qui composent la page — les tuiles, le mur, le registre — puis
 * garde ce qui ne relève d'aucun d'eux : le bilan des versements du mois, la
 * bande de briques et les projections.
 *
 * Les commandes du registre sont réexportées ici pour que les gestionnaires
 * d'événements n'aient qu'un module à connaître.
 */

import { formatCurrency, formatNumber, formatMonthName, formatPercentage } from '../utils/formatters.js';
import { getCurrentMonthYYYYMM, addMonthsToYYYYMM } from '../utils/dateHelpers.js';
import { escapeHtml } from '../utils/html.js';
import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { TAILLES_PAGE } from '../core/preferences.js';
import { pluriel, deMois } from './libelles.js';
import { hasWarningInLastMonth } from './alertes.js';
import { afficherRevenusParAnnee } from './revenuAnnuel.js';
import { updateStatCards } from './tuiles.js';
import { initGeographie } from './geographie.js';
import {
    initRegistre, focusProperty, resetFilters, setSearch, changePage,
    allerALaPage, setTaillePage, taillePageCourante, updatePropertySortAndFilter,
    pagesAffichees
} from './registre.js';

// Façade : les gestionnaires d'événements et les tests n'ont qu'un module à
// connaître pour piloter le rendu, quel que soit celui qui l'exécute.
export {
    TAILLES_PAGE, focusProperty, resetFilters, setSearch, changePage,
    allerALaPage, setTaillePage, taillePageCourante, updatePropertySortAndFilter,
    pagesAffichees
};

/**
 * Met à jour toute l'interface avec les résultats calculés
 * @param {Object} results - Résultats des calculs
 */
export function updateUI(results) {
    logger.info(LOG_CATEGORIES.UI, 'Updating UI with results');

    updateStatCards(results);

    // Le registre garde l'état de la liste : le lui confier ici lui évite de
    // relire les résultats à chaque changement de filtre. Il passe avant le
    // bilan, qui ne fait qu'afficher ce que le registre vient de trancher.
    initRegistre(results.properties, results.versements);

    renderBilanVersements(results.versements);

    // La section reste repliée : elle ne se dessine qu'au premier dépliage, un
    // tableau d'une centaine de communes n'ayant pas à se recomposer à chaque
    // rendu pour rester caché.
    initGeographie(results.properties);

    renderMur(results.properties);
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
            data-risque="${escapeHtml(p.niveauRisque || '')}"
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
        // Pas de « (est.) » sur la première case : les cinq sont des
        // projections, et ne le marquer que sur une laissait croire que les
        // autres étaient acquises.
        const label = i === 0 ? 'Ce mois-ci' : formatMonthName(monthKey);

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
        // La série s'arrête au dernier mois qui change de montant : la note dit
        // pourquoi elle s'arrête là, sans renommer un mois déjà écrit sur la
        // dernière tuile.
        note.textContent = 'Versés autour du 8 du mois. Le montant ne bouge plus ensuite :'
            + ' aucun autre projet ne commence à verser.';
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
