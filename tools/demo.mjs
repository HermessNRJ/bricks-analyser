#!/usr/bin/env node
/**
 * Génère un portefeuille fictif pour les captures d'écran
 *
 * Le tableau de bord n'a pas d'écran de démonstration : il ne montre que le
 * portefeuille de celui qui le consulte. Prendre une capture pour le README
 * reviendrait donc à publier ses propres montants, ses adresses et ses impayés.
 *
 * Ce script fabrique un portefeuille crédible et entièrement inventé, puis le
 * fait passer par les mêmes normaliseurs que les vraies réponses de l'API :
 * l'état de compte et le journal des mouvements sont produits au format brut de
 * Bricks — centimes, mois indexés à zéro — et normalisés ici. Le cache obtenu
 * est donc construit exactement comme celui d'un chargement réel, et il le
 * restera si les normaliseurs changent.
 *
 * Le tirage est déterministe : deux exécutions le même mois donnent le même
 * portefeuille, et les captures restent comparables d'une version à l'autre.
 *
 *   npm run demo
 *
 * Puis voir docs/captures/README.md pour le charger dans le navigateur.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliserHistoriqueRevenus } from '../src/business/revenueHistory.js';
import { normaliserTransactions } from '../src/business/walletHistory.js';
import { normaliserApports } from '../src/business/apports.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, 'data', 'demo.json');

/** Profondeur de l'historique, en mois */
const MOIS_HISTORIQUE = 26;

