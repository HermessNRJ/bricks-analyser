import { describe, it, expect } from 'vitest';
import { normaliserApports, serieOrigineFonds, moyenneVersements, estApport, estRetrait, reconcilierJournal } from '../src/business/apports.js';

/** Extrait réel du journal : un rechargement au milieu de coupons et de prélèvements */
const JOURNAL = [
    { id: 'a', kind: 'obligation_principal_repayment_partial', createdAt: '2026-08-11T09:19:36.162Z',
      status: 'confirmed', value: 320 },
    { id: 'b', kind: 'boosted_balance_gain', createdAt: '2026-08-11T06:04:01.345Z', status: 'confirmed', value: 1 },
    { id: 'c', kind: 'withholding_tax', createdAt: '2026-08-10T18:37:36.559Z', status: 'waiting', value: -1456 },
    { id: 'd', kind: 'recurring_revenue', createdAt: '2026-08-10T18:37:36.559Z', status: 'confirmed', value: 5083 },
    { id: 'e', kind: 'topup_checkout', createdAt: '2026-08-05T09:37:45.539Z', status: 'confirmed', value: 7407 },
    { id: 'f', kind: 'topup_checkout', createdAt: '2026-07-02T09:37:45.539Z', status: 'confirmed', value: 10000 },
    { id: 'g', kind: 'primary_purchase_with_refund', createdAt: '2026-08-06T14:05:31.952Z',
      status: 'confirmed', value: -5000 }
];

describe('estApport / estRetrait', () => {
    it('reconnaît le rechargement par carte', () => {
        expect(estApport('topup_checkout')).toBe(true);
    });

    it('reconnaît un moyen de paiement encore inconnu portant la même racine', () => {
        // Le vocabulaire n'est pas documenté : un virement SEPA ne doit pas
        // disparaître des apports au seul motif qu'on ne l'avait jamais croisé.
        expect(estApport('topup_bank_transfer')).toBe(true);
        expect(estApport('sepa_topup')).toBe(true);
    });

    it('ne prend pas un achat de briques pour un versement', () => {
        expect(estApport('primary_purchase_with_refund')).toBe(false);
        expect(estApport('recurring_revenue')).toBe(false);
        expect(estApport(undefined)).toBe(false);
    });

    it('reconnaît les sorties vers la banque, quel que soit le mot employé', () => {
        expect(estRetrait('withdrawal')).toBe(true);
        expect(estRetrait('wallet_payout')).toBe(true);
        expect(estRetrait('cash_out_request')).toBe(true);
        expect(estRetrait('topup_checkout')).toBe(false);
    });
});

describe('normaliserApports', () => {
    it('ne retient que les mouvements avec la banque', () => {
        const apports = normaliserApports(JOURNAL);

        expect(apports.nombre).toBe(2);
        expect(apports.total.depot).toBeCloseTo(174.07, 2);
        expect(apports.total.retrait).toBe(0);
        expect(apports.total.net).toBeCloseTo(174.07, 2);
    });

    it('range les versements par mois, en euros', () => {
        const apports = normaliserApports(JOURNAL);

        expect(apports.parMois['2026-08'].depot).toBeCloseTo(74.07, 2);
        expect(apports.parMois['2026-07'].depot).toBeCloseTo(100, 2);
    });

    it('cumule par année civile', () => {
        const apports = normaliserApports(JOURNAL);

        expect(apports.parAnnee['2026'].net).toBeCloseTo(174.07, 2);
    });

    it('défalque les retraits du montant sorti de la poche', () => {
        const apports = normaliserApports([
            { kind: 'topup_checkout', createdAt: '2026-01-04T00:00:00Z', status: 'confirmed', value: 50000 },
            { kind: 'withdrawal', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: -10000 }
        ]);

        expect(apports.total.depot).toBeCloseTo(500, 2);
        expect(apports.total.retrait).toBeCloseTo(100, 2);
        expect(apports.total.net).toBeCloseTo(400, 2);
    });

    it('compte un retrait pareillement, que son montant soit signé ou non', () => {
        const signe = normaliserApports([
            { kind: 'withdrawal', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: -10000 }
        ]);
        const positif = normaliserApports([
            { kind: 'withdrawal', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: 10000 }
        ]);

        expect(signe.total.retrait).toBeCloseTo(positif.total.retrait, 2);
    });

    it('ignore un versement annulé', () => {
        const apports = normaliserApports([
            { kind: 'topup_checkout', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: 5000 },
            { kind: 'topup_checkout', createdAt: '2026-03-05T00:00:00Z', status: 'failed', value: 90000 }
        ]);

        expect(apports.total.depot).toBeCloseTo(50, 2);
    });

    it('renvoie null quand le journal ne contient aucun mouvement bancaire', () => {
        expect(normaliserApports([JOURNAL[0], JOURNAL[1]])).toBeNull();
        expect(normaliserApports([])).toBeNull();
        expect(normaliserApports(null)).toBeNull();
    });

    it('écarte une transaction sans date lisible', () => {
        const apports = normaliserApports([
            { kind: 'topup_checkout', createdAt: 'hier', status: 'confirmed', value: 5000 },
            { kind: 'topup_checkout', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: 5000 }
        ]);

        expect(Object.keys(apports.parMois)).toEqual(['2026-03']);
    });
});

