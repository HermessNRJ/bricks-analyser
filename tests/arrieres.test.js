import { describe, it, expect } from 'vitest';
import { serieArrieres, totalAffiche } from '../src/business/arrieres.js';

/**
 * Villa Cap d'Antibes : 25 briques sur 500 000, 250 € placés à 11 %.
 * Le coupon mensuel vaut donc 250 × 11 % / 12 = 2,2917 €, et la part du projet
 * 25 / 500 000 = 0,005 %.
 */
const ANTIBES = {
    id: 'antibes',
    ownedBricks: 25,
    investment: 250,
    yearlyReturn: 11,
    country: 'Portugal'
};

const echeance = (mois, statut, penalitesProjet = 0) => ({ mois, statut, penalitesProjet });

const suivi = (echeances, extra = {}) => ({
    suivi: true,
    briquesProjet: 500000,
    echeances,
    ...extra
});

const propriete = (echeances, extra = {}) => ({
    ...ANTIBES,
    ...extra,
    suivi: suivi(echeances)
});

describe('serieArrieres', () => {
    it('ne dit rien tant qu\'aucun statut n\'a été récupéré', () => {
        // Pas même « rien à signaler » : on ignore encore s'il y a quelque chose
        expect(serieArrieres([{ ...ANTIBES, suivi: null }], '2026-08')).toBeNull();
        expect(serieArrieres([{ ...ANTIBES, suivi: { suivi: false } }], '2026-08')).toBeNull();
        expect(serieArrieres([], '2026-08')).toBeNull();
    });

    it('cumule un coupon par échéance impayée', () => {
        const serie = serieArrieres([propriete([
            echeance('2026-04', 'unpaid'),
            echeance('2026-05', 'unpaid'),
            echeance('2026-06', 'unpaid')
        ])], '2026-06');

        expect(serie.coupons['2026-04']).toBeCloseTo(2.29, 2);
        expect(serie.coupons['2026-05']).toBeCloseTo(4.58, 2);
        expect(serie.coupons['2026-06']).toBeCloseTo(6.88, 2);
        expect(serie.total).toBeCloseTo(6.88, 2);
        expect(serie.projets).toBe(1);
        expect(serie.detaille).toBe(true);
    });

    it('ramène les pénalités du projet à la part des briques détenues', () => {
        // 37 254,64 € pour l'ensemble des obligataires, 25 briques sur 500 000
        const serie = serieArrieres([propriete([
            echeance('2026-05', 'unpaid', 37254.64)
        ])], '2026-05');

        expect(serie.penalites['2026-05']).toBeCloseTo(1.86, 2);
    });

    it('tait la pénalité quand le nombre de briques du projet manque', () => {
        // Annoncer la dette entière comme sienne serait faux d'un facteur 20 000
        const orpheline = {
            ...ANTIBES,
            suivi: suivi([echeance('2026-05', 'unpaid', 37254.64)], { briquesProjet: 0 })
        };

        const serie = serieArrieres([orpheline], '2026-05');

        expect(serie.penalites['2026-05']).toBe(0);
        // Le coupon manqué, lui, reste calculable
        expect(serie.coupons['2026-05']).toBeCloseTo(2.29, 2);
    });

    it('retire de la courbe le coupon d\'une échéance régularisée', () => {
        // Le cœur du graphique : ce qui a fini par arriver n'est plus dû. Deux
        // impayées encadrent une régularisée, qui ne doit rien ajouter au cumul.
        const serie = serieArrieres([propriete([
            echeance('2026-04', 'unpaid'),
            echeance('2026-05', 'regularized'),
            echeance('2026-06', 'unpaid')
        ])], '2026-06');

        expect(serie.coupons['2026-04']).toBeCloseTo(2.29, 2);
        expect(serie.coupons['2026-05']).toBeCloseTo(2.29, 2);
        expect(serie.coupons['2026-06']).toBeCloseTo(4.58, 2);
    });

    it('garde la pénalité d\'une échéance régularisée, recouvrée mais non reversée', () => {
        // Bricks la range en `recovered_awaiting_distribution` : l'emprunteur a
        // payé, l'obligataire n'a pas encore reçu. Elle reste donc due.
        const serie = serieArrieres([propriete([
            echeance('2026-05', 'regularized', 37254.64)
        ])], '2026-05');

        expect(serie.coupons['2026-05']).toBe(0);
        expect(serie.penalites['2026-05']).toBeCloseTo(1.86, 2);
    });

    it('ne réclame que la pénalité d\'une échéance en `pending_penalties`', () => {
        // L'échéance a fini par être versée ; seule la pénalité manque encore
        const serie = serieArrieres([propriete([
            echeance('2026-05', 'pending_penalties', 37254.64)
        ])], '2026-05');

        expect(serie.coupons['2026-05']).toBe(0);
        expect(serie.penalites['2026-05']).toBeCloseTo(1.86, 2);
    });

    it('ignore entièrement une échéance soldée', () => {
        const serie = serieArrieres([propriete([
            echeance('2026-04', 'unpaid'),
            echeance('2026-05', 'paid', 37254.64)
        ])], '2026-05');

        expect(serie.coupons['2026-05']).toBeCloseTo(2.29, 2);
        expect(serie.penalites['2026-05']).toBe(0);
    });

    it('prolonge la courbe jusqu\'au mois courant', () => {
        // Un trou creusé en avril est toujours ouvert en août : une courbe qui
        // s'arrêterait à la dernière échéance laisserait croire l'inverse.
        const serie = serieArrieres([propriete([echeance('2026-04', 'unpaid')])], '2026-08');

        expect(serie.mois).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
        expect(serie.coupons['2026-08']).toBeCloseTo(2.29, 2);
    });

    it('additionne plusieurs projets sur les mêmes mois', () => {
        const autre = {
            id: 'chicamour',
            ownedBricks: 10,
            investment: 100,
            yearlyReturn: 12,
            country: 'France',
            suivi: suivi([echeance('2026-04', 'unpaid')], { briquesProjet: 175000 })
        };

        const serie = serieArrieres([
            propriete([echeance('2026-04', 'unpaid')]),
            autre
        ], '2026-04');

        // 2,29 € pour Antibes, 1 € pour l'autre
        expect(serie.coupons['2026-04']).toBeCloseTo(3.29, 2);
        expect(serie.projets).toBe(2);
    });

    it('signale des statuts trop anciens pour porter les dates', () => {
        // Un cache d'avant le suivi des échéances : il dit combien manquent,
        // jamais depuis quand. Le distinguer d'un portefeuille sain permet
        // d'inviter à relancer la vérification plutôt que de se taire.
        const ancien = { ...ANTIBES, suivi: { suivi: true, impayees: 4, briquesProjet: 500000 } };
        const serie = serieArrieres([ancien], '2026-08');

        expect(serie.detaille).toBe(false);
        expect(serie.mois).toEqual([]);
        expect(serie.total).toBe(0);
    });

    it('rend une série vide pour un portefeuille suivi mais sans arriéré', () => {
        const serie = serieArrieres([propriete([])], '2026-08');

        expect(serie.detaille).toBe(true);
        expect(serie.total).toBe(0);
        expect(serie.projets).toBe(0);
    });

    it('écarte une échéance dont la date est inexploitable', () => {
        const serie = serieArrieres([propriete([
            echeance('', 'unpaid'),
            echeance('pas-une-date', 'unpaid'),
            echeance('2026-05', 'unpaid')
        ])], '2026-05');

        expect(serie.coupons['2026-05']).toBeCloseTo(2.29, 2);
    });

    it('retient le brut mais chiffre à part ce que le prélèvement laisserait', () => {
        // Un projet français perd 31,4 % à la source ; le portugais paie brut,
        // l'impôt n'arrivant que plus tard, sur la déclaration.
        const francais = {
            ...ANTIBES,
            id: 'lyon',
            country: 'France',
            suivi: suivi([echeance('2026-05', 'unpaid')])
        };

        const serie = serieArrieres([francais], '2026-05');

        expect(serie.coupons['2026-05']).toBeCloseTo(2.29, 2);
        expect(serie.nets['2026-05']).toBeCloseTo(2.29 * 0.686, 2);

        const etranger = serieArrieres([propriete([echeance('2026-05', 'unpaid')])], '2026-05');
        expect(etranger.nets['2026-05']).toBeCloseTo(2.29, 2);
    });
});

describe('totalAffiche', () => {
    const serie = {
        coupons: { '2026-04': 2, '2026-05': 4, '2026-06': 6 },
        penalites: { '2026-04': 0, '2026-05': 1, '2026-06': 3 }
    };

    it('additionne les deux dettes au dernier mois affiché', () => {
        expect(totalAffiche(serie, ['2026-04', '2026-05', '2026-06'])).toBe(9);
    });

    it('suit la fenêtre affichée plutôt que tout l\'historique', () => {
        // La leçon du repère de versement moyen, qui restait figé à 252 € que
        // l'on regarde trois mois ou trois ans.
        expect(totalAffiche(serie, ['2026-04', '2026-05'])).toBe(5);
    });

    it('rend zéro sans série ni mois', () => {
        expect(totalAffiche(null, ['2026-04'])).toBe(0);
        expect(totalAffiche(serie, [])).toBe(0);
        expect(totalAffiche(serie, null)).toBe(0);
    });
});
