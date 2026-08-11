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

/**
 * Aligne Chart.js sur le système visuel de l'application
 * Sans cela les graphiques gardent la typographie et les gris par défaut de la
 * bibliothèque, étrangers au reste de la page.
 */
function applyChartTheme() {
    if (typeof Chart === 'undefined' || Chart.defaults.__themeApplied) {
        return;
    }

    Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#5c6b77';
    Chart.defaults.borderColor = '#e4e9ed';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(22, 32, 43, 0.94)';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;

    Chart.defaults.__themeApplied = true;

    logger.debug(LOG_CATEGORIES.CHART, 'Chart.js theme applied');
}

/**
 * Crée tous les graphiques avec les données fournies
 * @param {Object} results - Résultats des calculs de statistiques
 */
export function createCharts(results) {
    logger.info(LOG_CATEGORIES.CHART, 'Creating all charts');

    applyChartTheme();

    // L'état de compte Bricks fait foi quand on l'a : la série estimée depuis
    // les taux affichés ne sert plus que de repli.
    const reels = results.revenusReels;
    const optionsRevenus = { reel: Boolean(reels), moisPartiel: reels?.moisPartiel || null };

    createInvestmentChart(results.investmentEvolution);
    createDistributionChart(results.properties);
    createRevenueChart(reels?.net || results.netRevenueEvolutionData, {
        ...optionsRevenus,
        attendu: reels?.attendu || null,
        ecart: reels?.ecart || null
    });
    createTaxChart(reels?.impot || results.taxAmountEvolutionData, optionsRevenus);
    createTreemapChart(results.properties);

    logger.info(LOG_CATEGORIES.CHART, 'All charts created successfully');
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
