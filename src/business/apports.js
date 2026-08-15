/**
 * Ce que vous avez mis de votre poche
 *
 * Le portefeuille ne dit pas d'où vient l'argent. Une brique achetée avec un
 * virement et une brique achetée avec un coupon réinvesti se ressemblent
 * exactement : même prix, même rendement, même ligne dans le registre. Seul le
 * journal des mouvements sépare les deux, en nommant les entrées d'argent.
 *
 * Trois sources alimentent le solde Bricks : vos versements, le parrainage et
 * le solde boosté. Les deux dernières se lisent dans l'état de compte, qui les
 * ventile déjà par mois. La première ne se lit qu'ici.
 *
 * Les montants du journal sont en centimes, comme partout dans l'API.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Statuts qui valent argent réellement passé sur le compte
 *
 * Une LISTE BLANCHE, et non la liste des statuts à écarter. La nuance a coûté
 * cher : `declined` — un rechargement refusé par la banque, mauvais code ou
 * provision insuffisante — n'était pas dans la liste noire et comptait donc
 * comme un versement reçu. Sur un portefeuille réel, cela gonflait les apports
 * de plus de mille euros et faisait échouer tout rapprochement avec le solde.
 *
 * Le vocabulaire des statuts n'est pas plus documenté que celui des natures :
 * mieux vaut ignorer par défaut ce qu'on ne connaît pas, quitte à sous-estimer,
 * que compter comme encaissé un mouvement qui ne l'a jamais été. Les statuts
 * rencontrés sont journalisés, pour qu'un nouveau se voie.
 *
 * « confirmed » est acquis ; « waiting » est en route et sera crédité — seul le
 * calendrier les sépare.
 */
const STATUTS_RETENUS = ['confirmed', 'waiting'];

/**
 * Dit si un mouvement a réellement déplacé de l'argent
 * @param {string} statut - Statut renvoyé par l'API
 * @returns {boolean} true si le mouvement compte
 */
function estAbouti(statut) {
    return STATUTS_RETENUS.includes(statut);
}

/**
 * Reconnaît une alimentation du compte depuis l'extérieur
 *
 * Bricks nomme `topup_checkout` le rechargement par carte. La formulation peut
 * varier selon le moyen de paiement — virement, prélèvement — d'où la racine
 * plutôt qu'une liste close, qui manquerait le premier virement SEPA venu.
 *
 * @param {string} kind - Nature du mouvement
 * @returns {boolean} true s'il s'agit d'un versement de l'investisseur
 */
export function estApport(kind) {
    return typeof kind === 'string' && kind.includes('topup');
}

/**
 * Reconnaît un retrait vers le compte bancaire
 * @param {string} kind - Nature du mouvement
 * @returns {boolean} true s'il s'agit d'argent qui sort de Bricks
 */
export function estRetrait(kind) {
    if (typeof kind !== 'string') {
        return false;
    }

    return kind.includes('withdraw') || kind.includes('payout') || kind.includes('cash_out');
}

/**
 * Ramène le journal aux seuls mouvements entre votre banque et Bricks
 *
 * Les retraits sont défalqués : avoir déposé 5 000 € puis repris 1 000 € fait
 * un apport de 4 000 €, et c'est bien 4 000 € qu'il a fallu sortir de sa poche
 * pour tenir le portefeuille d'aujourd'hui.
 *
 * @param {Array} transactions - Journal brut renvoyé par l'API
 * @returns {Object|null} { parMois, parAnnee, total, nombre } ou null si aucun
 *   versement n'y figure
 */
