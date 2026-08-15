import { describe, it, expect } from 'vitest';
import {
    simulerProjection,
    rendementMoyenPondere,
    horizonMoyenPondere,
    rendementsNets,
    BORNES
} from '../src/business/forecast.js';
import { echantillonner, libelleMois } from '../src/charts/forecastChart.js';
import { CONFIG } from '../src/core/config.js';

const base = {
    capitalInitial: 1000,
    apportMensuel: 0,
    horizonMois: 12,
    tauxAnnuelBrut: 12,
    tauxImpaye: 0,
    reinvestir: false
};

describe('simulerProjection — mécanique', () => {
    it('produit un point par mois simulé', () => {
        const { serie } = simulerProjection({ ...base, horizonMois: 24 });

        expect(serie).toHaveLength(24);
        expect(serie[0].mois).toBe(1);
        expect(serie[23].mois).toBe(24);
    });

    it('applique le rendement mensuel puis la flat tax', () => {
        const { serie } = simulerProjection(base);

        // 1000 € à 12 % l'an = 10 € brut le premier mois, moins 30 % d'impôt
        expect(serie[0].revenuNetMensuel).toBeCloseTo(10 * (1 - CONFIG.TAX_RATE), 6);
        expect(serie[0].cumulImpots).toBeCloseTo(10 * CONFIG.TAX_RATE, 6);
    });

    it('laisse le capital constant sans apport ni réinvestissement', () => {
        const { capitalFinal, serie } = simulerProjection(base);

        expect(capitalFinal).toBe(1000);
        expect(serie.every(p => p.capital === 1000)).toBe(true);
    });

    it('ajoute l\'apport mensuel avant de calculer les revenus du mois', () => {
        const { serie } = simulerProjection({ ...base, capitalInitial: 0, apportMensuel: 1200 });

        // Le premier mois rapporte déjà sur les 1200 € versés
        expect(serie[0].capital).toBe(1200);
        expect(serie[0].revenuNetMensuel).toBeGreaterThan(0);
    });

    it('fait grossir le capital quand les revenus sont réinvestis', () => {
        const sans = simulerProjection(base);
        const avec = simulerProjection({ ...base, reinvestir: true });

        expect(avec.capitalFinal).toBeGreaterThan(sans.capitalFinal);
        expect(avec.cumulNet).toBeGreaterThan(sans.cumulNet);
    });

    it('cumule le total apporté sur la durée', () => {
        const { totalApporte } = simulerProjection({ ...base, apportMensuel: 50, horizonMois: 10 });

        expect(totalApporte).toBe(500);
    });
});

describe('simulerProjection — impayés', () => {
    it('ampute les revenus de la part impayée', () => {
        const sain = simulerProjection(base);
        const degrade = simulerProjection({ ...base, tauxImpaye: 25 });

        expect(degrade.cumulNet).toBeCloseTo(sain.cumulNet * 0.75, 6);
    });

    it('chiffre le brut perdu à cause des impayés', () => {
        const { cumulPerdu } = simulerProjection({ ...base, tauxImpaye: 50 });

        // 12 mois × 10 € de brut théorique, dont la moitié jamais perçue
        expect(cumulPerdu).toBeCloseTo(60, 6);
    });

    it('annule tout revenu à 100 % d\'impayés', () => {
        const { cumulNet, cumulImpots } = simulerProjection({ ...base, tauxImpaye: 100 });

        expect(cumulNet).toBe(0);
        expect(cumulImpots).toBe(0);
    });
});

describe('simulerProjection — saisies aberrantes', () => {
    it('borne un horizon démesuré', () => {
        const { horizonMois } = simulerProjection({ ...base, horizonMois: 99999 });

        expect(horizonMois).toBe(BORNES.horizonMois.max);
    });

    it('refuse un horizon nul en retombant sur le minimum', () => {
        expect(simulerProjection({ ...base, horizonMois: 0 }).serie).toHaveLength(1);
    });

    it('ramène un taux négatif à zéro', () => {
        const { cumulNet } = simulerProjection({ ...base, tauxAnnuelBrut: -5 });

        expect(cumulNet).toBe(0);
    });

    it('ignore un capital initial négatif', () => {
        expect(simulerProjection({ ...base, capitalInitial: -500 }).capitalInitial).toBe(0);
    });

    it('tolère des saisies non numériques', () => {
        const resultat = simulerProjection({
            capitalInitial: 'abc', apportMensuel: null, horizonMois: undefined,
            tauxAnnuelBrut: NaN, tauxImpaye: 'x'
        });

        expect(Number.isFinite(resultat.capitalFinal)).toBe(true);
        expect(resultat.capitalFinal).toBe(0);
    });

    it('fonctionne sans aucune hypothèse fournie', () => {
        expect(() => simulerProjection()).not.toThrow();
    });
});

