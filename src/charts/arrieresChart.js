/**
 * Ce que le portefeuille vous doit encore
 *
 * Deux courbes cumulées — les coupons que les échéances impayées n'ont pas
 * versés, les pénalités de retard qui s'y ajoutent — et une barre verticale au
 * dernier mois, dont la hauteur est leur somme.
 *
 * ## Pourquoi la barre plutôt qu'une troisième courbe
 *
 * Le total ne se lit pas en superposant deux traits : l'œil additionne mal deux
 * hauteurs, et une troisième courbe au-dessus des deux autres aurait ajouté une
 * ligne à suivre sans rien apprendre du chemin — sa forme n'est que la somme des
 * deux premières. La question « combien au total » ne se pose qu'une fois, à la
 * fin. La barre y répond là, et se laisse ignorer partout ailleurs.
 *
 * Ses deux segments reprennent les couleurs des courbes : le premier s'arrête
 * exactement où finit la courbe des coupons, le second ajoute les pénalités
 * par-dessus. La composition du total se lit donc sans légende.
 *
 * ## Pourquoi le rouge n'est pas partout
 *
 * Le système visuel réserve le ton chaud au risque. Les coupons manqués sont de
 * l'argent qu'on attendait et qui n'est pas venu : c'est l'alerte. Les pénalités
 * sont un dédommagement dû en plus — un désagrément, pas une perte — et portent
 * l'ambre de l'alerte faible.
 */

import { state } from '../core/state.js';
import { totalAffiche } from '../business/arrieres.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { couleur } from './theme.js';

/** Reprises des variables du système visuel : --alerte et --alerte-faible */
const couleurCoupons = () => couleur('--alerte');
const couleurPenalites = () => couleur('--alerte-faible');

/**
 * Formate un montant en euros
 * @param {number} montant - Montant à formater
 * @returns {string} Montant en euros, à la française
 */
