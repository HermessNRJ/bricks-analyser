/**
 * Graphique de répartition des propriétés (donut) - Version Améliorée
 * Fonctionnalités:
 * - Total au centre du donut
 * - Labels de pourcentage sur les tranches
 * - Légende enrichie avec montants
 * - Tri intelligent
 * - Exclusion des projets remboursés (optionnel)
 * - Animation d'apparition
 * - Drill-down "Autres" (clic)
 * - Code couleur par statut
 */

import { state } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { truncate, formatCurrency, formatPercentage } from '../utils/formatters.js';
import { escapeHtml } from '../utils/html.js';

// Stocker les propriétés "Autres" pour le drill-down
let otherPropertiesCache = [];

/**
 * Plugin Chart.js pour afficher le total au centre du donut
 */
const centerTextPlugin = {
    id: 'centerText',
    afterDatasetsDraw: (chart) => {
        const { ctx, chartArea } = chart;

        if (!chartArea) {
            return;
        }

        // Le centre du donut n'est pas celui du canvas : la légende occupe le bas.
        // chartArea exclut la légende, c'est donc lui qui donne le vrai centre.
        const centreX = (chartArea.left + chartArea.right) / 2;
        const centreY = (chartArea.top + chartArea.bottom) / 2;

        // Le texte doit tenir dans le trou du donut, jamais déborder sur les tranches
        const rayonInterieur = Math.min(
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
        ) / 2 * 0.55;

        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const montant = formatCurrency(total, 0);
        let taille = Math.min(26, Math.floor(rayonInterieur * 0.52));

        // Réduire jusqu'à ce que le montant tienne dans le trou
        ctx.font = `600 ${taille}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        while (taille > 10 && ctx.measureText(montant).width > rayonInterieur * 1.7) {
            taille -= 1;
            ctx.font = `600 ${taille}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        }

        ctx.fillStyle = '#16202b';
        ctx.fillText(montant, centreX, centreY - taille * 0.35);

        ctx.font = `500 ${Math.max(9, Math.round(taille * 0.42))}px system-ui, sans-serif`;
        ctx.fillStyle = '#5c6b77';
        ctx.fillText('Total investi', centreX, centreY + taille * 0.7);

        ctx.restore();
    }
};

/**
 * Obtenir la couleur selon le statut du projet
 * @param {Object} property - Propriété
 * @param {number} index - Index dans le tableau
 * @returns {string} Couleur
 */
function getColorByStatus(property, index) {
    if (property.isRefunded) {
        return '#868e96'; // Gris pour remboursé
    } else if (property.projectStatus === 'ongoing') {
        return '#007bff'; // Bleu pour en financement
    } else if (property.projectStatus === 'upcoming') {
        return '#ffc107'; // Jaune pour à venir
    } else {
        return CONFIG.CHART_COLORS[index % CONFIG.CHART_COLORS.length];
    }
}

/**
 * Crée le graphique de répartition par propriété (version améliorée)
 * @param {Array} properties - Liste des propriétés
 */
