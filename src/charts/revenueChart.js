/**
 * Graphique d'évolution des revenus mensuels nets
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Trait de l'attendu : présent mais en retrait, le perçu restant le sujet */
const COULEUR_ATTENDU = '#8a94a6';

/**
 * Formate un montant en euros
 * @param {number} montant - Montant à formater
 * @returns {string} Montant en euros, à la française
 */
function euros(montant) {
    return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

/**
 * Crée le graphique d'évolution des revenus nets
 * @param {Object} netRevenueData - Données de revenus nets { 'YYYY-MM': montant }
 * @param {Object} [options]
 * @param {boolean} [options.reel] - true si les montants viennent de l'état de
 *   compte Bricks, false s'ils sont estimés depuis les taux affichés
 * @param {string|null} [options.moisPartiel] - Mois encore en cours, dont le
 *   montant n'est pas comparable aux précédents
 * @param {Object} [options.attendu] - Ce que le portefeuille aurait dû verser
 *   { 'YYYY-MM': montant }, sur la fenêtre où la confrontation est valable
 * @param {Object} [options.ecart] - Manque à gagner du dernier mois révolu
 */
export function createRevenueChart(netRevenueData, { reel = false, moisPartiel = null, attendu = null, ecart = null } = {}) {
    const ctx = document.getElementById('revenueEvolutionChart')?.getContext('2d');
    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas revenueEvolutionChart not found');
        return;
    }

    // Détruire l'instance existante
    const charts = state.get('charts');
    if (charts.revenueEvolution) {
        charts.revenueEvolution.destroy();
    }

    const chartContainer = ctx.canvas.closest('.chart-container');

    // Vérifier si on a des données
    if (!netRevenueData || Object.keys(netRevenueData).length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No data for revenue evolution chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }

    if (chartContainer) chartContainer.style.display = 'block';

    const labels = Object.keys(netRevenueData).sort();
    const data = labels.map(label => netRevenueData[label]);

    // Un mois inachevé ne se lit pas comme les autres : son point est creux et
    // le trait qui y mène pointillé, pour qu'une chute de fin de série ne passe
    // pas pour une perte de revenus.
    const indexPartiel = moisPartiel ? labels.indexOf(moisPartiel) : -1;
    const couleur = '#4bc0c0';

    const legende = reel
        ? 'Perçu (€)'
        : 'Revenus nets mensuels estimés (€)';

    // La série attendue ne couvre qu'une fenêtre récente : ailleurs elle vaut
    // null pour que Chart.js interrompe le trait au lieu de le tirer à travers.
    const moisAttendus = attendu ? Object.keys(attendu) : [];
    const serieAttendue = moisAttendus.length > 0
        ? labels.map(label => (label in attendu ? attendu[label] : null))
        : null;

    majNoteRevenus(reel, moisPartiel, moisAttendus[0] || null, ecart);

    try {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: legende,
                    data: data,
                    borderColor: couleur,
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.1,
                    pointBackgroundColor: (context) =>
                        context.dataIndex === indexPartiel ? '#ffffff' : couleur,
                    pointBorderColor: (context) =>
                        context.dataIndex === indexPartiel ? couleur : '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    segment: {
                        borderDash: (context) =>
                            context.p1DataIndex === indexPartiel ? [5, 4] : undefined
                    },
                    order: 1
                }].concat(serieAttendue ? [{
                    label: 'Attendu au rythme du portefeuille (€)',
                    data: serieAttendue,
                    borderColor: COULEUR_ATTENDU,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    fill: false,
                    tension: 0.1,
                    spanGaps: false,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: COULEUR_ATTENDU,
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    order: 0
                }] : [])
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const montant = euros(context.parsed.y);
                                const suffixe = context.dataIndex === indexPartiel ? ' (mois en cours)' : '';
                                return `${context.dataset.label.replace(/ \(€\)$/, '')} : ${montant}${suffixe}`;
                            },
                            // Le manque à gagner est ce que le lecteur vient chercher :
                            // autant le soustraire pour lui plutôt que de l'imposer
                            // à la lecture de deux points superposés.
                            afterBody: function(items) {
                                if (!serieAttendue || items.length < 2) {
                                    return '';
                                }

                                const index = items[0].dataIndex;
                                const manque = serieAttendue[index] - data[index];

                                if (!Number.isFinite(manque)) {
                                    return '';
                                }

                                return manque >= 0
                                    ? `Manque : ${euros(manque)}`
                                    : `Au-dessus de l'attendu : ${euros(-manque)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return euros(value);
                            }
                        }
                    }
                }
            }
        });

        // Sauvegarder dans l'état
        charts.revenueEvolution = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Revenue chart created', {
            dataPoints: labels.length,
            source: reel ? 'bricks-statement' : 'estimate',
            expectedPoints: moisAttendus.length
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating revenue chart', err);
    }
}

/**
 * Dit d'où viennent les montants tracés et jusqu'où la comparaison tient
 *
 * L'écart entre perçu et attendu est la question même que pose ce graphique :
 * mieux vaut l'écrire sous la courbe que laisser deviner. La borne de la
 * fenêtre se dit aussi : sans elle, on chercherait le trait pointillé sur les
 * années précédentes et on conclurait à un bug.
 *
 * @param {boolean} reel - true si les montants viennent de l'état de compte
 * @param {string|null} moisPartiel - Mois encore en cours, s'il y en a un
 * @param {string|null} debutComparaison - Premier mois confronté à l'attendu
 * @param {Object|null} ecart - Manque à gagner du dernier mois révolu
 */
function majNoteRevenus(reel, moisPartiel, debutComparaison, ecart) {
    const note = document.getElementById('revenusSourceNote');

    if (!note) {
        return;
    }

    if (!reel) {
        note.textContent = 'Estimation déduite des taux affichés : les échéances impayées y sont comptées comme versées. Rechargez depuis l\'API pour obtenir les montants réellement encaissés.';
        return;
    }

    const phrases = ['Trait plein : ce que Bricks a réellement versé, prélèvement déduit.'];

    if (debutComparaison) {
        phrases.push(`Pointillé : ce que le portefeuille aurait dû verser au taux affiché. La comparaison ne remonte pas avant ${moisEnClair(debutComparaison)} : plus tôt, elle sous-estimerait, les projets remboursés depuis n'y figurant plus alors qu'ils versaient à l'époque.`);
    }

    if (ecart && ecart.manque > 0) {
        phrases.push(`En ${moisEnClair(ecart.mois)} : ${euros(ecart.percu)} perçus pour ${euros(ecart.attendu)} attendus, soit ${euros(ecart.manque)} manquants.`);
    }

    if (moisPartiel) {
        phrases.push('Le dernier point porte sur un mois non terminé.');
    }

    note.textContent = phrases.join(' ');
}

/**
 * Écrit un mois YYYY-MM en toutes lettres
 * @param {string} mois - Mois au format YYYY-MM
 * @returns {string} Mois et année en français
 */
function moisEnClair(mois) {
    const [annee, index] = mois.split('-').map(Number);
    const date = new Date(annee, index - 1, 1);

    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
