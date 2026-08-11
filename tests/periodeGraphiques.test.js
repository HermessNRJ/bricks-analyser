import { describe, it, expect } from 'vitest';
import { filtrerPeriode, bornesPeriode, PERIODES, PERIODE_PERSONNALISEE } from '../src/ui/periodeGraphiques.js';

/**
 * Courbe cumulative sur 14 mois : 2024-01 = 100, 2024-02 = 200, ... 2025-02 = 1400
 */
function evolutionSur14Mois() {
    const data = {};
    for (let i = 0; i < 14; i++) {
        const mois = `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
        data[mois] = (i + 1) * 100;
    }
    return data;
}

const fenetre = (preset, debut = null, fin = null) => ({ preset, debut, fin });

describe('filtrerPeriode — raccourcis', () => {
    const data = evolutionSur14Mois();

    it('ne garde que les N derniers mois', () => {
        expect(Object.keys(filtrerPeriode(data, fenetre('3')))).toEqual(['2024-12', '2025-01', '2025-02']);
        expect(Object.keys(filtrerPeriode(data, fenetre('6')))).toHaveLength(6);
        expect(Object.keys(filtrerPeriode(data, fenetre('12')))).toHaveLength(12);
        expect(Object.keys(filtrerPeriode(data, fenetre('24')))).toHaveLength(14);
    });

    it('conserve tout l\'historique avec « all »', () => {
        expect(Object.keys(filtrerPeriode(data, fenetre('all')))).toHaveLength(14);
    });

    it('conserve les valeurs cumulées, sans les recalculer depuis la fenêtre', () => {
        expect(filtrerPeriode(data, fenetre('3'))['2024-12']).toBe(1200);
    });

    it('retombe sur l\'historique complet si la valeur est inconnue', () => {
        expect(filtrerPeriode(data, fenetre('n_importe_quoi'))).toEqual(data);
    });

    it('tolère un historique plus court que la période demandée', () => {
        const court = { '2025-01': 100, '2025-02': 200 };
        expect(Object.keys(filtrerPeriode(court, fenetre('12')))).toEqual(['2025-01', '2025-02']);
    });

    it('tolère des données absentes', () => {
        expect(filtrerPeriode(null, fenetre('3'))).toEqual({});
        expect(filtrerPeriode({}, fenetre('all'))).toEqual({});
    });

    it('trie les mois avant de découper', () => {
        const desordre = { '2025-03': 300, '2025-01': 100, '2025-04': 400, '2025-02': 200 };
        expect(Object.keys(filtrerPeriode(desordre, fenetre('3')))).toEqual(['2025-02', '2025-03', '2025-04']);
    });
});

describe('filtrerPeriode — bornes choisies', () => {
    const data = evolutionSur14Mois();

    it('retient les mois compris entre les deux bornes, incluses', () => {
        const retenus = filtrerPeriode(data, fenetre(PERIODE_PERSONNALISEE, '2024-03', '2024-06'));

        expect(Object.keys(retenus)).toEqual(['2024-03', '2024-04', '2024-05', '2024-06']);
        expect(retenus['2024-03']).toBe(300);
    });

    it('accepte une borne seule, ouverte de l\'autre côté', () => {
        expect(Object.keys(filtrerPeriode(data, fenetre(PERIODE_PERSONNALISEE, '2025-01', null))))
            .toEqual(['2025-01', '2025-02']);
        expect(Object.keys(filtrerPeriode(data, fenetre(PERIODE_PERSONNALISEE, null, '2024-02'))))
            .toEqual(['2024-01', '2024-02']);
    });

    it('renvoie une série vide si les bornes sont inversées', () => {
        expect(filtrerPeriode(data, fenetre(PERIODE_PERSONNALISEE, '2025-01', '2024-01'))).toEqual({});
    });

    it('ne bronche pas sur une fenêtre hors de l\'historique', () => {
        expect(filtrerPeriode(data, fenetre(PERIODE_PERSONNALISEE, '2030-01', '2030-06'))).toEqual({});
    });
});

describe('PERIODES', () => {
    it('expose les raccourcis attendus par l\'interface', () => {
        expect(Object.keys(PERIODES)).toEqual(['3', '6', '12', '24', 'all']);
    });
});

describe('bornesPeriode — référence commune', () => {
    it('cale toutes les séries sur la même borne de début', () => {
        // Les revenus estimés se prolongent trois mois dans l'avenir, pas
        // l'investissement : découper chacun sur ses propres mois les décalait.
        const reference = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
        const investissement = { '2026-01': 1, '2026-02': 2, '2026-03': 3 };
        const revenus = { '2026-01': 1, '2026-02': 2, '2026-03': 3, '2026-04': 4, '2026-05': 5, '2026-06': 6 };

        const f = fenetre('3');

        expect(bornesPeriode(reference, f)).toEqual({ debut: '2026-04', fin: null });
        expect(Object.keys(filtrerPeriode(revenus, f, reference))).toEqual(['2026-04', '2026-05', '2026-06']);
        // Découpé sur ses propres mois, l'investissement aurait démarré en
        // février : la référence commune l'aligne sur avril comme les autres.
        expect(Object.keys(filtrerPeriode(investissement, f))).toEqual(['2026-01', '2026-02', '2026-03']);
        expect(Object.keys(filtrerPeriode(investissement, f, reference))).toEqual([]);
    });

    it('sans référence, chaque série se découpe sur ses propres mois', () => {
        const serie = { '2026-01': 1, '2026-02': 2, '2026-03': 3, '2026-04': 4 };

        expect(Object.keys(filtrerPeriode(serie, fenetre('2')))).toEqual(Object.keys(serie));
        expect(Object.keys(filtrerPeriode(serie, fenetre('3')))).toEqual(['2026-02', '2026-03', '2026-04']);
    });

    it('rend les bornes saisies telles quelles en mode personnalisé', () => {
        expect(bornesPeriode(['2026-01'], fenetre(PERIODE_PERSONNALISEE, '2025-01', '2025-06')))
            .toEqual({ debut: '2025-01', fin: '2025-06' });
    });

    it('n\'impose aucune borne sur tout l\'historique', () => {
        expect(bornesPeriode(['2026-01', '2026-02'], fenetre('all'))).toEqual({ debut: null, fin: null });
    });
});