describe('serieOrigineFonds', () => {
    const MENSUEL = {
        '2026-01': { parrainage: 20, boost: 1 },
        '2026-02': { parrainage: 0, boost: 1.5 },
        '2026-03': { parrainage: 5, boost: 2 }
    };

    const APPORTS = normaliserApports([
        { kind: 'topup_checkout', createdAt: '2026-01-04T00:00:00Z', status: 'confirmed', value: 50000 },
        { kind: 'topup_checkout', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: 20000 }
    ]);

    it('donne le montant du mois, non le cumul', () => {
        const serie = serieOrigineFonds(APPORTS, MENSUEL);

        expect(serie.apports['2026-01']).toBeCloseTo(500, 2);
        expect(serie.apports['2026-03']).toBeCloseTo(200, 2);
        expect(serie.parrainage['2026-03']).toBeCloseTo(5, 2);
        expect(serie.boost['2026-03']).toBeCloseTo(2, 2);
    });

    it('marque d\'un zéro les mois sans mouvement', () => {
        const serie = serieOrigineFonds(APPORTS, MENSUEL);

        // Rien n'a été versé en février : la barre doit être absente, pas
        // héritée du mois précédent comme le faisait la courbe cumulée.
        expect(serie.apports['2026-02']).toBe(0);
        expect(serie.parrainage['2026-02']).toBe(0);
    });

    it('totalise chaque source', () => {
        const serie = serieOrigineFonds(APPORTS, MENSUEL);

        expect(serie.total.apports).toBeCloseTo(700, 2);
        expect(serie.total.parrainage).toBeCloseTo(25, 2);
    });

    it('signale l\'absence du journal plutôt que de tracer un zéro', () => {
        const serie = serieOrigineFonds(null, MENSUEL);

        expect(serie.apportsConnus).toBe(false);
        expect(serie.parrainage['2026-03']).toBeCloseTo(5, 2);
    });

    it('couvre les mois où l\'on a versé sans qu\'aucun revenu ne tombe', () => {
        const serie = serieOrigineFonds(APPORTS, { '2026-03': { parrainage: 5, boost: 2 } });

        expect(Object.keys(serie.apports)).toEqual(['2026-01', '2026-03']);
        expect(serie.apports['2026-01']).toBeCloseTo(500, 2);
        expect(serie.parrainage['2026-01']).toBe(0);
    });

    it('renvoie null quand rien n\'est connu', () => {
        expect(serieOrigineFonds(null, {})).toBeNull();
    });
});

describe('reconcilierJournal', () => {
    // Vocabulaire relevé sur un portefeuille réel
    const JOURNAL_COMPLET = [
        { kind: 'topup_card', status: 'confirmed', value: 50000 },
        { kind: 'topup_checkout', status: 'confirmed', value: 10000 },
        { kind: 'primary_purchase_with_refund', status: 'confirmed', value: -55000 },
        { kind: 'recurring_revenue', status: 'confirmed', value: 800 },
        { kind: 'withholding_tax', status: 'confirmed', value: -250 },
        { kind: 'obligation_principal_repayment_partial', status: 'confirmed', value: 300 },
        { kind: 'boosted_balance_gain', status: 'confirmed', value: 5 },
        { kind: 'refer_referrer', status: 'confirmed', value: 5000 }
    ];

    it('additionne toutes les lignes pour retrouver le solde', () => {
        const releve = reconcilierJournal(JOURNAL_COMPLET);

        // 500 + 100 - 550 + 8 - 2,50 + 3 + 0,05 + 50
        expect(releve.soldeCalcule).toBeCloseTo(108.55, 2);
    });

    it('range chaque nature dans sa catégorie', () => {
        const releve = reconcilierJournal(JOURNAL_COMPLET);

        expect(releve.parCategorie.apports).toBeCloseTo(600, 2);
        expect(releve.parCategorie.achats).toBeCloseTo(-550, 2);
        expect(releve.parCategorie.capital).toBeCloseTo(3, 2);
        expect(releve.parCategorie.impots).toBeCloseTo(-2.5, 2);
        expect(releve.parCategorie.revenus).toBeCloseTo(58.05, 2);
    });

    it('isole les natures qu\'il ne sait pas classer', () => {
        // C'est tout l'objet du contrôle : une nature inconnue doit se voir,
        // pas disparaître dans un total qui ne tombe plus juste.
        const releve = reconcilierJournal(
            JOURNAL_COMPLET.concat([{ kind: 'adjustment', status: 'confirmed', value: -149367 }])
        );

        expect(releve.nonClassees.adjustment).toContain('1 lignes');
        expect(releve.nonClassees.adjustment).toContain('-1493.67');
    });

    it('écarte un mouvement annulé', () => {
        const releve = reconcilierJournal(
            JOURNAL_COMPLET.concat([{ kind: 'topup_card', status: 'failed', value: 99900 }])
        );

        expect(releve.parCategorie.apports).toBeCloseTo(600, 2);
    });

    it('ne rend rien sur un journal vide', () => {
        expect(reconcilierJournal([])).toBeNull();
        expect(reconcilierJournal(null)).toBeNull();
    });
});

