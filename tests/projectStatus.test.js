import { describe, it, expect, vi } from 'vitest';
import { fetchProjectStatuses } from '../src/data/projectStatusClient.js';
import {
    niveauDepuisStatutOfficiel,
    estDefautRegularise,
    niveauRisque,
    repartitionRisque,
    NIVEAUX_RISQUE
} from '../src/business/riskAnalysis.js';

describe('niveauDepuisStatutOfficiel', () => {
    it('classe un défaut avec échéances dues au niveau le plus grave', () => {
        expect(niveauDepuisStatutOfficiel({ suivi: true, statut: 'defaulted', impayees: 4 }))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('ne compte pas un défaut régularisé parmi les incidents en cours', () => {
        // « defaulted » reste attaché au projet une fois les échéances
        // rattrapées : 34 des 72 projets marqués ainsi ne doivent plus rien.
        expect(niveauDepuisStatutOfficiel({ suivi: true, statut: 'defaulted', impayees: 0 }))
            .toBe(NIVEAUX_RISQUE.SIGNALE);
        expect(estDefautRegularise({ suivi: true, statut: 'defaulted', impayees: 0 })).toBe(true);
        expect(estDefautRegularise({ suivi: true, statut: 'defaulted', impayees: 2 })).toBe(false);
        expect(estDefautRegularise({ suivi: false })).toBe(false);
    });

    it('classe en impayé un suivi avec échéances dues mais sans défaut déclaré', () => {
        expect(niveauDepuisStatutOfficiel({ suivi: true, statut: 'active', impayees: 2 }))
            .toBe(NIVEAUX_RISQUE.IMPAYE);
    });

    it('classe en signalé un suivi actif sans rien de dû', () => {
        expect(niveauDepuisStatutOfficiel({ suivi: true, statut: 'active', impayees: 0 }))
            .toBe(NIVEAUX_RISQUE.SIGNALE);
    });

    it('considère l\'absence de page de suivi comme sain', () => {
        // Un 404 de l'API signifie qu'aucun incident n'est ouvert
        expect(niveauDepuisStatutOfficiel({ suivi: false })).toBe(NIVEAUX_RISQUE.SAIN);
    });

    it('ne conclut rien sans statut connu', () => {
        expect(niveauDepuisStatutOfficiel(null)).toBeNull();
        expect(niveauDepuisStatutOfficiel(undefined)).toBeNull();
    });
});

describe('niveauRisque — le suivi officiel prime sur le texte', () => {
    // Cas réel « Hôtel 4* Théoule sur mer » : quatre échéances impayées, mais
    // une dernière actualité qui ne parle que de démarches préfectorales.
    const theoule = {
        id: 'theoule',
        warnings: [{
            date: '2026-08-06',
            description: "Le porteur de projet est toujours dans l'attente de la "
                + 'validation de la Préfecture, faisant suite à celle de l\'ABF.'
        }]
    };

    it('lit le texte quand aucun statut n\'est connu', () => {
        expect(niveauRisque(theoule)).toBe(NIVEAUX_RISQUE.SIGNALE);
    });

    it('retient le défaut officiel malgré une actualité rassurante', () => {
        expect(niveauRisque(theoule, { suivi: true, statut: 'defaulted', impayees: 4 }))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('déclasse une propriété que le texte accusait à tort', () => {
        const propriete = {
            warnings: [{ date: '2026-01-01', description: 'Une mise en demeure a été envoyée' }]
        };

        expect(niveauRisque(propriete)).toBe(NIVEAUX_RISQUE.PROCEDURE);
        expect(niveauRisque(propriete, { suivi: false })).toBe(NIVEAUX_RISQUE.SAIN);
    });
});

describe('repartitionRisque — avec statuts officiels', () => {
    it('applique le statut par identifiant de projet', () => {
        const properties = [
            { id: 'a', investment: 100, warnings: [], isRefunded: false },
            { id: 'b', investment: 100, warnings: [], isRefunded: false }
        ];
        const statuts = { a: { suivi: true, statut: 'defaulted', impayees: 3 } };

        const { repartition } = repartitionRisque(properties, statuts);

        expect(repartition[NIVEAUX_RISQUE.PROCEDURE].ids).toEqual(['a']);
        expect(repartition[NIVEAUX_RISQUE.SAIN].ids).toEqual(['b']);
    });

    it('reste une partition avec des statuts partiels', () => {
        const properties = Array.from({ length: 5 }, (_, i) => ({
            id: `p${i}`, investment: 100, warnings: [], isRefunded: false
        }));
        const statuts = { p0: { suivi: true, statut: 'defaulted', impayees: 1 }, p1: { suivi: false } };

        const { base, repartition } = repartitionRisque(properties, statuts);

        expect(Object.values(repartition).reduce((t, e) => t + e.nombre, 0)).toBe(base);
    });
});

describe('fetchProjectStatuses', () => {
    it('interroge chaque identifiant une seule fois', async () => {
        const fetcher = vi.fn(async (id) => ({ id, suivi: false }));

        await fetchProjectStatuses(['a', 'b', 'a'], { fetcher, concurrence: 2 });

        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('rapporte la progression jusqu\'au total', async () => {
        const vus = [];
        const fetcher = async (id) => ({ id, suivi: false });

        await fetchProjectStatuses(['a', 'b', 'c'], {
            fetcher,
            concurrence: 1,
            onProgress: (faits, total) => vus.push(`${faits}/${total}`)
        });

        expect(vus).toEqual(['1/3', '2/3', '3/3']);
    });

    it('omet les projets en erreur plutôt que de les dire sains', async () => {
        // Les mémoriser comme « sain » masquerait un défaut derrière une panne
        const fetcher = async (id) => (id === 'ko' ? { id, erreur: true } : { id, suivi: false });

        const statuts = await fetchProjectStatuses(['ok', 'ko'], { fetcher, concurrence: 2 });

        expect(Object.keys(statuts)).toEqual(['ok']);
    });

    it('respecte la limite de parallélisme', async () => {
        let actifs = 0;
        let maximum = 0;
        const fetcher = async (id) => {
            actifs += 1;
            maximum = Math.max(maximum, actifs);
            await new Promise(r => setTimeout(r, 1));
            actifs -= 1;
            return { id, suivi: false };
        };

        await fetchProjectStatuses(['a', 'b', 'c', 'd', 'e', 'f'], { fetcher, concurrence: 2 });

        expect(maximum).toBeLessThanOrEqual(2);
    });

    it('tolère une liste vide', async () => {
        await expect(fetchProjectStatuses([], { fetcher: async () => ({}) })).resolves.toEqual({});
        await expect(fetchProjectStatuses(null, { fetcher: async () => ({}) })).resolves.toEqual({});
    });
});

describe('repartitionRisque — cohérence tuile / registre', () => {
    it('réutilise le niveau porté par la propriété', () => {
        // Les tuiles et le filtre du registre doivent lire la même valeur.
        // Recalculer le niveau sans les statuts les avait fait diverger :
        // 38 défauts annoncés, 4 affichés.
        const properties = [
            { id: 'a', investment: 100, isRefunded: false, warnings: [], niveauRisque: 'procedure' },
            { id: 'b', investment: 100, isRefunded: false, warnings: [], niveauRisque: 'sain' }
        ];

        const { repartition } = repartitionRisque(properties);

        expect(repartition.procedure.ids).toEqual(['a']);
        expect(repartition.sain.ids).toEqual(['b']);
    });
});

describe('fetchProjectStatuses — phases', () => {
    const echeances = (etats) => async (id) => ({ id, ...etats[id] });

    it('ne demande les actualités que pour les projets suivis', async () => {
        const vus = [];
        const statuts = await fetchProjectStatuses(['a', 'b'], {
            concurrence: 2,
            fetcher: echeances({
                a: { suivi: true, statut: 'active', impayees: 0 },
                b: { suivi: false }
            }),
            fetcherActualites: async (id) => { vus.push(id); return [{ date: '2026-01-01', texte: 'x' }]; },
            fetcherContentieux: async () => false
        });

        expect(vus).toEqual(['a']);
        expect(statuts.a.actualites).toHaveLength(1);
        expect(statuts.b.actualites).toBeUndefined();
    });

    it('ne vérifie le contentieux que sur les projets en défaut', async () => {
        const vus = [];
        await fetchProjectStatuses(['a', 'b', 'c'], {
            concurrence: 3,
            fetcher: echeances({
                a: { suivi: true, statut: 'defaulted', impayees: 2 },
                b: { suivi: true, statut: 'active', impayees: 0 },
                c: { suivi: false }
            }),
            fetcherActualites: async () => [],
            fetcherContentieux: async (id) => { vus.push(id); return true; }
        });

        expect(vus).toEqual(['a']);
    });

    it('nomme la phase dans la progression', async () => {
        const phases = new Set();
        await fetchProjectStatuses(['a'], {
            concurrence: 1,
            fetcher: echeances({ a: { suivi: true, statut: 'defaulted', impayees: 1 } }),
            fetcherActualites: async () => [],
            fetcherContentieux: async () => false,
            onProgress: (faits, total, phase) => phases.add(phase)
        });

        expect([...phases]).toEqual(['échéances', 'actualités', 'contentieux']);
    });
});

describe('niveauDepuisStatutOfficiel — contentieux', () => {
    it('place un contentieux ouvert au niveau le plus grave', () => {
        expect(niveauDepuisStatutOfficiel({ suivi: true, statut: 'active', impayees: 0, contentieux: true }))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('ne compte pas comme régularisé un défaut passé en contentieux', () => {
        expect(estDefautRegularise({ suivi: true, statut: 'defaulted', impayees: 0, contentieux: true }))
            .toBe(false);
    });
});
