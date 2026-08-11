import { describe, it, expect } from 'vitest';
import { normaliserTransactions } from '../src/business/walletHistory.js';

/** Extrait réel du journal : remboursements, coupon groupé, prélèvement, solde boosté */
const JOURNAL = [
    { id: 'a', kind: 'obligation_principal_repayment_partial', createdAt: '2026-08-11T09:19:36.162Z',
      status: 'confirmed', value: 320, propertyName: 'Immeuble Dr Ferdinand Gendre' },
    { id: 'b', kind: 'obligation_principal_repayment_partial', createdAt: '2026-08-11T08:25:49.948Z',
      status: 'confirmed', value: 374, propertyName: 'Lotissement Tiefenbach Colmar' },
    { id: 'c', kind: 'boosted_balance_gain', createdAt: '2026-08-11T06:04:01.345Z', status: 'confirmed', value: 1 },
    { id: 'd', kind: 'withholding_tax', createdAt: '2026-08-10T18:37:36.559Z', status: 'waiting', value: -1456 },
    { id: 'e', kind: 'recurring_revenue', createdAt: '2026-08-10T18:37:36.559Z', status: 'confirmed', value: 5083 },
    { id: 'f', kind: 'topup_checkout', createdAt: '2026-08-05T09:37:45.539Z', status: 'confirmed', value: 7407 },
    { id: 'g', kind: 'obligation_principal_repayment_partial', createdAt: '2026-07-05T08:10:23.276Z',
      status: 'confirmed', value: 1774, propertyName: 'Immeuble Foch Béziers' },
    { id: 'h', kind: 'primary_purchase_with_refund', createdAt: '2026-08-06T14:05:31.952Z',
      status: 'confirmed', value: -5000 }
];

describe('normaliserTransactions', () => {
    it('ne retient que les remboursements de capital', () => {
        const capital = normaliserTransactions(JOURNAL);

        // Ni le coupon, ni le prélèvement, ni le versement, ni l'achat
        expect(capital.nombre).toBe(3);
        expect(capital.total).toBeCloseTo(24.68, 2);
    });

    it('range les remboursements par mois, en euros', () => {
        const capital = normaliserTransactions(JOURNAL);

        expect(capital.parMois['2026-08']).toBeCloseTo(6.94, 2);
        expect(capital.parMois['2026-07']).toBeCloseTo(17.74, 2);
    });

    it('cumule par année civile', () => {
        const capital = normaliserTransactions(JOURNAL);

        expect(capital.parAnnee['2026']).toBeCloseTo(24.68, 2);
    });

    it('reconnaît un solde total, pas seulement un remboursement partiel', () => {
        const capital = normaliserTransactions([
            { kind: 'obligation_principal_repayment_total', createdAt: '2026-03-04T00:00:00Z',
              status: 'confirmed', value: 5000 }
        ]);

        expect(capital.total).toBe(50);
    });

    it('compte les mouvements en attente, qui restent dus', () => {
        const capital = normaliserTransactions([
            { kind: 'obligation_principal_repayment_partial', createdAt: '2026-03-04T00:00:00Z',
              status: 'waiting', value: 1000 }
        ]);

        expect(capital.total).toBe(10);
    });

    it('écarte les mouvements annulés', () => {
        const capital = normaliserTransactions([
            { kind: 'obligation_principal_repayment_partial', createdAt: '2026-03-04T00:00:00Z',
              status: 'confirmed', value: 1000 },
            { kind: 'obligation_principal_repayment_partial', createdAt: '2026-03-05T00:00:00Z',
              status: 'cancelled', value: 9999 }
        ]);

        expect(capital.total).toBe(10);
        expect(capital.nombre).toBe(1);
    });

    it('renvoie null sans remboursement, plutôt qu\'un total de zéro', () => {
        expect(normaliserTransactions([])).toBeNull();
        expect(normaliserTransactions(null)).toBeNull();
        expect(normaliserTransactions([JOURNAL[2], JOURNAL[4]])).toBeNull();
    });

    it('ignore une ligne sans date exploitable', () => {
        const capital = normaliserTransactions([
            { kind: 'obligation_principal_repayment_partial', createdAt: 'hier', status: 'confirmed', value: 1000 },
            { kind: 'obligation_principal_repayment_partial', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: 500 }
        ]);

        expect(capital.nombre).toBe(1);
        expect(capital.total).toBe(5);
    });
});
