import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('../src/business/processor.js', () => ({
    processData: vi.fn(async () => ({}))
}));

import { processData } from '../src/business/processor.js';
import { validerEnveloppe, traiterCollecte } from '../src/business/collecte.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(RACINE, 'src/collecte/extracteur.js'), 'utf8');

/**
 * Exécute l'extracteur tel quel, ses variables libres passées en paramètres
 *
 * Le fichier n'est ni modifié ni ré-écrit pour le test : `new Function` reçoit
 * `location`, `document`, `fetch` et le reste comme arguments, si bien que le
 * code éprouvé ici est exactement celui qui part dans la barre de favoris.
 * Une réécriture — neutraliser le garde-fou de domaine, par exemple — testerait
 * autre chose que ce qui s'exécute chez l'utilisateur.
 *
 * @param {Object} options
 * @param {Function} options.repondre - Reçoit une URL, rend le corps à servir
 * @param {string} [options.hostname] - Domaine simulé de la page
 * @returns {Promise<Object>} { enveloppe, nom, alertes, banniere }
 */
async function executer({ repondre, hostname = 'app.bricks.co' }) {
    const alertes = [];
    const etapes = [];

    // Deux fins possibles, et il faut attendre la première qui vienne : le
    // fichier écrit, ou le bandeau passé au vert/rouge par `finir`. Sans la
    // seconde, un échec fatal — session expirée — ne réveillerait jamais le test.
    let ecrit;
    let arrete;
    const fichierEcrit = new Promise(r => { ecrit = r; });
    const bandeauFige = new Promise(r => { arrete = r; });

    const noeud = () => ({
        id: '',
        // `finir` est le seul à peindre le fond : c'est le signal de fin.
        style: { cssText: '', set background(_valeur) { arrete(); } },
        set textContent(valeur) { etapes.push(valeur); },
        get textContent() { return etapes[etapes.length - 1] || ''; },
        setAttribute() {},
        remove() {},
        click() {}
    });

    let telecharge = null;
    const ancre = noeud();

    const document = {
        getElementById: () => null,
        createElement: (balise) => (balise === 'a' ? ancre : noeud()),
        body: { appendChild: () => {} }
    };

    const URL = {
        createObjectURL: (blob) => {
            telecharge = blob;
            blob.text().then(texte => ecrit(texte));
            return 'blob:simule';
        },
        revokeObjectURL: () => {}
    };

    const lancer = new Function(
        'location', 'document', 'fetch', 'URL', 'Blob', 'alert', 'setTimeout', SOURCE
    );

    lancer(
        { hostname },
        document,
        async (url) => repondre(url),
        URL,
        globalThis.Blob,
        (message) => alertes.push(message),
        () => {}
    );

    if (alertes.length > 0) {
        return { alertes, enveloppe: null, nom: null, etapes };
    }

    await Promise.race([fichierEcrit, bandeauFige]);

    if (!telecharge) {
        return { alertes, etapes, enveloppe: null, nom: null };
    }

    return {
        alertes,
        etapes,
        nom: ancre.download,
        type: telecharge.type,
        enveloppe: JSON.parse(await telecharge.text())
    };
}

/** Réponse JSON réussie, à la façon de fetch */
const ok = (corps) => ({ ok: true, status: 200, json: async () => corps });

const ligne = (id) => ({ id, amount: 100, type: 'obligationCoupon', date: '2026-07-01' });

