/**
 * Gestionnaire centralisé des graphiques Chart.js
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { createInvestmentChart } from './investmentChart.js';
import { createDistributionChart } from './distributionChart.js';
import { createRevenueChart } from './revenueChart.js';
import { createTaxChart } from './taxChart.js';
import { createTreemapChart } from './treemapChart.js';
import { createOrigineFondsChart } from './origineFondsChart.js';
import { createArrieresChart } from './arrieresChart.js';
import { filtrerPeriode, periodeCourante, bornerAuxDonnees } from '../ui/periodeGraphiques.js';
import { getCurrentMonthYYYYMM } from '../utils/dateHelpers.js';
import { couleur, surChangementDeTheme } from './theme.js';

// Derniers résultats reçus : changer de période redessine sans recalculer.
let derniersResultats = null;

/**
 * Aligne Chart.js sur le système visuel de l'application
 *
 * Sans cela les graphiques gardent la typographie et les gris par défaut de la
 * bibliothèque, étrangers au reste de la page. Réappliqué à chaque tracé plutôt
 * qu'une fois pour toutes : les couleurs viennent de la feuille de style, et
 * elles changent avec le thème.
 */
function applyChartTheme() {
    if (typeof Chart === 'undefined') {
        return;
    }

    Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = couleur('--ink-muted');
    Chart.defaults.borderColor = couleur('--rule');
    Chart.defaults.plugins.tooltip.backgroundColor = couleur('--graph-infobulle');
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;

    logger.debug(LOG_CATEGORIES.CHART, 'Chart.js theme applied');
}

/**
 * Redessine tout quand le thème du système bascule
 *
 * Les canevas déjà tracés gardent leurs couleurs : un basculement en clair
 * laisserait des courbes pâles sur fond blanc, et l'inverse en sombre.
 */
surChangementDeTheme(() => {
    if (derniersResultats) {
        createCharts(derniersResultats);
    }
});

/**
 * Crée tous les graphiques avec les données fournies
 * @param {Object} results - Résultats des calculs de statistiques
 */
export function createCharts(results) {
    logger.info(LOG_CATEGORIES.CHART, 'Creating all charts');

    applyChartTheme();

    derniersResultats = results;

    // Les bornes saisissables se calent sur l'historique disponible : proposer
    // un calendrier ouvert laisserait choisir des mois sans données.
    bornerAuxDonnees(moisCouverts(results));

    createDistributionChart(results.properties);
    createTreemapChart(results.properties);
    dessinerSeriesDatees(results);

    logger.info(LOG_CATEGORIES.CHART, 'All charts created successfully');
}

/**
 * Redessine les seuls graphiques datés, sur la période courante
 * Le donut et la treemap sont des états du portefeuille, sans axe temporel :
 * les redessiner à chaque changement de fenêtre ne ferait que clignoter.
 */
export function redessinerSeriesDatees() {
    if (derniersResultats) {
        dessinerSeriesDatees(derniersResultats);
    }
}

/**
 * Dessine les graphiques datés en appliquant la fenêtre choisie
 * @param {Object} results - Résultats des calculs
 */