function euros(montant) {
    return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

/**
 * Dresse la barre du total par-dessus les courbes
 *
 * Un plugin plutôt qu'un troisième jeu de données : le total n'est pas une
 * mesure mensuelle, et l'ajouter aux données l'aurait fait figurer dans la
 * légende et dans les infobulles de chaque mois, où il n'a rien à faire.
 */
const repereTotal = {
    id: 'repereTotal',
    afterDatasetsDraw(chart, args, options) {
        const { coupons = 0, penalites = 0 } = options || {};
        const total = coupons + penalites;

        if (!Number.isFinite(total) || total <= 0) {
            return;
        }

        const { ctx, chartArea, scales } = chart;
        const base = scales.y.getPixelForValue(0);
        const hautCoupons = scales.y.getPixelForValue(coupons);
        const sommet = scales.y.getPixelForValue(total);

        // Adossée au bord droit plutôt que centrée sur le dernier point : là,
        // elle aurait chevauché le point terminal des deux courbes.
        const largeur = 12;
        const x = chartArea.right - largeur - 2;

        ctx.save();

        ctx.fillStyle = couleurCoupons();
        ctx.fillRect(x, hautCoupons, largeur, base - hautCoupons);

        ctx.fillStyle = couleurPenalites();
        ctx.fillRect(x, sommet, largeur, hautCoupons - sommet);

        // Le libellé se pose sur le fond du graphique, pas sur la barre : au
        // centime près, il est plus large qu'elle.
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        const texte = `total dû ${euros(total)}`;
        const largeurTexte = ctx.measureText(texte).width;

        ctx.fillStyle = couleur('--graph-etiquette-fond');
        ctx.fillRect(chartArea.right - largeurTexte - 6, sommet - 18, largeurTexte + 6, 15);

        ctx.fillStyle = couleur('--ink');
        ctx.fillText(texte, chartArea.right - 3, sommet - 5);

        ctx.restore();
    }
};

/**
 * Crée le graphique des arriérés
 *
 * @param {Object|null} arrieres - Séries cumulées { coupons, penalites, nets,
 *   projets, detaille }, restreintes à la fenêtre choisie
 */
export function createArrieresChart(arrieres) {
    const ctx = document.getElementById('arrieresChart')?.getContext('2d');

    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas arrieresChart not found');
        return;
    }

    const charts = state.get('charts');

    if (charts.arrieres) {
        charts.arrieres.destroy();
        charts.arrieres = null;
    }

    const conteneur = document.getElementById('arrieresContainer');
    const labels = Object.keys(arrieres?.coupons || {}).sort();

    majNote(arrieres, labels);

    // Un portefeuille sans incident n'a pas de courbe à zéro à montrer : le
    // graphique disparaît, et les tuiles de risque disent déjà que tout va bien.
    if (labels.length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No arrears to chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.canvas.style.display = 'none';

        // Le cadre reste debout tant que la note a quelque chose à dire : des
        // statuts trop anciens pour porter les dates méritent qu'on l'explique
        // plutôt que de faire disparaître le sujet.
        if (conteneur) {
            conteneur.style.display = arrieres && arrieres.detaille === false ? 'block' : 'none';
        }
        return;
    }

    if (conteneur) conteneur.style.display = 'block';
    ctx.canvas.style.display = 'block';

    const coupons = labels.map(mois => arrieres.coupons[mois] ?? 0);
    const penalites = labels.map(mois => arrieres.penalites?.[mois] ?? 0);
    const total = totalAffiche(arrieres, labels);

    const serie = (label, data, teinte) => ({
        label,
        data,
        borderColor: teinte,
        backgroundColor: 'transparent',
        borderWidth: 2,
        fill: false,
        // Un escalier, non une pente : entre deux échéances il ne se passe
        // rien, et une courbe lissée aurait inventé une dette qui monte tous
        // les jours alors qu'elle saute d'un coup, le 20 du mois.
        stepped: true,
        pointRadius: 0,
        pointHitRadius: 12
    });

    try {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    serie('Coupons non versés (€)', coupons, couleurCoupons()),
                    serie('Pénalités de retard (€)', penalites, couleurPenalites())
                ]
            },
            plugins: [repereTotal],
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    repereTotal: {
                        coupons: coupons[coupons.length - 1] || 0,
                        penalites: penalites[penalites.length - 1] || 0
                    },
                    tooltip: {
                        callbacks: {
                            label: context => `${context.dataset.label.replace(/ \(€\)$/, '')}`
                                + ` : ${euros(context.parsed.y)}`,
                            footer: articles => {
                                const somme = articles.reduce((cumul, a) => cumul + a.parsed.y, 0);
                                return `Dû à cette date : ${euros(somme)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 8 }
                    },
                    y: {
                        beginAtZero: true,
                        // La barre du total dépasse les deux courbes : sans cette
                        // marge, son sommet et son libellé sortaient du cadre.
                        suggestedMax: total * 1.2,
                        ticks: { callback: valeur => euros(valeur) }
                    }
                }
            }
        });

        charts.arrieres = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Arrears chart created', {
            months: labels.length,
            projects: arrieres.projets
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating arrears chart', err);
    }
}

/**
 * Dit ce que la courbe compte, et ce qui l'en fait sortir
 *
 * @param {Object|null} arrieres - Séries cumulées
 * @param {Array<string>} labels - Mois affichés
 */
function majNote(arrieres, labels) {
    const note = document.getElementById('arrieresNote');

    if (!note) {
        return;
    }

    if (arrieres && arrieres.detaille === false) {
        note.textContent = 'Les statuts en mémoire datent d\'avant le suivi des échéances :'
            + ' ils disent combien d\'échéances manquent, jamais depuis quand. Cliquez sur'
            + ' « Vérifier les statuts » pour dater la dette et tracer la courbe.';
        return;
    }

    if (labels.length === 0) {
        note.textContent = '';
        return;
    }

    const total = totalAffiche(arrieres, labels);
    const projets = arrieres.projets || 0;
    const net = arrieres.nets?.[labels[labels.length - 1]] || 0;

    const phrases = [
        `${euros(total)} ne vous sont toujours pas parvenus, sur ${projets}`
        + ` projet${projets > 1 ? 's' : ''}.`
    ];

    // Ces montants sont bruts : c'est ce que les projets doivent. Le dire évite
    // qu'on attende sur son compte une somme dont le prélèvement prendra un tiers.
    if (net > 0 && net < total) {
        phrases.push(`Montants bruts : le prélèvement en laisserait ${euros(net)} sur le compte.`);
    }

    phrases.push('Une échéance rattrapée quitte la courbe, qui redescend d\'autant.'
        + ' Sa pénalité, elle, y reste tant que Bricks ne l\'a pas reversée : recouvrée'
        + ' auprès de l\'emprunteur n\'est pas encore arrivée chez vous.');

    note.textContent = phrases.join(' ');
}
