/**
 * Les tuiles du haut de page
 *
 * Chiffres clés, rendement annualisé par fenêtre, suivi des incidents : ce que
 * l'on lit avant d'entrer dans le détail du registre. Chaque tuile porte un
 * grand chiffre et, sous lui, la ligne qui dit d'où il sort.
 */

import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters.js';
import { escapeHtml } from '../utils/html.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { NIVEAUX_RISQUE } from '../business/riskAnalysis.js';
import { pluriel, moisEnIncise } from './libelles.js';

/**
 * Met à jour les cartes de statistiques
 * @param {Object} results - Résultats des calculs
 */
export function updateStatCards(results) {
    document.getElementById('totalBricks').textContent = formatNumber(results.totalBricks);
    document.getElementById('totalInvestment').textContent = formatCurrency(results.totalInvestment, 0);
    document.getElementById('monthlyRevenue').textContent = formatCurrency(results.monthlyRevenue);
    document.getElementById('totalProperties').textContent = formatNumber(results.activePropertiesCount || 0);
    document.getElementById('totalNetRevenueSinceBeginning').textContent = formatCurrency(results.totalNetRevenueSinceBeginning);
    document.getElementById('totalTaxesSinceBeginning').textContent = formatCurrency(results.totalTaxesSinceBeginning);
    document.getElementById('refundedProjectsCountValue').textContent = formatNumber(results.refundedProjectsCount || 0);
    document.getElementById('fundingProjectsCountValue').textContent = formatNumber(results.fundingOrUpcomingProjectsCount || 0);

    majDetailRevenus(results);
    majDetailNetCumule(results);
    majDetailInvestissement(results);
    renderRendement(results.rendements);
    updateRiskCards(results);

    logger.debug(LOG_CATEGORIES.UI, 'Stat cards updated');
}

/**
 * Dit quelle part du portefeuille est sortie de votre poche
 *
 * Le registre ne distingue pas une brique payée par virement d'une brique
 * payée avec un coupon réinvesti. Comparer les versements au capital placé le
 * dit : si l'investissement dépasse ce qui a été déposé, la différence ne peut
 * venir que des gains remis au travail — l'argent n'a pas d'autre porte
 * d'entrée.
 *
 * @param {Object} results - Résultats des calculs
 */
function majDetailInvestissement(results) {
    const total = results.apports?.total;

    majTitreCapital(results);

    if (!total) {
        setDetail('detailInvestissement', '');
        return;
    }

    // Retirer plus qu'on n'a déposé se lit comme un apport négatif : le montant
    // versé ne veut plus rien dire, seuls les deux sens du flux le disent.
    if (total.retrait > 0) {
        setDetail('detailInvestissement',
            `${formatCurrency(total.depot, 0)} déposés, ${formatCurrency(total.retrait, 0)} repris`);
        return;
    }

    // Plus aucune part affichée : ce serait comparer un FLUX — tout ce qui est
    // entré depuis l'ouverture — à un ÉTAT, le capital encore engagé. Le second
    // peut légitimement être le plus petit sans qu'un euro soit sorti de la
    // plateforme, l'amortissement ayant déjà rendu une partie de la mise.
    setDetail('detailInvestissement',
        `${formatCurrency(total.net, 0)} versés depuis l'ouverture`);
}

/**
 * Explique au survol pourquoi le capital engagé est inférieur aux versements
 *
 * La confusion est inévitable sans cela : on a versé 11 161 €, la tuile en
 * affiche 10 439, et l'on n'a pourtant jamais rien retiré. C'est que Bricks
 * amortit — le prix d'une brique baisse à mesure que le principal revient,
 * jusqu'à zéro quand le projet est soldé. Sur un portefeuille réel, 31 des
 * propriétés détenues étaient déjà entamées, l'une jusqu'à 1,13 € la brique.
 *
 * @param {Object} results - Résultats des calculs
 */
