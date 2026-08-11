import { describe, it, expect } from 'vitest';
import { moisDepuisIndex, normaliserHistoriqueRevenus, serieMensuelle } from '../src/business/revenueHistory.js';
import { calculateInvestmentStats } from '../src/business/calculations.js';

/**
 * Extrait de l'état de compte réel : juillet et août 2026.
 * Bricks compte les mois à partir de zéro et les montants en centimes, deux
 * conventions qu'une lecture naïve inverse ou multiplie par cent.
 */
const RELEVE = {
    revenuesTotal: {
        untaxedTotal: 11108,
        taxedTotal: 8111,
        revenues: {
            withholdingTax: { total: -2997, byRate: [{ taxRate: 31.4, total: -2997 }] }
        }
    },
    revenuesByYearAndMonth: [
        {
            year: 2026,
            month: 6,
            untaxedTotal: 6017,
            taxedTotal: 4476,
            revenues: {
                referrals: { total: 0 },
                boostedBalanceGain: { total: 23 },
                obligationCoupons: { untaxedTotal: 5994, taxedTotal: 4453 },
                withholdingTax: { total: -1541, byRate: [{ taxRate: 31.4, total: -1541 }] }
            }
        },
        {
            year: 2026,
            month: 7,
            untaxedTotal: 5091,
            taxedTotal: 3635,
            revenues: {
                referrals: { total: 0 },
                boostedBalanceGain: { total: 8 },
                obligationCoupons: { untaxedTotal: 5083, taxedTotal: 3627 },
                withholdingTax: { total: -1456, byRate: [{ taxRate: 31.4, total: -1456 }] }
            }
        }
    ]
};

describe('moisDepuisIndex', () => {
    it('décale l\'index de mois, janvier valant zéro', () => {
        expect(moisDepuisIndex(2026, 0)).toBe('2026-01');
        expect(moisDepuisIndex(2026, 6)).toBe('2026-07');
        expect(moisDepuisIndex(2023, 11)).toBe('2023-12');
    });

    it('rejette les couples hors bornes ou non entiers', () => {
        expect(moisDepuisIndex(2026, 12)).toBeNull();
        expect(moisDepuisIndex(2026, -1)).toBeNull();
        expect(moisDepuisIndex(1999, 5)).toBeNull();
        expect(moisDepuisIndex('2026', 5)).toBeNull();
        expect(moisDepuisIndex(2026, undefined)).toBeNull();
    });
});

describe('normaliserHistoriqueRevenus', () => {
    it('convertit les centimes en euros sur le bon mois', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        expect(historique.mensuel['2026-07']).toEqual({
            brut: 60.17,
            net: 44.76,
            impot: 15.41,
            coupons: 59.94,
            parrainage: 0,
            boost: 0.23
        });
    });

    it('retient le prélèvement en valeur absolue', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        expect(historique.mensuel['2026-08'].impot).toBe(14.56);
        expect(historique.mensuel['2026-08'].net).toBe(36.35);
    });

    it('boucle : brut moins impôt vaut le net, mois par mois', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        Object.values(historique.mensuel).forEach(mois => {
            expect(mois.brut - mois.impot).toBeCloseTo(mois.net, 2);
        });
    });

    it('totalise depuis les mois, pour coller à ce que trace la courbe', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        expect(historique.total.net).toBeCloseTo(44.76 + 36.35, 2);
        expect(historique.total.brut).toBeCloseTo(60.17 + 50.91, 2);
        expect(historique.total.impot).toBeCloseTo(15.41 + 14.56, 2);
    });

    it('borne la plage sur les mois réellement versés', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        expect(historique.premierMois).toBe('2026-07');
        expect(historique.dernierMois).toBe('2026-08');
    });

    it('renvoie null quand il n\'y a rien d\'exploitable', () => {
        expect(normaliserHistoriqueRevenus(null)).toBeNull();
        expect(normaliserHistoriqueRevenus({})).toBeNull();
        expect(normaliserHistoriqueRevenus({ revenuesByYearAndMonth: [] })).toBeNull();
        expect(normaliserHistoriqueRevenus({ revenuesByYearAndMonth: [{ year: 2026, month: 99 }] })).toBeNull();
    });

    it('supporte un mois sans bloc de revenus détaillé', () => {
        const historique = normaliserHistoriqueRevenus({
            revenuesByYearAndMonth: [{ year: 2023, month: 11, untaxedTotal: 62, taxedTotal: 62 }]
        });

        expect(historique.mensuel['2023-12']).toEqual({
            brut: 0.62, net: 0.62, impot: 0, coupons: 0, parrainage: 0, boost: 0
        });
    });
});

