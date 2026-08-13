import { describe, it, expect } from 'vitest';
import {
    ETATS,
    MOIS_CARNET,
    moisReferenceVersements,
    etatVersement,
    carnetVersements,
    compterVersements,
    annoterVersements
} from '../src/business/versements.js';

/**
 * Un portefeuille miniature : une propriété régulière, une muette depuis deux
 * mois, une qui n'a pas encore commencé, une remboursée.
 */
const VERSEMENTS = {
    reguliere: { '2026-05': 4.2, '2026-06': 4.2, '2026-07': 4.2, '2026-08': 4.53 },
    muette: { '2026-05': 3, '2026-06': 3 },
    soldee: { '2026-05': 2, '2026-06': 12.5 }
};

function propriete(extra = {}) {
    return {
        id: 'reguliere',
        isRefunded: false,
        projectStatus: 'financed',
        revenueStartDate: '2026-05',
        ...extra
    };
}

describe('moisReferenceVersements', () => {
    it('retient le dernier mois versé, toutes propriétés confondues', () => {
        expect(moisReferenceVersements(VERSEMENTS)).toBe('2026-08');
    });

    it('rend null quand rien n\'a jamais été versé', () => {
        expect(moisReferenceVersements({})).toBeNull();
        expect(moisReferenceVersements(null)).toBeNull();
    });
});

describe('etatVersement', () => {
    it('marque comme versée une propriété présente au mois de référence', () => {
        const etat = etatVersement(propriete(), VERSEMENTS, '2026-08');

        expect(etat.etat).toBe(ETATS.VERSE);
        expect(etat.montant).toBe(4.53);
    });

    it('signale l\'absence de versement et rappelle le dernier reçu', () => {
        const etat = etatVersement(propriete({ id: 'muette' }), VERSEMENTS, '2026-08');

        expect(etat.etat).toBe(ETATS.MANQUANT);
        expect(etat.dernierMois).toBe('2026-06');
    });

    it('ne réclame rien à un projet remboursé', () => {
        const etat = etatVersement(
            propriete({ id: 'soldee', isRefunded: true }), VERSEMENTS, '2026-08'
        );

        expect(etat.etat).toBe(ETATS.SOLDE);
    });

    it('ne réclame rien à un projet encore en financement', () => {
        const etat = etatVersement(
            propriete({ id: 'neuve', projectStatus: 'ongoing' }), VERSEMENTS, '2026-08'
        );

        expect(etat).toEqual({ etat: ETATS.ATTENDU, motif: 'financement' });
    });

    it('attend la date annoncée avant de réclamer un premier versement', () => {
        const etat = etatVersement(
            propriete({ id: 'neuve', revenueStartDate: '2026-11' }), VERSEMENTS, '2026-08'
        );

        expect(etat.etat).toBe(ETATS.ATTENDU);
        expect(etat.debut).toBe('2026-11');
    });

    it('réclame un versement passée la date annoncée, même sans historique', () => {
        const etat = etatVersement(
            propriete({ id: 'neuve', revenueStartDate: '2026-02' }), VERSEMENTS, '2026-08'
        );

        expect(etat.etat).toBe(ETATS.MANQUANT);
        expect(etat.dernierMois).toBeNull();
    });

    // Une propriété achetée hier, sans date annoncée, n'a rien à se reprocher :
    // seul un versement déjà reçu prouve qu'elle devait en verser un autre.
    it('ne réclame rien faute de date annoncée et d\'historique', () => {
        const etat = etatVersement(
            propriete({ id: 'inconnue', revenueStartDate: null }), VERSEMENTS, '2026-08'
        );

        expect(etat).toEqual({ etat: ETATS.ATTENDU, motif: 'inconnu' });
    });

    it('ne dit rien sans relevé ni mois de référence valide', () => {
        expect(etatVersement(propriete(), null, '2026-08').etat).toBe(ETATS.INCONNU);
        expect(etatVersement(propriete(), VERSEMENTS, 'juillet').etat).toBe(ETATS.INCONNU);
    });

    // Le mois de référence suit le relevé, pas l'horloge : un cache d'un mois
    // doit se juger sur le dernier mois qu'il connaît.
    it('juge le mois demandé, pas le plus récent', () => {
        const etat = etatVersement(propriete({ id: 'muette' }), VERSEMENTS, '2026-06');

        expect(etat.etat).toBe(ETATS.VERSE);
        expect(etat.montant).toBe(3);
    });
});