function majTitreCapital(results) {
    const tuile = document.getElementById('totalInvestment')?.closest('.stat-card');

    if (!tuile) {
        return;
    }

    const nominal = results.nominalBriques || 0;
    const amorti = Math.max(0, nominal - (results.totalInvestment || 0));

    const phrases = ['Ce qu\'il reste placé, non la somme jamais investie.'];

    if (amorti > 0) {
        phrases.push(`Vos ${formatNumber(results.totalBricks)} briques ont été émises à`
            + ` ${formatCurrency(nominal, 0)} : ${formatCurrency(amorti, 0)} de principal vous ont`
            + ' déjà été rendus dessus, et le prix de la brique a baissé d\'autant.');
    }

    if (results.refundedProjectsCount > 0) {
        phrases.push(`Les ${formatNumber(results.refundedProjectsCount)} projets soldés, eux, ne`
            + ' comptent plus du tout.');
    }

    tuile.setAttribute('title', phrases.join(' '));
}

/**
 * Affiche le rendement constaté sur plusieurs fenêtres
 *
 * Tout reste caché sans état de compte : le rendement se déduirait alors des
 * taux affichés par Bricks, et ne ferait que les recopier.
 *
 * @param {Object|null} rendements - { fenetres, dernierMois, capitalReconstruit }
 */
function renderRendement(rendements) {
    const section = document.getElementById('rendementSection');
    const grille = document.getElementById('rendementFenetres');

    if (!section || !grille) {
        return;
    }

    const fenetres = rendements?.fenetres || [];

    section.classList.toggle('hidden', fenetres.length === 0);

    if (fenetres.length === 0) {
        return;
    }

    grille.innerHTML = fenetres.map(carteRendement).join('');

    const resume = document.getElementById('rendementResume');

    if (resume) {
        resume.textContent = resumeRendement(fenetres, rendements.dernierMois);
    }

    setDetail('rendementNote', noteRendement(rendements));
}

/**
 * Compose une tuile de rendement
 *
 * Brut et net figurent tous deux, l'un sous l'autre. Le simulateur, plus bas,
 * raisonne en brut — n'afficher ici que le net donnait deux pourcentages sans
 * rien qui dise lequel est lequel, et le rapprochement était impossible.
 *
 * Les montants sont ramenés au mois : un cumul sur trente-trois mois ne se
 * compare à rien, là où un montant mensuel se lit contre le dernier versement.
 *
 * @param {Object} mesure - Mesure d'une fenêtre
 * @returns {string} Tuile HTML
 */
function carteRendement(mesure) {
    const parMois = valeur => valeur / mesure.mois.length;

    const titre = [
        `sur ${mesure.mois.length} mois : ${formatCurrency(mesure.net)} nets`
            + ` pour ${formatCurrency(mesure.brut)} bruts`,
        `capital moyen placé : ${formatCurrency(mesure.capitalMoyen, 0)}`,
        mesure.horsCoupons > 0
            ? `dont ${formatCurrency(mesure.horsCoupons)} de parrainage et de solde boosté`
            : null,
        mesure.capitalRendu > 0
            ? `${formatCurrency(mesure.capitalRendu)} de capital rendu ont été défalqués`
            : null
    ].filter(Boolean).join(' · ');

    return `
        <div class="rendement-fenetre" title="${escapeHtml(titre)}">
            <span class="rendement-libelle">${escapeHtml(mesure.libelle)}</span>
            <span class="rendement-taux">${formatPercentage(mesure.taux)}</span>
            <span class="rendement-taux-brut">${formatPercentage(mesure.tauxBrut)} brut</span>
            <div class="rendement-montants">
                <span>${formatCurrency(parMois(mesure.net))} nets par mois</span>
                <span>${formatCurrency(parMois(mesure.brut))} bruts</span>
            </div>
        </div>
    `;
}

/**
 * Résume la pente entre la fenêtre la plus courte et la plus longue
 * @param {Array} fenetres - Mesures, de la plus courte à la plus longue
 * @param {string} dernierMois - Dernier mois révolu retenu
 * @returns {string} Phrase de résumé
 */
