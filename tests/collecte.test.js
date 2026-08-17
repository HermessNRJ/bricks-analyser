import { describe, it, expect, vi, beforeEach } from 'vitest';

// processData porte tout le rendu : le mocker isole l'enchaînement de
// normalisation, qui est le seul objet de ces tests.
vi.mock('../src/business/processor.js', () => ({
    processData: vi.fn(async () => ({}))
}));

import { processData } from '../src/business/processor.js';
import {
    validerEnveloppe, traiterCollecte, FORMAT_COLLECTE, VERSION_COLLECTE
} from '../src/business/collecte.js';

const enveloppeValide = (surcharge = {}) => ({
    format: FORMAT_COLLECTE,
    version: VERSION_COLLECTE,
    genereLe: '2026-08-17T09:00:00.000Z',
    brut: { financed: [], projets: null, alertes: [], revenus: null, transactions: [] },
    ...surcharge
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('validerEnveloppe', () => {
    it('accepte une enveloppe bien formée', () => {
        expect(validerEnveloppe(enveloppeValide())).toEqual({ valide: true });
    });

    it('refuse ce qui n\'est pas un objet', () => {
        for (const valeur of [null, undefined, 'texte', 42, true]) {
            expect(validerEnveloppe(valeur).valide).toBe(false);
        }
    });

    it('refuse un JSON qui ne vient pas du favori', () => {
        const verdict = validerEnveloppe({ data: [], warnings: [] });

        expect(verdict.valide).toBe(false);
        expect(verdict.erreur).toContain(FORMAT_COLLECTE);
    });

    it('refuse un fichier écrit par un favori d\'une autre version', () => {
        const verdict = validerEnveloppe(enveloppeValide({ version: VERSION_COLLECTE + 1 }));

        expect(verdict.valide).toBe(false);
        // Le message doit dire quoi faire, pas seulement que c'est faux
        expect(verdict.erreur).toContain('Reposez le favori');
    });

    it('refuse une collecte interrompue avant les projets financés', () => {
        const verdict = validerEnveloppe(enveloppeValide({ brut: { financed: null } }));

        expect(verdict.valide).toBe(false);
        expect(verdict.erreur).toContain('interrompue');
    });
});

describe('traiterCollecte', () => {
    const brutComplet = {
        financed: [
            { yearMonthDate: '2026-01', projects: [{ id: 'p1', ownedBricks: 2, brickPrice: 1000 }] }
        ],
        projets: {
            ongoing: { projects: [{ id: 'p2', ownedBricks: 1, brickPrice: 1000 }] },
            upcoming: { projects: [] }
        },
        alertes: [{ propertyId: 'p1', content: 'retard' }],
        revenus: null,
        transactions: []
    };

    it('fusionne les projets financés et en cours avant de traiter', async () => {
        await traiterCollecte(brutComplet);

        expect(processData).toHaveBeenCalledTimes(1);

        const [donnees, alertes] = processData.mock.calls[0];

        // Le projet « ongoing » détenu doit avoir rejoint le portefeuille
        expect(donnees).toHaveLength(2);
        expect(donnees[1].projects[0].id).toBe('p2');
        expect(donnees[1].projects[0].projectStatus).toBe('ongoing');
        expect(alertes).toHaveLength(1);
    });

    it('survit à une collecte réduite aux seuls projets financés', async () => {
        const compte = await traiterCollecte({ financed: brutComplet.financed });

        expect(processData).toHaveBeenCalledTimes(1);
        expect(compte.entrees).toBe(1);
        expect(compte.alertes).toBe(0);
        expect(compte.transactions).toBe(0);
        expect(compte.revenus).toBe(0);
    });

    it('normalise le relevé de revenus plutôt que de le passer brut', async () => {
        await traiterCollecte({
            ...brutComplet,
            // Forme réelle de l'état de compte : mois comptés à partir de zéro,
            // montants en centimes.
            revenus: {
                revenuesTotal: { untaxedTotal: 6017, taxedTotal: 4476 },
                revenuesByYearAndMonth: [
                    {
                        year: 2026,
                        month: 6,
                        untaxedTotal: 6017,
                        taxedTotal: 4476,
                        revenues: {
                            obligationCoupons: { untaxedTotal: 5994, taxedTotal: 4453 },
                            withholdingTax: { total: -1541, byRate: [{ taxRate: 31.4, total: -1541 }] }
                        }
                    }
                ]
            }
        });

        const options = processData.mock.calls[0][2];

        // La forme normalisée expose « mensuel » et « total » ; la brute non.
        expect(options.revenus).not.toBeNull();
        expect(options.revenus.mensuel).toBeDefined();
        expect(options.revenus.total).toBeDefined();
    });

    it('rend compte de l\'étape en cours', async () => {
        const etapes = [];

        await traiterCollecte(brutComplet, { surAvancement: (t) => etapes.push(t) });

        expect(etapes.length).toBeGreaterThan(0);
    });
});
