import { describe, it, expect } from 'vitest';
import {
    getUniqueProjectIds,
    mergeDatasets,
    identifyMissingProjects,
    removeProjectsById,
    getProjectNameById
} from '../src/business/dataProcessor.js';

const dataset = (...months) => months;
const month = (yearMonthDate, projects) => ({ yearMonthDate, projects });

describe('getUniqueProjectIds', () => {
    it('collecte les ids sur tous les mois sans doublon', () => {
        const data = dataset(
            month('2024-01', [{ id: 'a' }, { id: 'b' }]),
            month('2024-02', [{ id: 'a' }, { id: 'c' }])
        );
        expect([...getUniqueProjectIds(data)].sort()).toEqual(['a', 'b', 'c']);
    });

    it('ignore les projets sans id', () => {
        const data = dataset(month('2024-01', [{ id: 'a' }, { name: 'sans id' }]));
        expect([...getUniqueProjectIds(data)]).toEqual(['a']);
    });

    it('retourne un Set vide sur une entrée invalide', () => {
        expect(getUniqueProjectIds(null).size).toBe(0);
        expect(getUniqueProjectIds({}).size).toBe(0);
        expect(getUniqueProjectIds(dataset(month('2024-01', undefined))).size).toBe(0);
    });
});

describe('mergeDatasets', () => {
    it('ajoute les nouveaux mois', () => {
        const existing = dataset(month('2024-01', [{ id: 'a', ownedBricks: 1 }]));
        const incoming = dataset(month('2024-02', [{ id: 'b', ownedBricks: 2 }]));

        const merged = mergeDatasets(existing, incoming);

        expect(merged.map(m => m.yearMonthDate)).toEqual(['2024-01', '2024-02']);
    });

    it('met à jour un projet existant dans un mois existant', () => {
        const existing = dataset(month('2024-01', [{ id: 'a', ownedBricks: 1 }]));
        const incoming = dataset(month('2024-01', [{ id: 'a', ownedBricks: 5 }]));

        const merged = mergeDatasets(existing, incoming);

        expect(merged).toHaveLength(1);
        expect(merged[0].projects).toHaveLength(1);
        expect(merged[0].projects[0].ownedBricks).toBe(5);
    });

    it('conserve les champs existants absents des nouvelles données', () => {
        const existing = dataset(month('2024-01', [{ id: 'a', ownedBricks: 1, thumbnailUrl: 'x.png' }]));
        const incoming = dataset(month('2024-01', [{ id: 'a', ownedBricks: 5 }]));

        const merged = mergeDatasets(existing, incoming);

        expect(merged[0].projects[0].thumbnailUrl).toBe('x.png');
    });

    it('ajoute un nouveau projet dans un mois existant', () => {
        const existing = dataset(month('2024-01', [{ id: 'a' }]));
        const incoming = dataset(month('2024-01', [{ id: 'b' }]));

        const merged = mergeDatasets(existing, incoming);

        expect(merged[0].projects.map(p => p.id)).toEqual(['a', 'b']);
    });

    it('ne mute pas les données existantes', () => {
        const existing = dataset(month('2024-01', [{ id: 'a', ownedBricks: 1 }]));
        const incoming = dataset(month('2024-01', [{ id: 'a', ownedBricks: 9 }]));

        mergeDatasets(existing, incoming);

        expect(existing[0].projects[0].ownedBricks).toBe(1);
    });

    it('gère un existant vide', () => {
        const incoming = dataset(month('2024-01', [{ id: 'a' }]));
        expect(mergeDatasets([], incoming)).toHaveLength(1);
        expect(mergeDatasets(null, incoming)).toHaveLength(1);
    });
});

describe('identifyMissingProjects', () => {
    it('retourne les projets présents avant mais plus maintenant', () => {
        const existing = dataset(month('2024-01', [{ id: 'a' }, { id: 'b' }]));
        const incoming = dataset(month('2024-01', [{ id: 'a' }]));

        expect(identifyMissingProjects(existing, incoming)).toEqual(['b']);
    });

    it('retourne un tableau vide quand rien ne disparaît', () => {
        const existing = dataset(month('2024-01', [{ id: 'a' }]));
        const incoming = dataset(month('2024-01', [{ id: 'a' }, { id: 'b' }]));

        expect(identifyMissingProjects(existing, incoming)).toEqual([]);
    });

    it('considère un projet présent dans n\'importe quel mois comme non manquant', () => {
        const existing = dataset(month('2024-01', [{ id: 'a' }]));
        const incoming = dataset(
            month('2024-02', [{ id: 'b' }]),
            month('2024-03', [{ id: 'a' }])
        );

        expect(identifyMissingProjects(existing, incoming)).toEqual([]);
    });
});

describe('removeProjectsById', () => {
    it('retire le projet de tous les mois', () => {
        const data = dataset(
            month('2024-01', [{ id: 'a' }, { id: 'b' }]),
            month('2024-02', [{ id: 'b' }])
        );

        const cleaned = removeProjectsById(data, ['b']);

        expect(cleaned[0].projects.map(p => p.id)).toEqual(['a']);
        expect(cleaned[1].projects).toEqual([]);
    });

    it('ne mute pas l\'original', () => {
        const data = dataset(month('2024-01', [{ id: 'a' }, { id: 'b' }]));

        removeProjectsById(data, ['b']);

        expect(data[0].projects).toHaveLength(2);
    });

    it('retourne les données inchangées si aucun id fourni', () => {
        const data = dataset(month('2024-01', [{ id: 'a' }]));
        expect(removeProjectsById(data, [])).toBe(data);
        expect(removeProjectsById(data, null)).toBe(data);
    });
});

describe('getProjectNameById', () => {
    it('trouve le nom localisé', () => {
        const data = dataset(month('2024-01', [{ id: 'a', name: { fr: 'Maison Lyon' } }]));
        expect(getProjectNameById('a', data)).toBe('Maison Lyon');
    });

    it('retombe sur le nom anglais puis la chaîne simple', () => {
        const data = dataset(month('2024-01', [
            { id: 'a', name: { en: 'Lyon House' } },
            { id: 'b', name: 'Nom simple' }
        ]));
        expect(getProjectNameById('a', data)).toBe('Lyon House');
        expect(getProjectNameById('b', data)).toBe('Nom simple');
    });

    it('signale un id introuvable', () => {
        const data = dataset(month('2024-01', [{ id: 'a', name: 'X' }]));
        expect(getProjectNameById('zzz', data)).toContain('zzz');
    });
});