describe('ventilation par année', () => {
    it('regroupe les mois par année civile', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        expect(Object.keys(historique.parAnnee)).toEqual(['2026']);
        expect(historique.parAnnee['2026']).toEqual({
            brut: 111.08,
            net: 81.11,
            impot: 29.97,
            coupons: 110.77,
            parrainage: 0,
            boost: 0.31
        });
    });

    it('sépare les années sans les mélanger', () => {
        const historique = normaliserHistoriqueRevenus({
            revenuesByYearAndMonth: [
                { year: 2024, month: 11, untaxedTotal: 1000, taxedTotal: 800,
                  revenues: { referrals: { total: 100 }, obligationCoupons: { untaxedTotal: 900 },
                              withholdingTax: { total: -200 } } },
                { year: 2025, month: 0, untaxedTotal: 500, taxedTotal: 420,
                  revenues: { boostedBalanceGain: { total: 20 }, obligationCoupons: { untaxedTotal: 480 },
                              withholdingTax: { total: -80 } } }
            ]
        });

        expect(historique.parAnnee['2024'].parrainage).toBe(1);
        expect(historique.parAnnee['2024'].boost).toBe(0);
        expect(historique.parAnnee['2025'].boost).toBe(0.2);
        expect(historique.parAnnee['2025'].parrainage).toBe(0);
    });

    it('boucle : coupons moins prélèvement, plus le versé brut, vaut le net', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        Object.values(historique.parAnnee).forEach(annee => {
            const attendu = annee.coupons - annee.impot + annee.parrainage + annee.boost;
            expect(attendu).toBeCloseTo(annee.net, 2);
        });
    });

    it('rétablit le centime malgré le cumul de flottants', () => {
        const historique = normaliserHistoriqueRevenus({
            revenuesByYearAndMonth: Array.from({ length: 12 }, (_, month) => ({
                year: 2025, month, untaxedTotal: 10, taxedTotal: 7,
                revenues: { boostedBalanceGain: { total: 1 }, obligationCoupons: { untaxedTotal: 9 },
                            withholdingTax: { total: -3 } }
            }))
        });

        expect(historique.parAnnee['2025'].boost).toBe(0.12);
        expect(historique.parAnnee['2025'].brut).toBe(1.2);
    });
});

describe('serieMensuelle', () => {
    it('projette un champ en série datée et triée', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);

        expect(serieMensuelle(historique, 'net')).toEqual({
            '2026-07': 44.76,
            '2026-08': 36.35
        });
        expect(Object.keys(serieMensuelle(historique, 'impot'))).toEqual(['2026-07', '2026-08']);
    });

    it('ne casse pas sans historique', () => {
        expect(serieMensuelle(null, 'net')).toEqual({});
        expect(serieMensuelle({}, 'net')).toEqual({});
    });
});

