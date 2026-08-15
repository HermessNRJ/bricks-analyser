import { describe, it, expect } from 'vitest';
import { couponsEtrangersParMois, impotDifferre } from '../src/business/fiscalite.js';

const PROPRIETES = [
    { id: 'fr-1', country: 'France' },
    { id: 'pt-1', country: 'Portugal' },
    { id: 'es-1', country: 'Espagne' }
];

const VERSEMENTS = {
    'fr-1': { '2026-01': 40, '2026-02': 40 },
    'pt-1': { '2026-01': 4.35 },
    'es-1': { '2026-01': 3, '2026-02': 7.07 }
};

describe('couponsEtrangersParMois', () => {
    it('ne retient que les propriétés hors de France', () => {
        const parMois = couponsEtrangersParMois(VERSEMENTS, PROPRIETES);

        expect(parMois['2026-01']).toBeCloseTo(7.35, 2);
        expect(parMois['2026-02']).toBeCloseTo(7.07, 2);
    });

    it('ne rend rien sur un portefeuille entièrement français', () => {
        expect(couponsEtrangersParMois(VERSEMENTS, [PROPRIETES[0]])).toEqual({});
    });

    it('ignore une propriété absente de la ventilation', () => {
        const parMois = couponsEtrangersParMois({ 'fr-1': { '2026-01': 40 } }, PROPRIETES);

        expect(parMois).toEqual({});
    });

    it('ne rend rien sans ventilation ni propriétés', () => {
        expect(couponsEtrangersParMois(null, PROPRIETES)).toEqual({});
        expect(couponsEtrangersParMois(VERSEMENTS, null)).toEqual({});
    });
});

describe('impotDifferre', () => {
    const MENSUEL = {
        '2025-11': { parrainage: 10, boost: 1 },
        '2026-01': { parrainage: 0, boost: 2 }
    };

    it('chiffre l\'impôt au barème du mois d\'encaissement', () => {
        const differe = impotDifferre(MENSUEL, { '2026-01': 7.35 });

        // 11 € en 2025 au barème de 30 %, 9,35 € en 2026 à 31,4 %
        expect(differe.parAnnee['2025'].impot).toBeCloseTo(3.3, 2);
        expect(differe.parAnnee['2026'].impot).toBeCloseTo(2.94, 2);
        expect(differe.total.base).toBeCloseTo(20.35, 2);
    });

    it('ventile l\'assiette entre ses trois sources', () => {
        const differe = impotDifferre(MENSUEL, { '2026-01': 7.35 });

        expect(differe.parAnnee['2026'].etranger).toBeCloseTo(7.35, 2);
        expect(differe.parAnnee['2025'].parrainage).toBeCloseTo(10, 2);
        expect(differe.parAnnee['2025'].boost).toBeCloseTo(1, 2);
    });

    it('ne dit rien quand tout a subi la retenue à la source', () => {
        expect(impotDifferre({ '2026-01': { parrainage: 0, boost: 0 } }, {})).toBeNull();
        expect(impotDifferre({}, {})).toBeNull();
    });
});