function resumeRendement(fenetres, dernierMois) {
    const courte = fenetres[0];
    const longue = fenetres[fenetres.length - 1];

    if (fenetres.length === 1) {
        return `${formatPercentage(courte.taux)} l'an net sur ${moisEnIncise(dernierMois)},`
            + ' seul mois révolu de l\'historique.';
    }

    // Un dixième de point n'est pas une tendance : c'est le bruit de deux
    // versements décalés d'une semaine.
    const ecart = courte.taux - longue.taux;
    const sens = Math.abs(ecart) < 0.2
        ? 'au même rythme que'
        : (ecart > 0 ? 'mieux que' : 'moins bien que');

    return `Sur ${moisEnIncise(dernierMois)}, le portefeuille a rapporté ${formatPercentage(courte.taux)} l'an`
        + ` net — ${sens} sa moyenne depuis le début (${formatPercentage(longue.taux)}).`;
}

/**
 * Explique ce que le taux mesure, et ce qui lui manque
 * @param {Object} rendements - Résultat du calcul
 * @returns {string} Note de bas de section
 */
function noteRendement(rendements) {
    const phrases = [
        'Ce qui est réellement tombé sur le compte, hors capital remboursé, rapporté au'
        + ' capital placé pour le gagner et ramené à l\'année. Le grand chiffre est net,'
        + ' la ligne au-dessous le brut. Le mois en cours n\'entre qu\'une fois Bricks'
        + ' passé, vers le 8.'
    ];

    // Le simulateur, plus bas, part du taux ANNONCÉ par Bricks. Deux pourcentages
    // qui prétendent tous deux dire « ce que rapporte votre portefeuille » sans
    // qu'on sache lequel croire : la note fait le pont, en brut, puisque c'est en
    // brut que le simulateur se saisit. Le net promis a disparu de la phrase :
    // elle renvoie à la ligne brute des tuiles, et donnait donc le pont deux fois.
    if (rendements.tauxPromis) {
        phrases.push(`Bricks annonce ${formatPercentage(rendements.tauxPromis)} brut sur vos`
            + ' projets encore détenus : une promesse. Comparez-la à la ligne brute des tuiles —'
            + ' le constaté passe dessous quand des échéances manquent ou que le capital attend,'
            + ' dessus quand le parrainage et le solde boosté s\'en mêlent.');
    }

    if (!rendements.journalLu) {
        phrases.push('Sans le journal des mouvements, les projets remboursés ne pèsent plus rien'
            + ' dans le capital des mois anciens : les fenêtres longues sont flattées.');
    }

    return phrases.join(' ');
}

/**
 * Confronte les revenus attendus au dernier mois réellement encaissé
 *
 * La tuile affiche une espérance : chaque projet détenu est censé verser son
 * coupon. Les échéances impayées font que le versement réel s'en écarte, et
 * c'est précisément cet écart qu'on veut voir sans avoir à ouvrir Bricks. Le
 * mois courant est écarté tant que le règlement n'y est pas arrivé.
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
    setDetail('detailRevenusMensuels', `Perçu en ${moisEnIncise(dernier)} : ${formatCurrency(percu)}`);
}

/**
 * Dit ce que le net cumulé a écarté
 *
 * L'état de compte compte le capital amorti avec les coupons. Le laisser dans
 * la tuile gonflait le « net perçu » de tout ce qui n'était que la mise qui
 * revient — et sur un portefeuille réel, de 237 € sur 967 €.
 *
 * « écartés » seul ne disait pas d'où : on lisait un retrait subi plutôt qu'une
 * somme laissée hors du compte parce qu'elle n'est pas un gain.
 *
 * @param {Object} results - Résultats des calculs
 */
function majDetailNetCumule(results) {
    const capital = results.revenusReels?.capitalDansCoupons || 0;

    setDetail('detailNetCumule', capital > 0
        ? `hors ${formatCurrency(capital, 0)} de capital remboursé, qui n'est pas un gain`
        : '');
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
        const nombreRegularises = risque.defautsRegularises;
        const regularises = nombreRegularises
            ? ` · ${formatNumber(nombreRegularises)} défaut${pluriel(nombreRegularises)} passé${pluriel(nombreRegularises)},`
              + ` aujourd'hui régularisé${pluriel(nombreRegularises)}`
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