describe('calculateInvestmentStats avec l\'état de compte', () => {
    const portefeuille = [{
        yearMonthDate: '2026-07',
        projects: [{
            id: 'p1',
            name: { fr: 'Projet témoin' },
            ownedBricks: 10,
            brickPrice: 1000,
            yearlyTotalRentabilityPercentage: 10,
            funding: { revenueStartDate: '2026-07' }
        }]
    }];

    it('substitue les montants perçus à l\'estimation', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);
        const resultats = calculateInvestmentStats(portefeuille, [], {}, historique);

        expect(resultats.totalNetRevenueSinceBeginning).toBeCloseTo(historique.total.net, 2);
        expect(resultats.totalTaxesSinceBeginning).toBeCloseTo(historique.total.impot, 2);
        expect(resultats.revenusReels.net['2026-07']).toBe(44.76);
    });

    it('transmet la ventilation annuelle jusqu\'à l\'écran', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);
        const resultats = calculateInvestmentStats(portefeuille, [], {}, historique);

        expect(resultats.revenusReels.parAnnee).toEqual(historique.parAnnee);
        expect(resultats.revenusReels.parAnnee['2026'].boost).toBe(0.31);
    });

    it('conserve l\'estimation à part, pour comparaison', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);
        const resultats = calculateInvestmentStats(portefeuille, [], {}, historique);
        const sansHistorique = calculateInvestmentStats(portefeuille, [], {});

        expect(resultats.totalNetRevenueEstime)
            .toBeCloseTo(sansHistorique.totalNetRevenueSinceBeginning, 2);
        expect(resultats.totalNetRevenueEstime)
            .not.toBeCloseTo(resultats.totalNetRevenueSinceBeginning, 2);
    });

    it('retombe sur l\'estimation quand l\'état de compte manque', () => {
        const resultats = calculateInvestmentStats(portefeuille, [], {}, null);

        expect(resultats.revenusReels).toBeNull();
        expect(resultats.totalNetRevenueSinceBeginning)
            .toBeCloseTo(resultats.totalNetRevenueEstime, 2);
    });

    it('signale le mois courant comme inachevé, et lui seul', () => {
        const moisCourant = new Date().toISOString().slice(0, 7);
        const [annee, mois] = moisCourant.split('-').map(Number);

        const historique = normaliserHistoriqueRevenus({
            revenuesByYearAndMonth: [{
                year: annee,
                month: mois - 1,
                untaxedTotal: 1000,
                taxedTotal: 686,
                revenues: { withholdingTax: { total: -314 } }
            }]
        });

        const resultats = calculateInvestmentStats(portefeuille, [], {}, historique);
        expect(resultats.revenusReels.moisPartiel).toBe(moisCourant);
    });

    it('ne confronte l\'attendu que sur les douze derniers mois', () => {
        // Quinze mois d'historique : la confrontation ne doit en retenir que douze,
        // au-delà l'attendu sous-estime faute des projets remboursés depuis.
        const mois = Array.from({ length: 15 }, (_, i) => ({
            year: 2025, month: i - 3, untaxedTotal: 1000, taxedTotal: 686,
            revenues: { withholdingTax: { total: -314 } }
        })).map(m => m.month < 0
            ? { ...m, year: 2024, month: m.month + 12 }
            : m);

        const historique = normaliserHistoriqueRevenus({ revenuesByYearAndMonth: mois });
        const anciens = [{
            yearMonthDate: '2024-10',
            projects: [{
                id: 'p1', name: { fr: 'Projet témoin' }, ownedBricks: 10, brickPrice: 1000,
                yearlyTotalRentabilityPercentage: 10, funding: { revenueStartDate: '2024-10' }
            }]
        }];

        const resultats = calculateInvestmentStats(anciens, [], {}, historique);

        expect(Object.keys(resultats.revenusReels.attendu)).toHaveLength(12);
        expect(resultats.revenusReels.debutComparaison).toBe('2025-01');
        expect(resultats.revenusReels.mensuel['2024-10']).toBeDefined();
        expect(resultats.revenusReels.attendu['2024-10']).toBeUndefined();
    });

    it('chiffre le manque à gagner sur le dernier mois révolu', () => {
        const historique = normaliserHistoriqueRevenus(RELEVE);
        const resultats = calculateInvestmentStats(portefeuille, [], {}, historique);
        const ecart = resultats.revenusReels.ecart;

        // Août est le mois courant : l'écart doit porter sur juillet
        expect(ecart.mois).toBe('2026-07');
        expect(ecart.percu).toBe(44.76);
        expect(ecart.manque).toBeCloseTo(ecart.attendu - ecart.percu, 6);
    });

    it('ne signale rien quand l\'historique s\'arrête à un mois révolu', () => {
        const revolu = normaliserHistoriqueRevenus({
            revenuesByYearAndMonth: [{
                year: 2024, month: 0, untaxedTotal: 1000, taxedTotal: 700,
                revenues: { withholdingTax: { total: -300 } }
            }]
        });

        const resultats = calculateInvestmentStats(portefeuille, [], {}, revolu);
        expect(resultats.revenusReels.moisPartiel).toBeNull();
    });
});