/** Graine fixe : le portefeuille ne doit pas changer d'une exécution à l'autre */
const GRAINE = 20260813;

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32)
 * @param {number} graine - Graine entière
 * @returns {Function} Tirage dans [0, 1[
 */
function tirage(graine) {
    let etat = graine >>> 0;

    return () => {
        etat = (etat + 0x6d2b79f5) >>> 0;
        let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const alea = tirage(GRAINE);

/** Entier dans [min, max] */
const entre = (min, max) => min + Math.floor(alea() * (max - min + 1));

/** Élément au hasard */
const parmi = liste => liste[Math.floor(alea() * liste.length)];

/**
 * Noms de projets, entièrement inventés
 * Aucun ne correspond à un projet réel de la plateforme.
 */
const NOMS = [
    ['Immeuble Verdurin', 'Rue des Trois-Ponts, Nantes', 'France'],
    ['Villa des Alizés', 'Chemin du Phare, Saint-Malo', 'France'],
    ['Maisons du Clos Rivard', 'Route de Bellevue, Angers', 'France'],
    ['Résidence Le Pommeret', 'Avenue Jean-Jaurès, Rennes', 'France'],
    ['Domaine de la Ferrandière', 'Lieu-dit La Ferrandière, Uzès', 'France'],
    ['Hôtel du Cap Lauzet', 'Corniche des Douaniers, Sète', 'France'],
    ['Division Rue Chanzy', 'Rue Chanzy, Reims', 'France'],
    ['Immeuble Sainte-Colombe', 'Place Sainte-Colombe, Dijon', 'France'],
    ['Chalet des Grandes Combes', 'Route des Crêtes, Morzine', 'France'],
    ['Appartements Quai Neuf', 'Quai Neuf, Bordeaux', 'France'],
    ['Manoir de Kerlann 🇫🇷', 'Route de Kerlann, Vannes', 'France'],
    ['Locaux Parc de Bellecour', 'Zone du Bellecour, Clermont-Ferrand', 'France'],
    ['Villa Aurore', 'Boulevard du Midi, Antibes', 'France'],
    ['Immeuble Faubourg Lamartine', 'Faubourg Lamartine, Limoges', 'France'],
    ['Gîtes de la Vallée Close', 'Vallée Close, Foix', 'France'],
    ['Maison de la Poterne', 'Rue de la Poterne, Troyes', 'France'],
    ['Résidence Les Tamaris', 'Allée des Tamaris, La Rochelle', 'France'],
    ['Division Route de Sainval', 'Route de Sainval, Amiens', 'France'],
    ['Entrepôts du Pont Vieux', 'Chemin du Pont Vieux, Béziers', 'France'],
    ['Appartement Almeida 🇵🇹', 'Rua da Almeida, Lisbonne', 'Portugal'],
    ['Immeuble Bairro Novo 🇵🇹', 'Travessa do Bairro Novo, Porto', 'Portugal'],
    ['Quinta do Vale Escuro 🇵🇹', 'Estrada do Vale, Faro', 'Portugal'],
    ['Villa Serra Clara 🇪🇸', 'Calle Serra Clara, Valence', 'Espagne'],
    ['Résidence Miramar 🇪🇸', 'Paseo Miramar, Malaga', 'Espagne'],
    ['Le Sextant', 'Rue du Sextant, Brest', 'France'],
    ['Immeuble Bréhat', 'Quai de Bréhat, Saint-Brieuc', 'France'],
    ['Ferme des Quatre Vents', 'Route des Quatre Vents, Cahors', 'France'],
    ['Maisons Pré Fleuri', 'Chemin du Pré Fleuri, Chambéry', 'France'],
    ['Appartements Grand Bassin', 'Rue du Grand Bassin, Le Havre', 'France'],
    ['Division Clos Marronnier', 'Clos du Marronnier, Orléans', 'France'],
    ['Hôtel de la Poste Neuve', 'Place de la Poste, Cahors', 'France'],
    ['Villa Bellisandre', 'Corniche Bellisandre, Cassis', 'France'],
    ['Immeuble Rive Basse', 'Quai Rive Basse, Metz', 'France'],
    ['Résidence des Fontenelles', 'Rue des Fontenelles, Tours', 'France'],
    ['Domaine du Haut Ségur', 'Route du Haut Ségur, Rodez', 'France'],
    ['Appartement Cais Velho 🇵🇹', 'Cais Velho, Setúbal', 'Portugal'],
    ['Locaux du Verger Nord', 'Zone du Verger, Valenciennes', 'France'],
    ['Maison Terre Rouge', 'Chemin de Terre Rouge, Perpignan', 'France'],
    ['Immeuble Trois Fontaines', 'Rue des Trois Fontaines, Nancy', 'France'],
    ['Villa des Rochers Blancs', 'Route des Rochers, Biarritz', 'France'],
    ['Résidence Pointe Sud', 'Avenue de la Pointe, Ajaccio', 'France'],
    ['Division Faubourg Pasteur', 'Faubourg Pasteur, Besançon', 'France']
];

/** Textes d'alerte, volontairement génériques */
const ALERTES = [
    'Le permis de construire a été purgé de tout recours. Les travaux démarrent le mois prochain.',
    'Un retard de deux mois est annoncé sur la livraison, sans incidence sur le versement des coupons.',
    'Une échéance n\'a pas été honorée à la date prévue. L\'exploitant a été relancé.',
    'La commercialisation des lots a pris du retard ; trois réservations restent à confirmer.',
    'Mise en demeure adressée à l\'emprunteur après deux échéances impayées.',
    'Le bien a été vendu ; le remboursement du capital interviendra sur le prochain trimestre.'
];

/** Actualités de projet, pour les fiches sous suivi */
const ACTUALITES = [
    'Point mensuel : la régularisation des échéances est en cours de négociation.',
    'Le dossier a été transmis à notre service recouvrement.',
    'L\'exploitant a repris le paiement des échéances courantes.',
    'Un échéancier de rattrapage a été signé pour les six prochains mois.'
];

/**
 * Décale un mois YYYY-MM
 * @param {string} mois - Mois de départ
 * @param {number} pas - Nombre de mois à ajouter, éventuellement négatif
 * @returns {string} Mois au format YYYY-MM
 */
function decaler(mois, pas) {
    const [annee, m] = mois.split('-').map(Number);
    const total = annee * 12 + (m - 1) + pas;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const MOIS_FIN = (() => {
    const maintenant = new Date();
    return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
})();

const MOIS = Array.from({ length: MOIS_HISTORIQUE },
    (_, i) => decaler(MOIS_FIN, i - (MOIS_HISTORIQUE - 1)));

/**
 * Compose un identifiant stable à partir du rang du projet
 * @param {number} rang - Index du projet
 * @returns {string} Identifiant de la forme d'un UUID
 */
function identifiant(rang) {
    const hexa = n => n.toString(16).padStart(4, '0');
    return `demo${hexa(rang)}-0000-4000-8000-${hexa(rang)}00000000`.slice(0, 36);
}

/**
 * Tire le portefeuille fictif
 * @returns {Array<Object>} Propriétés décrites pour la suite du script
 */
function tirerPortefeuille() {
    return NOMS.map(([nom, adresse, pays], rang) => {
        // Les projets apparaissent au fil de l'historique, les plus anciens d'abord
        const naissance = Math.min(
            MOIS_HISTORIQUE - 2,
            Math.floor((rang / NOMS.length) * (MOIS_HISTORIQUE - 3)) + entre(0, 2)
        );

        const briques = parmi([1, 2, 3, 5, 5, 10, 10, 20, 25, 40]);
        const rendement = Math.round((entre(70, 135) / 10) * 10) / 10;

        // Trois projets encore en financement, deux remboursés, le reste en cours
        const etat = rang === 4 || rang === 21 ? 'rembourse'
            : rang >= NOMS.length - 3 ? parmi(['ongoing', 'upcoming'])
                : 'financed';

        return {
            id: identifiant(rang),
            nom,
            adresse,
            pays,
            briques,
            rendement,
            etat,
            moisAchat: MOIS[naissance],
            debutVersement: decaler(MOIS[naissance], 1),
            horizon: parmi([24, 36, 48, 60]),
            // Quelques dossiers se taisent en cours de route : c'est ce que le
            // carnet de versements est fait pour montrer.
            moisSilence: [7, 13, 19, 26].includes(rang) ? decaler(MOIS_FIN, -entre(1, 6)) : null,
            // Un remboursement de capital partiel, glissé dans les coupons
            rembourseLe: rang === 4 ? decaler(MOIS_FIN, -3)
                : rang === 21 ? decaler(MOIS_FIN, -8) : null
        };
    });
}

/**
 * Construit la réponse de /projects/financed
 * Chaque projet est écrit au mois où il entre au portefeuille ; les remboursés
 * le sont une seconde fois au mois courant, brique à zéro — c'est ainsi que
 * l'application les reconnaît.
 * @param {Array} portefeuille - Propriétés tirées
 * @returns {Array<Object>} Entrées mensuelles
 */
function construireProjets(portefeuille) {
    const parMois = new Map(MOIS.map(mois => [mois, []]));

    const fiche = (p, prixBrique) => ({
        id: p.id,
        name: { fr: p.nom, en: p.nom },
        address: { fr: p.adresse, en: p.adresse },
        ownedBricks: p.briques,
        brickPrice: prixBrique,
        yearlyTotalRentabilityPercentage: p.rendement,
        investmentHorizonInMonths: p.horizon,
        projectStatus: p.etat === 'rembourse' ? 'financed' : p.etat,
        funding: { revenueStartDate: p.debutVersement },
        thumbnailUrl: `https://picsum.photos/seed/${p.id.slice(0, 8)}/480/280`
    });

    portefeuille.forEach(p => {
        parMois.get(p.moisAchat).push(fiche(p, 1000));

        if (p.etat === 'rembourse') {
            parMois.get(MOIS_FIN).push(fiche(p, 0));
        }
    });

    return MOIS
        .map(mois => ({ yearMonthDate: mois, projects: parMois.get(mois) }))
        .filter(entree => entree.projects.length > 0);
}

/**
 * Construit la réponse de /investor/portfolio/revenue
 * Montants en centimes et mois indexés à zéro, comme l'API les renvoie.
 * @param {Array} portefeuille - Propriétés tirées
 * @returns {Object} Charge utile de l'état de compte
 */
function construireReleve(portefeuille) {
    const entrees = MOIS.map(mois => {
        const [annee, m] = mois.split('-').map(Number);
        const byProperty = [];
        let couponsCentimes = 0;
        let interetsCentimes = 0;

        portefeuille.forEach(p => {
            if (mois < p.debutVersement || p.etat !== 'financed' && p.etat !== 'rembourse') {
                return;
            }

            // Un projet remboursé cesse de verser après son solde
            if (p.rembourseLe && mois > p.rembourseLe) {
                return;
            }

            if (p.moisSilence && mois >= p.moisSilence) {
                return;
            }

            const investi = p.briques * 10;
            const interets = Math.round((investi * p.rendement / 100 / 12) * 100);
            let centimes = interets;

            // Le capital rendu passe dans les coupons, comme chez Bricks
            if (p.rembourseLe === mois) {
                centimes += investi * 100;
            }

            interetsCentimes += interets;

            if (centimes <= 0) {
                return;
            }

            byProperty.push({
                propertyId: p.id,
                propertyName: { fr: p.nom, en: p.nom },
                value: centimes
            });
            couponsCentimes += centimes;
        });

        // Parrainage ponctuel et solde boosté quotidien : versés bruts
        const parrainage = [-20, -14, -5].some(recul => mois === decaler(MOIS_FIN, recul)) ? 5000 : 0;
        const boost = entre(15, 45);

        // Le prélèvement ne porte que sur les INTÉRÊTS : un remboursement de
        // capital n'est pas imposable, alors même qu'il voyage dans les coupons.
        // C'est cet écart qui laisse retrouver la part de capital à rebours.
        const taux = mois >= '2026-01' ? 0.314 : 0.30;
        const impot = Math.round(interetsCentimes * taux);

        return {
            year: annee,
            month: m - 1,
            untaxedTotal: couponsCentimes + parrainage + boost,
            taxedTotal: couponsCentimes - impot + parrainage + boost,
            revenues: {
                referrals: { total: parrainage },
                boostedBalanceGain: { total: boost },
                withholdingTax: { total: -impot },
                obligationCoupons: {
                    untaxedTotal: couponsCentimes,
                    taxedTotal: couponsCentimes - impot,
                    byProperty
                }
            }
        };
    });

    return { investorFirstRevenueDate: `${MOIS[0]}-08T09:00:00.000Z`, revenuesByYearAndMonth: entrees };
}

/**
 * Part des achats payée par un virement plutôt que par les coupons réinvestis
 * Un portefeuille qui ne serait alimenté que de l'extérieur ne montrerait rien
 * de l'effet boule de neige ; un qui s'autofinancerait entièrement non plus.
 */
const PART_APPORTEE = 0.85;

/**
 * Construit le journal des mouvements
 * L'application y lit deux choses : les remboursements de capital, et ce que
 * l'investisseur a versé de sa poche.
 * @param {Array} portefeuille - Propriétés tirées
 * @returns {Array<Object>} Transactions
 */
function construireJournal(portefeuille) {
    const remboursements = portefeuille
        .filter(p => p.rembourseLe)
        .map((p, rang) => ({
            id: `demo-tx-${rang}`,
            kind: 'obligation_principal_repayment_final',
            createdAt: `${p.rembourseLe}-08T06:12:00.000Z`,
            status: 'confirmed',
            value: p.briques * 10 * 100,
            giftBalanceChange: 0,
            propertyId: p.id,
            propertyName: p.nom
        }));

    // Les versements suivent les achats : on recharge le compte le mois où l'on
    // achète, à l'euro rond, et les coupons déjà encaissés financent le reste.
    const achats = {};

    portefeuille.forEach(p => {
        achats[p.moisAchat] = (achats[p.moisAchat] || 0) + p.briques * 10;
    });

    const versements = Object.keys(achats).sort()
        .map(mois => ({ mois, montant: Math.round(achats[mois] * PART_APPORTEE / 10) * 10 }))
        .filter(({ montant }) => montant >= 20)
        .map(({ mois, montant }, rang) => ({
            id: `demo-topup-${rang}`,
            kind: 'topup_checkout',
            createdAt: `${mois}-03T14:27:00.000Z`,
            status: 'confirmed',
            value: montant * 100,
            giftBalanceChange: 0
        }));

    return [...remboursements, ...versements];
}

/**
 * Construit les alertes du portefeuille
 * @param {Array} portefeuille - Propriétés tirées
 * @returns {Array<Object>} Alertes datées
 */
function construireAlertes(portefeuille) {
    const alertes = [];

    portefeuille.forEach((p, rang) => {
        if (rang % 5 !== 0) {
            return;
        }

        const recul = entre(0, 5);
        alertes.push({
            propertyId: p.id,
            date: `${decaler(MOIS_FIN, -recul)}-${String(entre(3, 26)).padStart(2, '0')}T10:00:00.000Z`,
            description: `<p>${parmi(ALERTES)}</p>`
        });
    });

    return alertes;
}

/**
 * Construit le suivi officiel des projets
 * Trois cas : aucun dossier, un incident réglé, un défaut en cours.
 * @param {Array} portefeuille - Propriétés tirées
 * @returns {Object} Suivis indexés par identifiant
 */
function construireStatuts(portefeuille) {
    const statuts = {};

    portefeuille.forEach((p, rang) => {
        if (rang === 7 || rang === 19) {
            // Défaut en cours, avec échéances dues et pénalités
            statuts[p.id] = {
                id: p.id,
                suivi: true,
                statut: 'defaulted',
                impayees: entre(2, 5),
                penalites: entre(40, 320),
                derniereEcheanceImpayee: `${decaler(MOIS_FIN, -1)}-08`,
                contentieux: rang === 19,
                actualites: [{
                    date: `${decaler(MOIS_FIN, -1)}-14T09:00:00.000Z`,
                    texte: parmi(ACTUALITES),
                    tronquee: false
                }]
            };
        } else if (rang === 13) {
            // Incident passé, plus rien de dû
            statuts[p.id] = {
                id: p.id, suivi: true, statut: 'defaulted', impayees: 0,
                penalites: 0, derniereEcheanceImpayee: null, contentieux: false,
                actualites: [{
                    date: `${decaler(MOIS_FIN, -4)}-02T09:00:00.000Z`,
                    texte: 'L\'exploitant a repris le paiement des échéances courantes.',
                    tronquee: false
                }]
            };
        } else {
            statuts[p.id] = { id: p.id, suivi: false };
        }
    });

    return statuts;
}

const portefeuille = tirerPortefeuille();
const revenus = normaliserHistoriqueRevenus(construireReleve(portefeuille));
const journal = construireJournal(portefeuille);
const capital = normaliserTransactions(journal);
const apports = normaliserApports(journal);

const cache = {
    data: construireProjets(portefeuille),
    warnings: construireAlertes(portefeuille),
    savedAt: new Date().toISOString(),
    statuts: construireStatuts(portefeuille),
    revenus,
    capital,
    apports
};

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, JSON.stringify(cache));

const detenues = portefeuille.filter(p => p.etat !== 'rembourse').length;

console.log(`Portefeuille fictif écrit dans ${path.relative(RACINE, SORTIE)}`);
console.log(`  ${portefeuille.length} propriétés dont ${detenues} détenues`);
console.log(`  ${MOIS.length} mois d'historique, de ${MOIS[0]} à ${MOIS_FIN}`);
console.log(`  net perçu ${revenus.total.net.toFixed(2)} €, prélèvement ${revenus.total.impot.toFixed(2)} €`);
console.log(`  ${apports.total.net.toFixed(2)} € versés de la poche de l'investisseur`);
console.log(`  ${(fs.statSync(SORTIE).size / 1024).toFixed(0)} Ko`);
console.log('\nPour le charger : voir docs/captures/README.md');
