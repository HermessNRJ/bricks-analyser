/**
 * Graphique de la simulation : capital et revenus nets cumulés
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatters.js';
import { couleur } from './theme.js';

/**
 * Réduit la série mensuelle à un nombre de points lisible
 * Sur 50 ans, 600 points écrasent la courbe sans rien apprendre.
 * @param {Array} serie - Série mensuelle de la simulation
 * @param {number} [maxPoints] - Nombre de points visé
 * @returns {Array} Série échantillonnée, dernier point toujours conservé
 */
export function echantillonner(serie, maxPoints = 60) {
    if (!Array.isArray(serie) || serie.length <= maxPoints) {
        return serie || [];
    }

    // Un pas qui divise 12 fait tomber les points sur les bornes d'année :
    // sans cela l'axe n'affiche « 5 ans » qu'au tout dernier point.
    const pasBrut = Math.ceil(serie.length / maxPoints);
    const pas = [1, 2, 3, 4, 6, 12, 24, 60].find(candidat => candidat >= pasBrut) || pasBrut;

    const reduite = serie.filter(point => point.mois % pas === 0);

    // Le dernier mois porte le résultat : il ne doit jamais sauter
    if (reduite[reduite.length - 1] !== serie[serie.length - 1]) {
        reduite.push(serie[serie.length - 1]);
    }

    return reduite;
}

/**
 * Met en forme un numéro de mois en libellé d'axe
 * Au-delà de deux ans, l'axe se lit en années : un repère tous les douze mois
 * suffit, les mois intermédiaires ne feraient qu'encombrer.
 * @param {number} mois - Rang du mois depuis le début de la simulation
 * @param {number} horizonMois - Durée totale simulée
 * @returns {string} Libellé court, vide pour les mois sans repère
 */
export function libelleMois(mois, horizonMois) {
    if (horizonMois > 24) {
        if (mois % 12 !== 0) {
            return '';
        }
        const annees = mois / 12;
        return `${annees} an${annees > 1 ? 's' : ''}`;
    }

    return `${mois} m`;
}

/**
 * Crée (ou recrée) le graphique de simulation
 * @param {Object} resultat - Sortie de simulerProjection
 */
export function createForecastChart(resultat) {
    const ctx = document.getElementById('forecastChart')?.getContext('2d');
    if (!ctx) {
        return;
    }

    const charts = state.get('charts');
    if (charts.forecast) {
        charts.forecast.destroy();
    }

    const points = echantillonner(resultat.serie);

    if (points.length === 0) {
        return;
    }

    try {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: points.map(p => libelleMois(p.mois, resultat.horizonMois)),
                datasets: [
                    {
                        label: 'Capital investi',
                        data: points.map(p => p.capital),
                        borderColor: couleur('--statut-financement'),
                        backgroundColor: couleur('--graph-investissement-fond'),
                        borderWidth: 2,
                        fill: true,
                        tension: 0.25,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Revenus nets cumulés',
                        data: points.map(p => p.cumulNet),
                        borderColor: couleur('--statut-actif'),
                        backgroundColor: couleur('--graph-parrainage-fond'),
                        borderWidth: 2,
                        fill: true,
                        tension: 0.25,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', align: 'end' },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label} : ${formatCurrency(context.parsed.y, 0)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatCurrency(value, 0)
                        }
                    },
                    x: {
                        ticks: { maxRotation: 0, autoSkipPadding: 16 }
                    }
                }
            }
        });

        charts.forecast = chart;
        state.set('charts', charts);

        logger.debug(LOG_CATEGORIES.CHART, 'Forecast chart created', { points: points.length });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating forecast chart', err);
    }
}