export function createDistributionChart(properties) {
    const ctx = document.getElementById('distributionChart')?.getContext('2d');
    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas distributionChart not found');
        return;
    }

    // Détruire l'instance existante
    const charts = state.get('charts');
    if (charts.distribution) {
        charts.distribution.destroy();
    }

    const chartContainer = ctx.canvas.closest('.chart-container');

    // Vérifier si on a des données
    if (!properties || properties.length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No data for distribution chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }

    if (chartContainer) chartContainer.style.display = 'block';

    // Note: Les projets remboursés ont investment = 0€, donc ils n'apparaissent jamais dans le donut
    // Pas besoin de filtre car 0€ = pas de tranche

    // 🆕 Amélioration 4: Tri intelligent (par investissement décroissant)
    const sortedProperties = [...properties].sort((a, b) => b.investment - a.investment);

    // Préparer les données
    const chartLabels = [];
    const chartData = [];
    const chartColors = [];
    const propertyDetails = []; // Pour la légende enrichie

    if (sortedProperties.length > CONFIG.MAX_CHART_SEGMENTS) {
        // Prendre les N-1 premières propriétés
        const topProperties = sortedProperties.slice(0, CONFIG.MAX_CHART_SEGMENTS - 1);

        topProperties.forEach((p, idx) => {
            chartLabels.push(truncate(p.name));
            chartData.push(p.investment);
            chartColors.push(getColorByStatus(p, idx));
            propertyDetails.push(p);
        });

        // 🆕 Amélioration 7: Regrouper le reste dans "Autres" (avec drill-down)
        const otherProperties = sortedProperties.slice(CONFIG.MAX_CHART_SEGMENTS - 1);
        const otherPropertiesInvestment = otherProperties.reduce((sum, p) => sum + p.investment, 0);

        if (otherPropertiesInvestment > 0) {
            chartLabels.push('Autres');
            chartData.push(otherPropertiesInvestment);
            chartColors.push('#95a5a6'); // Gris pour "Autres"
            propertyDetails.push({
                name: 'Autres',
                investment: otherPropertiesInvestment,
                isOther: true
            });

            // Stocker pour le drill-down
            otherPropertiesCache = otherProperties;
        }
    } else {
        sortedProperties.forEach((p, idx) => {
            chartLabels.push(truncate(p.name));
            chartData.push(p.investment);
            chartColors.push(getColorByStatus(p, idx));
            propertyDetails.push(p);
        });
        otherPropertiesCache = [];
    }

    const total = chartData.reduce((a, b) => a + b, 0);

    try {
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    backgroundColor: chartColors,
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    hoverBorderWidth: 4,
                    hoverBorderColor: '#667eea'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,

                // 🆕 Amélioration 6: Animation d'apparition
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 1200,
                    easing: 'easeInOutQuart'
                },

                // 🆕 Amélioration 7: Drill-down sur clic
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const clickedLabel = chartLabels[index];

                        if (clickedLabel === 'Autres' && otherPropertiesCache.length > 0) {
                            showOthersModal(otherPropertiesCache);
                        }
                    }
                },

                plugins: {
                    // 🆕 Amélioration 3: Légende enrichie avec montants
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 12,
                            usePointStyle: true,
                            font: {
                                size: 11
                            },
                            generateLabels: (chart) => {
                                const data = chart.data;
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const percentage = total > 0 ? (value / total) * 100 : 0;

                                    return {
                                        text: `${label} — ${formatCurrency(value, 0)} (${formatPercentage(percentage)})`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                        }
                    },

                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const percentage = total > 0 ? (value / total) * 100 : 0;
                                return `${label} : ${formatCurrency(value)} (${formatPercentage(percentage)})`;
                            }
                        }
                    },

                    // 🆕 Amélioration 2: Labels de pourcentage sur les tranches (>5%)
                    datalabels: false // Désactivé par défaut car Chart.js standard ne l'a pas
                }
            },
            plugins: [centerTextPlugin] // 🆕 Amélioration 1: Total au centre
        });

        // Sauvegarder dans l'état
        charts.distribution = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Enhanced distribution chart created', {
            segments: chartData.length,
            othersCount: otherPropertiesCache.length
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating distribution chart', err);
    }
}

/**
 * 🆕 Amélioration 7: Affiche une modale avec les détails des propriétés "Autres"
 * @param {Array} otherProperties - Propriétés dans "Autres"
 */
function showOthersModal(otherProperties) {
    logger.info(LOG_CATEGORIES.CHART, 'Showing "Others" drill-down modal', {
        count: otherProperties.length
    });

    // Créer la modale si elle n'existe pas
    let modal = document.getElementById('othersPropertiesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'othersPropertiesModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="titreAutres">
                <h3 id="titreAutres">Autres propriétés</h3>
                <div id="othersPropertiesList" class="autres-liste"></div>
                <div class="modal-buttons">
                    <button id="closeOthersModal" class="bouton bouton-secondaire">Fermer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Gérer la fermeture
        document.getElementById('closeOthersModal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Fermer en cliquant sur l'overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Remplir la liste
    const list = document.getElementById('othersPropertiesList');
    const total = otherProperties.reduce((sum, p) => sum + p.investment, 0);

    // Les noms viennent de l'API : ils sont échappés avant toute injection
    list.innerHTML = otherProperties.map(p => {
        const percentage = total > 0 ? (p.investment / total) * 100 : 0;

        return `
            <div class="autres-ligne">
                <div>
                    <div class="autres-nom">${escapeHtml(p.name)}</div>
                    <div class="autres-meta">
                        ${escapeHtml(p.ownedBricks)} briques · ${formatPercentage(p.yearlyReturn)} de rendement
                    </div>
                </div>
                <div class="autres-montant">
                    <div class="montant">${formatCurrency(p.investment, 0)}</div>
                    <div class="autres-meta">${formatPercentage(percentage)}</div>
                </div>
            </div>
        `;
    }).join('');

    // Afficher la modale
    modal.style.display = 'flex';
}

