/**
 * Vérification des statuts officiels
 *
 * Ce qui est éprouvé ici n'est pas la récupération elle-même — projectStatus.test.js
 * s'en charge — mais ce qu'on fait de son résultat. Deux cents requêtes viennent
 * d'être passées : si l'enregistrement échoue, il faut le dire, sans quoi il
 * faudra tout recommencer au prochain chargement sans jamais savoir pourquoi.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/data/projectStatusClient.js', () => ({
    fetchProjectStatuses: vi.fn()
}));

// Rejouer l'analyse complète n'apprendrait rien de plus ici, et demanderait
// toute la chaîne de rendu.
vi.mock('../src/business/processor.js', () => ({
    finalizeProcessing: vi.fn()
}));

const { rafraichirStatuts } = await import('../src/events/statusHandler.js');
const { fetchProjectStatuses } = await import('../src/data/projectStatusClient.js');
const { saveToLocalStorage, loadFromLocalStorage } = await import('../src/data/storage.js');
const { state } = await import('../src/core/state.js');

const portefeuille = [{
    yearMonthDate: '2024-01',
    projects: [{
        id: 'proj-1',
        name: { fr: 'Immeuble Lyon' },
        ownedBricks: 10,
        brickPrice: 1000,
        yearlyTotalRentabilityPercentage: 9
    }]
}];

beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    state.reset();

    document.body.innerHTML = `
        <div id="error" class="error hidden"></div>
        <p id="statusProgress" class="hidden"></p>
    `;

    saveToLocalStorage(portefeuille);
    state.set('lastResults', { properties: [{ id: 'proj-1', isRefunded: false }] });
    fetchProjectStatuses.mockResolvedValue({ 'proj-1': { statut: 'defaulted' } });
});

describe('rafraichirStatuts', () => {
    it('enregistre les statuts obtenus', async () => {
        await rafraichirStatuts();

        expect(loadFromLocalStorage().statuts).toEqual({ 'proj-1': { statut: 'defaulted' } });
        expect(document.getElementById('error').classList.contains('hidden')).toBe(true);
    });

    it('prévient quand ils ne peuvent pas être enregistrés', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            const err = new Error('quota');
            err.name = 'QuotaExceededError';
            throw err;
        });

        await rafraichirStatuts();

        const erreur = document.getElementById('error');

        expect(erreur.classList.contains('hidden')).toBe(false);
        expect(erreur.textContent).toContain('refusé d\'enregistrer');
        // Le portefeuille, lui, n'est pas perdu : c'est la version précédente
        // qui reste en place. Le message ne doit pas laisser croire l'inverse.
        expect(erreur.textContent).toContain('revérifier');
    });

    it('n\'interroge personne sans données', async () => {
        localStorage.clear();

        expect(await rafraichirStatuts()).toEqual({});
        expect(fetchProjectStatuses).not.toHaveBeenCalled();
    });
});