export function normaliserApports(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return null;
    }

    const parMois = {};
    let depotCentimes = 0;
    let retraitCentimes = 0;
    let nombre = 0;
    let ignorees = 0;
    const naturesVues = new Map();

    transactions.forEach(transaction => {
        const kind = transaction?.kind;

        // Le vocabulaire du journal n'est pas documenté : on relève ce qu'on
        // croise, pour que l'ajout d'un moyen de paiement se voie dans les logs
        // plutôt que de disparaître silencieusement des apports.
        if (typeof kind === 'string') {
            const signature = `${kind} (${transaction.status})`;
            naturesVues.set(signature, (naturesVues.get(signature) || 0) + 1);
        }

        const apport = estApport(kind);
        const retrait = estRetrait(kind);

        if (!apport && !retrait) {
            return;
        }

        if (!estAbouti(transaction.status)) {
            ignorees++;
            return;
        }

        const mois = moisDeLaDate(transaction.createdAt);
        // Le sens du mouvement est porté par la nature, pas par le signe : un
        // retrait déjà négatif et un retrait positif doivent compter pareil.
        const valeur = Number.isFinite(transaction.value) ? Math.abs(transaction.value) : 0;

        if (!mois || valeur === 0) {
            return;
        }

        const cumul = parMois[mois] ||= { depot: 0, retrait: 0 };

        if (apport) {
            cumul.depot += valeur;
            depotCentimes += valeur;
        } else {
            cumul.retrait += valeur;
            retraitCentimes += valeur;
        }

        nombre++;
    });

    // Au niveau « info » et non « debug » : c'est le seul relevé qui dise quelles
    // natures de mouvement le journal contient réellement, et c'est par lui que
    // passe tout diagnostic sur un total d'apports qui ne tombe pas juste. Il
    // n'expose que des décomptes, aucun montant ni nom de projet.
    logger.info(LOG_CATEGORIES.API, 'Wallet movement kinds observed', {
        kinds: Object.fromEntries([...naturesVues].sort((a, b) => b[1] - a[1]))
    });

    if (nombre === 0) {
        logger.info(LOG_CATEGORIES.API, 'No personal contribution found in wallet journal', {
            kinds: [...naturesVues.keys()]
        });
        return null;
    }

    Object.values(parMois).forEach(cumul => {
        cumul.depot = cumul.depot / 100;
        cumul.retrait = cumul.retrait / 100;
        cumul.net = Math.round((cumul.depot - cumul.retrait) * 100) / 100;
    });

    const total = {
        depot: depotCentimes / 100,
        retrait: retraitCentimes / 100,
        net: (depotCentimes - retraitCentimes) / 100
    };

    logger.info(LOG_CATEGORIES.API, 'Personal contributions extracted', {
        transactions: nombre,
        months: Object.keys(parMois).length,
        deposited: total.depot,
        withdrawn: total.retrait,
        cancelled: ignorees
    });

    return {
        parMois,
        parAnnee: cumulerParAnnee(parMois),
        total,
        nombre
    };
}

/**
 * Extrait le mois d'un horodatage ISO
 * @param {string} date - Horodatage ISO
 * @returns {string|null} Mois au format YYYY-MM, null si illisible
 */
function moisDeLaDate(date) {
    if (typeof date !== 'string' || date.length < 7) {
        return null;
    }

    const mois = date.slice(0, 7);

    return /^\d{4}-\d{2}$/.test(mois) ? mois : null;
}

/**
 * Cumule les mouvements mensuels par année civile
 * @param {Object} parMois - Mouvements par mois, en euros
 * @returns {Object} Mouvements par année
 */
function cumulerParAnnee(parMois) {
    const annees = {};

    Object.keys(parMois).forEach(mois => {
        const annee = mois.slice(0, 4);
        const cumul = annees[annee] ||= { depot: 0, retrait: 0, net: 0 };

        cumul.depot += parMois[mois].depot;
        cumul.retrait += parMois[mois].retrait;
        cumul.net += parMois[mois].net;
    });

    Object.values(annees).forEach(cumul => {
        Object.keys(cumul).forEach(champ => {
            cumul[champ] = Math.round(cumul[champ] * 100) / 100;
        });
    });

    return annees;
}

/**
 * Ventile mois par mois l'argent entré sur le compte
 *
 * Les trois sources se lisent dans deux endroits différents — le journal pour
 * vos versements, l'état de compte pour ce que Bricks vous a offert — mais
 * elles répondent à la même question et ne valent que confrontées : cinquante
 * euros de parrainage ne se jugent que rapportés à ce qu'on a soi-même déposé
 * le même mois.
 *
 * Mois par mois, et non en cumul : une courbe cumulée ne monte jamais et finit
 * par ne plus rien dire que « le temps passe ». Le rythme des apports, lui, est
 * une information — les mois où l'on a mis de côté, ceux où l'on s'est arrêté.
 *
 * @param {Object|null} apports - Apports normalisés, issus du journal
 * @param {Object} [mensuel] - Revenus par mois, issus de l'état de compte
 * @returns {Object|null} { apports, parrainage, boost, total, moyenneApports }
 *   ou null si aucune source n'est disponible
 */
export function serieOrigineFonds(apports, mensuel) {
    const mois = [...new Set([
        ...Object.keys(apports?.parMois || {}),
        ...Object.keys(mensuel || {})
    ])].filter(m => /^\d{4}-\d{2}$/.test(m)).sort();

    if (mois.length === 0) {
        return null;
    }

    const series = { apports: {}, parrainage: {}, boost: {} };
    const total = { apports: 0, parrainage: 0, boost: 0 };

    mois.forEach(m => {
        const duMois = {
            apports: apports?.parMois?.[m]?.net || 0,
            parrainage: mensuel?.[m]?.parrainage || 0,
            boost: mensuel?.[m]?.boost || 0
        };

        Object.keys(series).forEach(source => {
            series[source][m] = Math.round(duMois[source] * 100) / 100;
            total[source] += duMois[source];
        });
    });

    Object.keys(total).forEach(source => {
        total[source] = Math.round(total[source] * 100) / 100;
    });

    return {
        ...series,
        // Sans le journal, la série des versements serait plate à zéro et se
        // lirait comme « je n'ai jamais rien déposé » : mieux vaut la taire.
        apportsConnus: Boolean(apports?.parMois && Object.keys(apports.parMois).length > 0),
        total
    };
}