/** API de Bricks simulée : deux pages de journal, dont une qui se recouvre */
function apiComplete() {
    return (url) => {
        if (url.includes('/projects/financed')) {
            return ok([{ yearMonthDate: '2026-01', projects: [{ id: 'p1', ownedBricks: 2, brickPrice: 1000 }] }]);
        }

        if (url.includes('/investor/portfolio/properties/highlighted-updates')) {
            return ok([{ propertyId: 'p1', content: 'retard' }]);
        }

        if (url.includes('/investor/portfolio/revenue')) {
            return ok({ revenuesTotal: {}, revenuesByYearAndMonth: [] });
        }

        if (url.includes('/wallet-transactions')) {
            const curseur = Number(new URLSearchParams(url.split('?')[1]).get('cursor'));

            if (curseur === 0) {
                return ok({ data: [ligne('a'), ligne('b')], cursor: 1 });
            }

            // Le curseur n'a avancé que d'un cran : « b » revient. Compté deux
            // fois, il doublerait un remboursement de capital.
            if (curseur === 1) {
                return ok({ data: [ligne('b'), ligne('c')] });
            }

            return ok({ data: [] });
        }

        if (url.endsWith('/projects')) {
            return ok({ ongoing: { projects: [{ id: 'p2', ownedBricks: 1, brickPrice: 1000 }] }, upcoming: { projects: [] } });
        }

        throw new Error(`URL non simulée : ${url}`);
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('l\'extracteur, exécuté tel qu\'il part dans le favori', () => {
    it('refuse de tourner ailleurs que sur bricks.co', async () => {
        const { alertes, enveloppe } = await executer({
            repondre: apiComplete(),
            hostname: '127.0.0.1'
        });

        expect(enveloppe).toBeNull();
        expect(alertes[0]).toContain('app.bricks.co');
    });

    it('accepte un sous-domaine de bricks.co, et pas un domaine qui s\'y termine', async () => {
        const surApp = await executer({ repondre: apiComplete(), hostname: 'app.bricks.co' });
        const surLeurre = await executer({ repondre: apiComplete(), hostname: 'notbricks.co' });

        expect(surApp.alertes).toHaveLength(0);
        expect(surLeurre.alertes).toHaveLength(1);
    });

    it('écrit une enveloppe que l\'application reconnaît', async () => {
        const { enveloppe, nom, type } = await executer({ repondre: apiComplete() });

        expect(validerEnveloppe(enveloppe)).toEqual({ valide: true });
        expect(nom).toMatch(/^bricks-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
        expect(type).toBe('application/json');
    });

    it('ramasse les cinq sources', async () => {
        const { enveloppe } = await executer({ repondre: apiComplete() });

        expect(enveloppe.brut.financed).toHaveLength(1);
        expect(enveloppe.brut.projets.ongoing.projects).toHaveLength(1);
        expect(enveloppe.brut.alertes).toHaveLength(1);
        expect(enveloppe.brut.revenus).not.toBeNull();
        expect(enveloppe.brut.transactions.length).toBeGreaterThan(0);
    });

    it('dédoublonne le journal quand le curseur n\'avance pas d\'un lot entier', async () => {
        const { enveloppe } = await executer({ repondre: apiComplete() });
        const ids = enveloppe.brut.transactions.map(t => t.id);

        expect(ids).toEqual(['a', 'b', 'c']);
    });

    it('n\'abandonne pas la collecte parce qu\'une source accessoire manque', async () => {
        const partielle = apiComplete();

        const { enveloppe } = await executer({
            repondre: (url) => {
                if (url.includes('revenue') || url.includes('highlighted-updates')) {
                    return { ok: false, status: 500, json: async () => ({}) };
                }
                return partielle(url);
            }
        });

        expect(validerEnveloppe(enveloppe).valide).toBe(true);
        expect(enveloppe.brut.revenus).toBeNull();
        expect(enveloppe.brut.alertes).toEqual([]);
    });

    it('nomme la session expirée plutôt que de rendre une erreur HTTP brute', async () => {
        const { enveloppe, etapes } = await executer({
            repondre: () => ({ ok: false, status: 401, json: async () => ({}) })
        });

        expect(enveloppe).toBeNull();
        expect(etapes.join(' ')).toContain('session expirée');
    });
});

describe('l\'aller-retour complet', () => {
    it('porte à l\'écran ce que l\'extracteur a écrit', async () => {
        const { enveloppe } = await executer({ repondre: apiComplete() });

        // Exactement ce que fait fichierHandler après un JSON.parse
        expect(validerEnveloppe(enveloppe).valide).toBe(true);

        const compte = await traiterCollecte(enveloppe.brut);

        expect(processData).toHaveBeenCalledTimes(1);

        const [donnees, alertes] = processData.mock.calls[0];

        // Le projet financé et le projet « ongoing » détenu
        expect(donnees).toHaveLength(2);
        expect(alertes).toHaveLength(1);
        expect(compte.transactions).toBe(3);
    });
});