describe('rendementMoyenPondere', () => {
    const bien = (investment, yearlyReturn, extra = {}) => ({
        investment, yearlyReturn, isRefunded: false, ...extra
    });

    it('pondère le rendement par le capital engagé', () => {
        // 900 € à 10 % et 100 € à 20 % → 11 %
        expect(rendementMoyenPondere([bien(900, 10), bien(100, 20)])).toBeCloseTo(11, 6);
    });

    it('écarte les projets remboursés', () => {
        const properties = [bien(100, 10), bien(0, 50, { isRefunded: true })];

        expect(rendementMoyenPondere(properties)).toBe(10);
    });

    it('renvoie zéro sans capital engagé', () => {
        expect(rendementMoyenPondere([])).toBe(0);
        expect(rendementMoyenPondere(null)).toBe(0);
    });
});

describe('echantillonner — lisibilité du graphique', () => {
    const serie = (n) => Array.from({ length: n }, (_, i) => ({ mois: i + 1 }));

    it('laisse une série courte intacte', () => {
        expect(echantillonner(serie(24))).toHaveLength(24);
    });

    it('réduit une longue série sous le plafond de points', () => {
        expect(echantillonner(serie(600)).length).toBeLessThanOrEqual(61);
    });

    it('choisit un pas qui tombe sur les bornes d\'année', () => {
        // Sans cela, l'axe n'afficherait un repère annuel qu'au dernier point
        const points = echantillonner(serie(120));

        expect(points.every(p => p.mois % 2 === 0)).toBe(true);
        expect(points.some(p => p.mois === 12)).toBe(true);
        expect(points.some(p => p.mois === 120)).toBe(true);
    });

    it('conserve toujours le dernier mois, qui porte le résultat', () => {
        const points = echantillonner(serie(599));

        expect(points[points.length - 1].mois).toBe(599);
    });

    it('tolère une série absente', () => {
        expect(echantillonner(null)).toEqual([]);
    });
});

describe('libelleMois', () => {
    it('compte en mois sur un horizon court', () => {
        expect(libelleMois(7, 12)).toBe('7 m');
    });

    it('ne marque que les années sur un horizon long', () => {
        expect(libelleMois(24, 120)).toBe('2 ans');
        expect(libelleMois(12, 120)).toBe('1 an');
        expect(libelleMois(7, 120)).toBe('');
    });
});

describe('horizonMoyenPondere', () => {
    const bien = (investment, investmentHorizonInMonths, extra = {}) => ({
        investment, investmentHorizonInMonths, isRefunded: false, ...extra
    });

    it('pondère la durée par le capital engagé', () => {
        // 900 € sur 12 mois et 100 € sur 120 mois → 22,8 mois
        expect(horizonMoyenPondere([bien(900, 12), bien(100, 120)])).toBeCloseTo(22.8, 6);
    });

    it('ignore les projets soldés ou sans durée connue', () => {
        const properties = [bien(100, 24), bien(100, 0), bien(100, 60, { isRefunded: true })];

        expect(horizonMoyenPondere(properties)).toBe(24);
    });

    it('renvoie zéro sans projet exploitable', () => {
        expect(horizonMoyenPondere([])).toBe(0);
        expect(horizonMoyenPondere(null)).toBe(0);
    });
});


describe('rendementsNets', () => {
    it('retranche le prélèvement du rendement brut', () => {
        // 10 % brut, flat tax 31,4 % → 6,86 % net
        expect(rendementsNets(10, 0, 0.314).apresImpot).toBeCloseTo(6.86, 10);
    });

    it('applique les impayés par-dessus le prélèvement', () => {
        // Le brut manquant n'est pas imposé : les deux effets se composent
        const { apresImpot, apresTout } = rendementsNets(10, 50, 0.314);

        expect(apresImpot).toBeCloseTo(6.86, 10);
        expect(apresTout).toBeCloseTo(3.43, 10);
    });

    it('laisse le net égal à l\'après-impôt sans impayés', () => {
        const { apresImpot, apresTout } = rendementsNets(9.6, 0, 0.314);

        expect(apresTout).toBeCloseTo(apresImpot, 10);
    });

    it('utilise le taux courant par défaut', () => {
        expect(rendementsNets(10).apresImpot)
            .toBeCloseTo(10 * (1 - CONFIG.TAX_RATE), 10);
    });

    it('tolère des saisies aberrantes', () => {
        expect(rendementsNets(-5, 0, 0.314).apresImpot).toBe(0);
        expect(rendementsNets('abc', 'x', 0.314).apresTout).toBe(0);
        expect(rendementsNets(10, 999, 0.314).apresTout).toBe(0);
    });
});
