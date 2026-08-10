/**
 * Gestionnaire du simulateur de projection
 */

import {
    simulerProjection,
    rendementMoyenPondere,
    apportMensuelMoyen,
    horizonMoyenPondere,
    rendementsNets
} from '../business/forecast.js';
import { createForecastChart } from '../charts/forecastChart.js';
import { formatCurrency, formatPercentage } from '../utils/formatters.js';
import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

// Dernier portefeuille connu : sert de point de départ à la simulation
let contexte = {
    capitalInitial: 0,
    rendementMoyen: 0,
    tauxImpayeObserve: 0,
    apportMoyen: 0,
    horizonMoyen: 0
};

const CHAMPS = ['simApport', 'simHorizon', 'simRendement', 'simImpaye', 'simReinvestir'];

/**
 * Lit les hypothèses saisies
 * @returns {Object} Hypothèses prêtes pour simulerProjection
 */
function lireHypotheses() {
    const valeur = (id) => Number(document.getElementById(id)?.value);

    return {
        capitalInitial: contexte.capitalInitial,
        apportMensuel: valeur('simApport'),
        horizonMois: valeur('simHorizon') * 12,
        tauxAnnuelBrut: valeur('simRendement'),
        tauxImpaye: valeur('simImpaye'),
        reinvestir: document.getElementById('simReinvestir')?.checked
    };
}

/**
 * Construit une tuile de résultat
 * @param {string} valeur - Valeur mise en forme
 * @param {string} libelle - Libellé de la tuile
 * @param {string} [detail] - Précision optionnelle
 * @returns {string} HTML de la tuile
 */
function tuile(valeur, libelle, detail = '') {
    return `
        <div class="stat-card">
            <div class="stat-value">${valeur}</div>
            <div class="stat-label">${libelle}</div>
            ${detail ? `<div class="stat-detail">${detail}</div>` : ''}
        </div>
    `;
}

/**
 * Relance la simulation et rafraîchit l'affichage
 */
function rejouer() {
    const hypotheses = lireHypotheses();
    const resultat = simulerProjection(hypotheses);
    const zone = document.getElementById('simResultats');

    if (!zone) {
        return;
    }

    const annees = Math.round(resultat.horizonMois / 12);
    const argentMis = resultat.capitalInitial + resultat.totalApporte;

    zone.innerHTML = [
        tuile(
            formatCurrency(resultat.capitalFinal, 0),
            `Capital dans ${annees} an${annees > 1 ? 's' : ''}`,
            `${formatCurrency(argentMis, 0)} sortis de votre poche`
        ),
        tuile(
            formatCurrency(resultat.revenuNetMensuelFinal),
            'Revenus nets le dernier mois',
            `contre ${formatCurrency(resultat.capitalInitial * (hypotheses.tauxAnnuelBrut / 100 / 12) * (1 - hypotheses.tauxImpaye / 100) * (1 - CONFIG.TAX_RATE))} aujourd'hui`
        ),
        tuile(
            formatCurrency(resultat.cumulNet, 0),
            'Revenus nets cumulés',
            `soit ${formatPercentage(resultat.rendementNetCumule)} de l'argent investi`
        ),
        tuile(
            formatCurrency(resultat.cumulImpots, 0),
            'Impôts cumulés',
            `flat tax ${formatPercentage(CONFIG.TAX_RATE * 100)}`
        )
    ].join('');

    afficherCorrespondanceRendement(hypotheses);

    // Ce que les impayés coûtent ne se voit nulle part ailleurs
    const note = document.getElementById('simHypotheses');
    if (note) {
        const perdu = resultat.cumulPerdu > 0
            ? ` Les impayés vous privent de ${formatCurrency(resultat.cumulPerdu, 0)} de revenus bruts sur la période.`
            : '';
        note.textContent = `Départ à ${formatCurrency(resultat.capitalInitial, 0)} de capital déjà investi.${perdu}`;
    }

    createForecastChart(resultat);

    logger.debug(LOG_CATEGORIES.UI, 'Forecast refreshed', { annees });
}

/**
 * Traduit le rendement brut saisi en ce qui reste après prélèvement
 *
 * Le champ se saisit en brut, comme l'annonce Bricks : la correspondance nette
 * est donc affichée en lecture seule, et suit la saisie. La ligne mentionne
 * aussi l'effet des impayés lorsqu'ils sont non nuls, sans quoi on croirait
 * toucher le net d'impôt alors que la simulation retient moins.
 *
 * @param {Object} hypotheses - Hypothèses courantes du simulateur
 */