describe('carnetVersements', () => {
    it('couvre les treize mois qui précèdent le mois de référence', () => {
        const carnet = carnetVersements(propriete(), VERSEMENTS, '2026-08');

        expect(carnet).toHaveLength(MOIS_CARNET);
        expect(carnet[0].mois).toBe('2025-08');
        expect(carnet[carnet.length - 1].mois).toBe('2026-08');
    });

    it('distingue le mois versé du mois dû et du mois hors période', () => {
        const carnet = carnetVersements(propriete({ id: 'muette' }), VERSEMENTS, '2026-08');
        const par = Object.fromEntries(carnet.map(c => [c.mois, c.etat]));

        expect(par['2026-04']).toBe(ETATS.ATTENDU);   // avant le premier versement
        expect(par['2026-06']).toBe(ETATS.VERSE);
        expect(par['2026-07']).toBe(ETATS.MANQUANT);
        expect(par['2026-08']).toBe(ETATS.MANQUANT);
    });

    // Un projet remboursé cesse de verser sans manquer à rien : les mois qui
    // suivent son solde ne doivent pas noircir le carnet.
    it('referme la fenêtre d\'attente sur le dernier versement d\'un projet soldé', () => {
        const carnet = carnetVersements(
            propriete({ id: 'soldee', isRefunded: true }), VERSEMENTS, '2026-08'
        );
        const par = Object.fromEntries(carnet.map(c => [c.mois, c.etat]));

        expect(par['2026-06']).toBe(ETATS.VERSE);
        expect(par['2026-07']).toBe(ETATS.ATTENDU);
        expect(par['2026-08']).toBe(ETATS.ATTENDU);
    });

    // La date annoncée d'un projet encore en financement ne vaut pas échéance :
    // le carnet doit dire la même chose que la pastille, « rien n'était dû ».
    it('n\'attend rien d\'un projet encore en financement', () => {
        const carnet = carnetVersements(
            propriete({ id: 'neuve', projectStatus: 'ongoing', revenueStartDate: '2025-01' }),
            VERSEMENTS,
            '2026-08'
        );

        expect(carnet.every(c => c.etat === ETATS.ATTENDU)).toBe(true);
    });

    it('rend un carnet vide sans relevé', () => {
        expect(carnetVersements(propriete(), null, '2026-08')).toEqual([]);
    });
});

describe('annoterVersements', () => {
    const portefeuille = () => [
        propriete(),
        propriete({ id: 'muette' }),
        propriete({ id: 'soldee', isRefunded: true }),
        propriete({ id: 'neuve', projectStatus: 'upcoming' })
    ];

    it('rattache son état à chaque propriété et compte les états', () => {
        const proprietes = portefeuille();
        const bilan = annoterVersements(proprietes, VERSEMENTS);

        expect(bilan.moisReference).toBe('2026-08');
        expect(bilan.comptes).toEqual({ verse: 1, manquant: 1, attendu: 1, solde: 1 });
        expect(proprietes[0].versement.etat).toBe(ETATS.VERSE);
        expect(bilan.parPropriete).toBe(VERSEMENTS);
    });

    it('n\'annote rien sans relevé', () => {
        const proprietes = portefeuille();

        expect(annoterVersements(proprietes, null)).toBeNull();
        expect(proprietes[0].versement).toBeUndefined();
    });
});

describe('compterVersements', () => {
    it('ignore les propriétés sans état', () => {
        expect(compterVersements([{ id: 'a' }, { id: 'b', versement: { etat: ETATS.VERSE } }]))
            .toEqual({ verse: 1, manquant: 0, attendu: 0, solde: 0 });
    });

    it('rend des compteurs à zéro pour une entrée invalide', () => {
        expect(compterVersements(null)).toEqual({ verse: 0, manquant: 0, attendu: 0, solde: 0 });
    });
});