/**
 * Votre rythme de versement sur une liste de mois
 *
 * Les mois sans versement comptent au dénominateur : une pause de six mois
 * divise la moyenne par deux, ce qui est précisément l'information cherchée.
 *
 * Cette fonction est le seul endroit où « ce que je verse par mois » se calcule.
 * Le graphique en tirait son repère sur tout l'historique quand ses barres
 * n'affichaient qu'une fenêtre, et le simulateur en tirait un troisième chiffre
 * de la courbe d'investissement — trois réponses différentes à la même question.
 *
 * @param {Object} serie - Versements par mois { 'YYYY-MM': € }
 * @param {Array<string>} mois - Mois à moyenner, y compris ceux à zéro
 * @returns {number} Versement moyen sur la période, en euros
 */
export function moyenneVersements(serie, mois) {
    if (!Array.isArray(mois) || mois.length === 0) {
        return 0;
    }

    const total = mois.reduce((somme, m) => somme + (serie?.[m] || 0), 0);

    return Math.round((total / mois.length) * 100) / 100;
}

/**
 * Catégories du journal, dans l'ordre où on les essaie
 *
 * Le vocabulaire relevé sur un portefeuille réel de 1 168 lignes : achats de
 * briques (`primary_purchase_with_refund`), solde boosté quotidien, amortissements
 * et soldes de principal, rechargements par carte (`topup_card` et
 * `topup_checkout`), coupons (`recurring_revenue`), prélèvement, parrainage
 * (`refer_referrer`) et une poignée d'`adjustment`.
 */
const CATEGORIES = [
    ['apports', estApport],
    ['retraits', estRetrait],
    ['achats', kind => kind.includes('purchase')],
    ['capital', kind => kind.includes('principal_repayment')],
    ['impots', kind => kind.includes('withholding_tax')],
    ['revenus', kind => kind.includes('recurring_revenue')
        || kind.includes('boosted_balance')
        || kind.includes('refer')]
];

/**
 * Rapproche le journal du solde réellement affiché par Bricks
 *
 * Le journal est censé être exhaustif : additionner toutes ses lignes doit
 * rendre le solde du portefeuille. Quand le compte ne tombe pas, c'est qu'une
 * nature de mouvement échappe au classement — et comme le vocabulaire n'est pas
 * documenté, cela arrivera encore.
 *
 * Ce contrôle a été écrit après trois tours à raisonner sur des totaux dérivés
 * qui ne bouclaient pas : 1 493 € manquaient à l'appel sans qu'aucune des
 * grandeurs agrégées ne puisse dire où. Une somme sur les lignes brutes tranche
 * en une passe.
 *
 * @param {Array} transactions - Journal brut, dédoublonné
 * @returns {Object|null} { solde, parCategorie, nonClassees } ou null si vide
 */
export function reconcilierJournal(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return null;
    }

    const parCategorie = {};
    const nonClassees = {};
    let solde = 0;

    transactions.forEach(transaction => {
        const kind = typeof transaction?.kind === 'string' ? transaction.kind : '';
        const valeur = Number.isFinite(transaction?.value) ? transaction.value : 0;

        if (!estAbouti(transaction?.status)) {
            return;
        }

        solde += valeur;

        const categorie = CATEGORIES.find(([, correspond]) => correspond(kind));

        if (categorie) {
            parCategorie[categorie[0]] = (parCategorie[categorie[0]] || 0) + valeur;
            return;
        }

        const inconnue = nonClassees[kind] ||= { lignes: 0, centimes: 0 };
        inconnue.lignes++;
        inconnue.centimes += valeur;
    });

    const enEuros = centimes => Math.round(centimes) / 100;

    Object.keys(parCategorie).forEach(cle => {
        parCategorie[cle] = enEuros(parCategorie[cle]);
    });

    const restes = Object.fromEntries(
        Object.entries(nonClassees).map(([kind, releve]) =>
            [kind, `${releve.lignes} lignes, ${enEuros(releve.centimes).toFixed(2)} €`])
    );

    const releve = {
        // À comparer au « Solde total » affiché par Bricks : s'ils diffèrent,
        // le journal ne remonte pas jusqu'à l'ouverture du compte, ou une nature
        // porte un signe inattendu.
        soldeCalcule: enEuros(solde),
        parCategorie,
        nonClassees: restes
    };

    if (Object.keys(restes).length > 0) {
        logger.warn(LOG_CATEGORIES.API, 'Wallet journal has unclassified movements', releve);
    } else {
        logger.info(LOG_CATEGORIES.API, 'Wallet journal reconciled', releve);
    }

    return releve;
}