function afficherCorrespondanceRendement(hypotheses) {
    const ligne = document.getElementById('correspondanceRendement');

    if (!ligne) {
        return;
    }

    const { apresImpot, apresTout } = rendementsNets(
        hypotheses.tauxAnnuelBrut,
        hypotheses.tauxImpaye
    );

    const prelevement = formatPercentage(CONFIG.TAX_RATE * 100);
    let texte = `soit ${formatPercentage(apresImpot)} net après ${prelevement} de prélèvement`;

    if (hypotheses.tauxImpaye > 0) {
        texte += ` · ${formatPercentage(apresTout)} en tenant compte des impayés`;
    }

    ligne.textContent = texte;
}

/**
 * Affiche, sous chaque champ, ce que fait réellement le portefeuille
 * Une hypothèse ne se juge que comparée au constat.
 */
function afficherReperes() {
    const ecrire = (id, texte) => {
        const element = document.getElementById(id);
        if (element) element.textContent = texte;
    };

    ecrire('repereApport', contexte.apportMoyen > 0
        ? `vos 12 derniers mois : ${formatCurrency(contexte.apportMoyen, 0)} / mois`
        : 'aucun apport constaté sur 12 mois');

    ecrire('repereHorizon', contexte.horizonMoyen > 0
        ? `durée moyenne de vos projets : ${(contexte.horizonMoyen / 12).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ans`
        : '');

    ecrire('repereRendement', contexte.rendementMoyen > 0
        ? `votre moyenne pondérée : ${formatPercentage(contexte.rendementMoyen)} brut`
        : '');

    ecrire('repereImpaye', `constaté aujourd'hui : ${formatPercentage(contexte.tauxImpayeObserve)} du capital en difficulté`);
}

/**
 * Réaligne les hypothèses sur le portefeuille réel
 */
function repartirDuPortefeuille() {
    const appliquer = (id, valeur) => {
        const champ = document.getElementById(id);
        if (champ) champ.value = valeur;
    };

    appliquer('simRendement', contexte.rendementMoyen.toFixed(1));
    appliquer('simImpaye', contexte.tauxImpayeObserve.toFixed(1));

    if (contexte.apportMoyen > 0) {
        appliquer('simApport', Math.round(contexte.apportMoyen));
    }

    if (contexte.horizonMoyen > 0) {
        appliquer('simHorizon', Math.max(1, Math.round(contexte.horizonMoyen / 12)));
    }

    rejouer();
}

/**
 * Injecte le portefeuille courant dans le simulateur et le relance
 * Appelé à chaque recalcul des statistiques.
 * @param {Object} results - Résultats des calculs
 */
export function updateForecastContext(results) {
    contexte = {
        capitalInitial: results.totalInvestment || 0,
        rendementMoyen: rendementMoyenPondere(results.properties),
        // Part du capital détenu actuellement en difficulté : une hypothèse
        // d'impayés ancrée sur les faits plutôt que sur un chiffre rond
        tauxImpayeObserve: results.risque?.enDifficulte?.partCapital || 0,
        apportMoyen: apportMensuelMoyen(results.investmentEvolution),
        horizonMoyen: horizonMoyenPondere(results.properties)
    };

    afficherReperes();

    // Ne pas écraser une hypothèse que l'utilisateur a lui-même ajustée
    const preremplir = (id, valeur) => {
        const champ = document.getElementById(id);
        if (champ && champ.dataset.touche !== 'true') {
            champ.value = valeur;
        }
    };

    preremplir('simRendement', contexte.rendementMoyen.toFixed(1));
    preremplir('simImpaye', contexte.tauxImpayeObserve.toFixed(1));

    if (contexte.apportMoyen > 0) {
        preremplir('simApport', Math.round(contexte.apportMoyen));
    }

    rejouer();
}

/**
 * Configure le simulateur
 */
export function setupForecastHandler() {
    const zone = document.getElementById('simResultats');

    if (!zone) {
        return;
    }

    CHAMPS.forEach(id => {
        const champ = document.getElementById(id);

        if (!champ) {
            return;
        }

        const evenement = champ.type === 'checkbox' ? 'change' : 'input';

        champ.addEventListener(evenement, () => {
            champ.dataset.touche = 'true';
            rejouer();
        });
    });

    const reset = document.getElementById('simReset');
    if (reset) {
        reset.addEventListener('click', () => {
            CHAMPS.forEach(id => {
                const champ = document.getElementById(id);
                if (champ) delete champ.dataset.touche;
            });
            repartirDuPortefeuille();
        });
    }

    logger.debug(LOG_CATEGORIES.EVENT, 'Forecast handler configured');
}