function dessinerSeriesDatees(results) {
    // L'état de compte Bricks fait foi quand on l'a : la série estimée depuis
    // les taux affichés ne sert plus que de repli.
    const reels = results.revenusReels;
    const periode = periodeCourante();

    // Une référence commune à toutes les découpes : sans elle, « les six
    // derniers mois » ne désignent pas la même fenêtre d'une courbe à l'autre.
    const reference = moisCouverts(results);

    const revenus = filtrerPeriode(reels?.net || results.netRevenueEvolutionData, periode, reference);
    const impots = filtrerPeriode(reels?.impot || results.taxAmountEvolutionData, periode, reference);
    const investissement = filtrerPeriode(results.investmentEvolution, periode, reference);

    // Les trois séries de l'origine des fonds partagent la même fenêtre que le
    // reste : lire les versements sur six mois et les revenus sur vingt-quatre
    // ferait conclure n'importe quoi de leur rapport.
    const origine = results.origineFonds
        ? {
            apports: filtrerPeriode(results.origineFonds.apports, periode, reference),
            parrainage: filtrerPeriode(results.origineFonds.parrainage, periode, reference),
            boost: filtrerPeriode(results.origineFonds.boost, periode, reference)
        }
        : null;

    // Les trois séries d'arriérés se coupent ensemble, comme celles de
    // l'origine des fonds : lire les coupons manqués sur deux ans et les
    // pénalités sur six mois ferait conclure n'importe quoi de leur rapport.
    const arrieres = results.arrieres
        ? {
            ...results.arrieres,
            coupons: filtrerPeriode(results.arrieres.coupons, periode, reference),
            penalites: filtrerPeriode(results.arrieres.penalites, periode, reference),
            nets: filtrerPeriode(results.arrieres.nets, periode, reference)
        }
        : null;

    const optionsRevenus = {
        reel: Boolean(reels),
        moisPartiel: reels?.moisPartiel || null
    };

    createInvestmentChart(investissement, periode.preset === 'all');
    createRevenueChart(revenus, {
        ...optionsRevenus,
        attendu: reels?.attendu ? filtrerPeriode(reels.attendu, periode, reference) : null,
        ecart: reels?.ecart || null
    });
    createTaxChart(impots, optionsRevenus);
    createOrigineFondsChart(origine, {
        apportsConnus: Boolean(results.origineFonds?.apportsConnus)
    });
    createArrieresChart(arrieres);
}

/**
 * Liste les mois écoulés que couvrent les données datées
 *
 * Les mois à venir sont écartés de la référence : la série estimée se prolonge
 * de trois mois, et « les trois derniers mois » auraient alors désigné une
 * fenêtre entièrement future, où l'investissement n'a rien à montrer — le
 * graphique se serait vidé. Les points de projection restent tracés, ils
 * tombent simplement après la borne de début.
 *
 * @param {Object} results - Résultats des calculs
 * @returns {Array<string>} Mois triés, jusqu'au mois courant inclus
 */
function moisCouverts(results) {
    const mois = new Set([
        ...Object.keys(results.investmentEvolution || {}),
        ...Object.keys(results.revenusReels?.net || results.netRevenueEvolutionData || {})
    ]);

    const courant = getCurrentMonthYYYYMM();

    return [...mois].filter(m => /^\d{4}-\d{2}$/.test(m) && m <= courant).sort();
}

/**
 * Détruit tous les graphiques existants
 */
export function destroyAllCharts() {
    const charts = state.get('charts');

    if (!charts) {
        return;
    }

    logger.debug(LOG_CATEGORIES.CHART, 'Destroying all charts');

    Object.keys(charts).forEach(chartKey => {
        if (charts[chartKey] && typeof charts[chartKey].destroy === 'function') {
            try {
                charts[chartKey].destroy();
                charts[chartKey] = null;
            } catch (err) {
                logger.error(LOG_CATEGORIES.CHART, `Failed to destroy chart: ${chartKey}`, err);
            }
        }
    });

    // Mettre à jour l'état
    state.set('charts', {
        investment: null,
        distribution: null,
        revenueEvolution: null,
        taxAmount: null,
        origineFonds: null,
        arrieres: null,
        treemap: null,
        forecast: null
    });
}

/**
 * Redimensionne tous les charts (appelé lors du resize window)
 */
export function resizeAllCharts() {
    const charts = state.get('charts');

    if (!charts) {
        return;
    }

    Object.keys(charts).forEach(chartKey => {
        if (charts[chartKey] && typeof charts[chartKey].resize === 'function') {
            try {
                charts[chartKey].resize();
            } catch (err) {
                logger.error(LOG_CATEGORIES.CHART, `Failed to resize chart: ${chartKey}`, err);
            }
        }
    });

    logger.debug(LOG_CATEGORIES.CHART, 'All charts resized');
}
