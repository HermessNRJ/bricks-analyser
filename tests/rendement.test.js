import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { capitalDeploye, calculerRendements, capitalImpliciteParMois } from '../src/business/rendement.js';

beforeEach(() => {
    vi.useFakeTimers();
    // Le mois courant est écarté des fenêtres : on se place en juillet pour que
    // juin soit le dernier mois révolu.
    vi.setSystemTime(new Date(2026, 6, 12));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('capitalDeploye', () => {
    const MOIS = ['2026-01', '2026-02', '2026-03', '2026-04'];

    it('reporte l\'investissement des mois sans achat', () => {
        const serie = capitalDeploye({ '2026-01': 1000, '2026-03': 1500 }, null, MOIS);

        expect(serie['2026-01']).toBe(1000);
        expect(serie['2026-02']).toBe(1000);
        expect(serie['2026-03']).toBe(1500);
        expect(serie['2026-04']).toBe(1500);
    });

    it('rend aux mois anciens le capital remboursé depuis', () => {
        // Un projet de 400 € remboursé en mars était bien placé en janvier et
        // février, alors qu'il vaut zéro dans l'investissement d'aujourd'hui.
        const serie = capitalDeploye(
            { '2026-01': 1000 },
            { '2026-03': 400 },
            MOIS
        );

        expect(serie['2026-01']).toBe(1400);
        expect(serie['2026-02']).toBe(1400);
        expect(serie['2026-03']).toBe(1000);
        expect(serie['2026-04']).toBe(1000);
    });

    it('tient compte d\'un remboursement postérieur à la fenêtre', () => {
        // Ce qui a été rendu en juin était placé pendant tout le trimestre
        const serie = capitalDeploye({ '2026-01': 1000 }, { '2026-06': 200 }, MOIS);

        expect(serie['2026-04']).toBe(1200);
    });

    it('n\'injecte pas dans un mois du capital qui n\'y était pas encore placé', () => {
        // Le portefeuille ne pesait qu'un dixième de sa taille actuelle en
        // janvier : lui rendre l'intégralité des 900 € remboursés depuis en
        // ferait un capital de 1 000 € pour 100 € réellement investis, et le
        // rendement du mois s'effondrerait d'autant.
        const serie = capitalDeploye(
            { '2026-01': 100, '2026-04': 1000 },
            { '2026-04': 900 },
            MOIS
        );

        expect(serie['2026-01']).toBeCloseTo(190, 0);
        // Au dernier mois il ne reste rien à rendre : on retombe sur l'investissement
        expect(serie['2026-04']).toBe(1000);
    });

    it('ne descend jamais sous zéro', () => {
        const serie = capitalDeploye({}, { '2026-02': 500 }, MOIS);

        expect(serie['2026-04']).toBe(0);
    });

    it('renvoie une série vide sans mois à couvrir', () => {
        expect(capitalDeploye({ '2026-01': 1000 }, null, [])).toEqual({});
    });
});

describe('calculerRendements', () => {
    /**
     * Six mois révolus sur 1 200 € placés, sans capital caché : le barème 2026
     * est à 31,4 %, donc 14,58 € de coupons pour 4,58 € de prélèvement laissent
     * 10 € nets par mois — soit 10 % l'an.
     */
    const mois = (net, extras = 0) => {
        const interets = net - extras;
        const brut = interets / (1 - 0.314);
        return {
            net, brut: brut + extras, coupons: brut, impot: brut * 0.314,
            parrainage: extras, boost: 0
        };
    };

    const MENSUEL = {
        '2026-01': mois(10), '2026-02': mois(10), '2026-03': mois(10),
        '2026-04': mois(10), '2026-05': mois(10), '2026-06': mois(10),
        '2026-07': mois(2)
    };

    const INVESTISSEMENT = { '2026-01': 1200 };

    it('annualise le perçu sur le capital placé', () => {
        const { fenetres } = calculerRendements({
            mensuel: MENSUEL,
            moisPartiel: '2026-07',
            investmentEvolution: INVESTISSEMENT
        });

        const surUnMois = fenetres.find(f => f.fenetre === 1);

        expect(surUnMois.taux).toBeCloseTo(10, 1);
        expect(surUnMois.net).toBeCloseTo(10, 2);
        expect(surUnMois.capitalMoyen).toBeCloseTo(1200, 2);
    });

    it('écarte le mois en cours, qui n\'est pas terminé', () => {
        const { fenetres, dernierMois } = calculerRendements({
            mensuel: MENSUEL,
            moisPartiel: '2026-07',
            investmentEvolution: INVESTISSEMENT
        });

        expect(dernierMois).toBe('2026-06');
        // Juillet et ses 2 € ne doivent tirer aucune fenêtre vers le bas
        expect(fenetres.find(f => f.fenetre === 1).net).toBeCloseTo(10, 2);
    });

    it('écarte le mois courant même sans qu\'on l\'ait signalé partiel', () => {
        const { dernierMois } = calculerRendements({
            mensuel: MENSUEL,
            investmentEvolution: INVESTISSEMENT
        });

        expect(dernierMois).toBe('2026-06');
    });

    it('ne propose pas une fenêtre plus longue que l\'historique', () => {
        const { fenetres } = calculerRendements({
            mensuel: MENSUEL,
            moisPartiel: '2026-07',
            investmentEvolution: INVESTISSEMENT
        });

        // Six mois révolus : 1, 3 et 6 tiennent, douze non
        expect(fenetres.map(f => f.fenetre)).toEqual([1, 3, 6, null]);
    });

    it('rapporte les revenus anciens au capital de l\'époque', () => {
        // Le portefeuille a doublé en mars. Rapporter les six mois au capital
        // d'aujourd'hui donnerait un rendement moitié moindre que la réalité.
        const { fenetres } = calculerRendements({
            mensuel: MENSUEL,
            moisPartiel: '2026-07',
            investmentEvolution: { '2026-01': 1200, '2026-04': 2400 }
        });

        const total = fenetres.find(f => f.fenetre === null);

        // Capital moyen : trois mois à 1 200 €, trois à 2 400 €
        expect(total.capitalMoyen).toBeCloseTo(1800, 2);
        expect(total.taux).toBeCloseTo(6.7, 1);
    });

    it('signale que le journal n\'a pas été lu', () => {
        const sansJournal = calculerRendements({
            mensuel: MENSUEL, moisPartiel: '2026-07', investmentEvolution: INVESTISSEMENT
        });
        const avecJournal = calculerRendements({
            mensuel: MENSUEL, moisPartiel: '2026-07', investmentEvolution: INVESTISSEMENT,
            capitalParMois: { '2026-05': 3 }
        });

        expect(sansJournal.journalLu).toBe(false);
        expect(avecJournal.journalLu).toBe(true);
    });

    it('écarte le capital caché dans la ligne de coupons', () => {
        // 40 € de coupons pour 4,58 € de prélèvement : au barème de 31,4 %,
        // seuls 14,58 € étaient imposables. Les 25,42 € restants sont du capital
        // qui revient, et n'ont rien à faire dans un rendement.
        const { fenetres } = calculerRendements({
            mensuel: { '2026-06': { net: 35.42, brut: 40, coupons: 40, impot: 4.58 } },
            investmentEvolution: INVESTISSEMENT
        });

        const surUnMois = fenetres[0];

        expect(surUnMois.net).toBeCloseTo(10, 1);
        expect(surUnMois.capitalRendu).toBeCloseTo(25.42, 1);
        expect(surUnMois.taux).toBeCloseTo(10, 1);
    });

    it('ne déduit jamais plus d\'intérêts que la ligne de coupons n\'en porte', () => {
        // Un prélèvement anormalement élevé — barème mal aligné, régularisation —
        // ferait sinon dépasser les intérêts au-delà de ce qui a été versé.
        const { fenetres } = calculerRendements({
            mensuel: { '2026-06': { net: 6, brut: 10, coupons: 10, impot: 4 } },
            investmentEvolution: INVESTISSEMENT
        });

        expect(fenetres[0].brut).toBeCloseTo(10, 2);
        expect(fenetres[0].capitalRendu).toBe(0);
    });

    it('garde les coupons entiers quand aucun prélèvement n\'a été retenu', () => {
        // Rien ne prouve qu'il s'y cache du capital : les effacer serait pire
        const { fenetres } = calculerRendements({
            mensuel: { '2026-06': { net: 10, brut: 10, coupons: 10, impot: 0 } },
            investmentEvolution: INVESTISSEMENT
        });

        expect(fenetres[0].net).toBeCloseTo(10, 2);
        expect(fenetres[0].capitalRendu).toBe(0);
    });

    it('rapporte le taux annoncé par Bricks, pour comparaison', () => {
        const avec = calculerRendements({
            mensuel: MENSUEL, moisPartiel: '2026-07',
            investmentEvolution: INVESTISSEMENT, tauxPromis: 9.6
        });
        const sans = calculerRendements({
            mensuel: MENSUEL, moisPartiel: '2026-07', investmentEvolution: INVESTISSEMENT
        });

        expect(avec.tauxPromis).toBe(9.6);
        expect(sans.tauxPromis).toBeNull();
    });

    it('isole ce qui ne vient pas des propriétés', () => {
        const { fenetres } = calculerRendements({
            mensuel: {
                '2026-05': mois(10),
                '2026-06': mois(40.5, 30.5)
            },
            investmentEvolution: INVESTISSEMENT
        });

        // Un parrainage gonfle le rendement du mois sans que le capital y soit
        // pour rien : la tuile doit pouvoir le dire au survol.
        expect(fenetres.find(f => f.fenetre === 1).horsCoupons).toBeCloseTo(30.5, 2);
    });

    it('renvoie null sans le moindre mois révolu', () => {
        expect(calculerRendements({
            mensuel: { '2026-07': mois(2) },
            moisPartiel: '2026-07',
            investmentEvolution: INVESTISSEMENT
        })).toBeNull();

        expect(calculerRendements({})).toBeNull();
    });

    it('renvoie null quand aucun capital n\'a jamais été placé', () => {
        expect(calculerRendements({
            mensuel: MENSUEL,
            moisPartiel: '2026-07',
            investmentEvolution: {}
        })).toBeNull();
    });
});

describe('capitalImpliciteParMois', () => {
    it('déduit le capital de la part non imposée des coupons', () => {
        // 40 € de coupons, 4,58 € de prélèvement : au barème de 31,4 %, seuls
        // 14,58 € étaient imposables, les 25,42 € restants sont du capital.
        const implicite = capitalImpliciteParMois({
            '2026-06': { coupons: 40, impot: 4.58 }
        });

        expect(implicite['2026-06']).toBeCloseTo(25.42, 1);
    });

    it('ne voit aucun capital là où le prélèvement couvre tout', () => {
        const implicite = capitalImpliciteParMois({
            '2026-06': { coupons: 14.58, impot: 4.58 }
        });

        expect(implicite['2026-06']).toBeCloseTo(0, 1);
    });

    it('ne rend rien sans état de compte', () => {
        expect(capitalImpliciteParMois(null)).toEqual({});
    });
});
