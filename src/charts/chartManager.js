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
 * Crée tous les graphiques avec les données fournies
 * @param {Object} results - Résultats des calculs de statistiques
 */
export function createCharts(results) {
    logger.info(LOG_CATEGORIES.CHART, 'Creating all charts');

    createInvestmentChart(results.investmentEvolution);
    createDistributionChart(results.properties);
    createRevenueChart(results.netRevenueEvolutionData);
    createTaxChart(results.taxAmountEvolutionData);
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
        treemap: null
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