describe('statuts retenus', () => {
    it('écarte un rechargement refusé par la banque', () => {
        // `declined` : mauvais code, provision insuffisante. L'argent n'est
        // jamais arrivé, et le compter gonflait les apports de plus de mille
        // euros sur un portefeuille réel.
        const apports = normaliserApports([
            { kind: 'topup_card', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: 20000 },
            { kind: 'topup_card', createdAt: '2026-03-05T00:00:00Z', status: 'declined', value: 50000 }
        ]);

        expect(apports.total.depot).toBeCloseTo(200, 2);
    });

    it('écarte un achat annulé, projet non financé', () => {
        const releve = reconcilierJournal([
            { kind: 'topup_card', status: 'confirmed', value: 20000 },
            { kind: 'primary_purchase_with_refund', status: 'canceled', value: -15000 }
        ]);

        expect(releve.soldeCalcule).toBeCloseTo(200, 2);
        expect(releve.parCategorie.achats).toBeUndefined();
    });

    it('ignore par défaut un statut qu\'il ne connaît pas', () => {
        // Liste blanche : un statut inédit doit sous-estimer, jamais compter
        // comme encaissé un mouvement qui ne l'a peut-être pas été.
        const apports = normaliserApports([
            { kind: 'topup_card', createdAt: '2026-03-04T00:00:00Z', status: 'confirmed', value: 20000 },
            { kind: 'topup_card', createdAt: '2026-03-05T00:00:00Z', status: 'quelque_chose', value: 90000 }
        ]);

        expect(apports.total.depot).toBeCloseTo(200, 2);
    });

    it('retient un mouvement encore en route', () => {
        const apports = normaliserApports([
            { kind: 'topup_card', createdAt: '2026-03-04T00:00:00Z', status: 'waiting', value: 20000 }
        ]);

        expect(apports.total.depot).toBeCloseTo(200, 2);
    });
});

describe('moyenneVersements', () => {
    const SERIE = { '2026-01': 300, '2026-02': 0, '2026-03': 400, '2026-04': 500 };

    it('moyenne sur les mois demandés, et rien qu\'eux', () => {
        // Le repère du graphique se calait sur tout l'historique alors que les
        // barres n'affichaient qu'une fenêtre : il ne bougeait jamais.
        expect(moyenneVersements(SERIE, ['2026-03', '2026-04'])).toBeCloseTo(450, 2);
        expect(moyenneVersements(SERIE, Object.keys(SERIE))).toBeCloseTo(300, 2);
    });

    it('compte les mois sans versement au dénominateur', () => {
        // Une pause de six mois divise le rythme par deux : c'est l'information
        // cherchée, pas un mois à écarter.
        expect(moyenneVersements(SERIE, ['2026-01', '2026-02'])).toBeCloseTo(150, 2);
    });

    it('traite un mois absent de la série comme un mois à zéro', () => {
        expect(moyenneVersements(SERIE, ['2026-04', '2026-05'])).toBeCloseTo(250, 2);
    });

    it('renvoie zéro faute de mois ou de série', () => {
        expect(moyenneVersements(SERIE, [])).toBe(0);
        expect(moyenneVersements(SERIE, null)).toBe(0);
        expect(moyenneVersements(null, ['2026-01'])).toBe(0);
    });
});
