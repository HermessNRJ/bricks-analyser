/**
 * Tranches du camembert de répartition des versements
 *
 * Seule la mise en tranches est testée : le tracé est du Chart.js, qui n'a rien
 * à faire dans un test unitaire. Ce qui compte ici est que la partition reste
 * une partition — quatre lignes, toujours les mêmes, dans le même ordre.
 */

import { describe, it, expect } from 'vitest';
import { tranchesVersements, SEGMENTS } from '../src/charts/statutsChart.js';
import { ETATS, compterVersements } from '../src/business/versements.js';

describe('tranchesVersements', () => {
    it('rend les quatre états dans l\'ordre du cycle de vie', () => {
        const tranches = tranchesVersements({ verse: 3, manquant: 1, attendu: 2, solde: 5 });

        expect(tranches.map(t => t.libelle)).toEqual([
            'À jour', 'Démarrage en attente', 'En retard', 'Déjà remboursé'
        ]);
        expect(tranches.map(t => t.valeur)).toEqual([3, 2, 1, 5]);
    });

    it('garde une tranche à zéro plutôt que de la retirer', () => {
        // « En retard : 0 » est une information ; une ligne absente de la
        // légende se lirait comme un état oublié.
        const tranches = tranchesVersements({ verse: 4, manquant: 0, attendu: 0, solde: 0 });

        expect(tranches).toHaveLength(4);
        expect(tranches.find(t => t.libelle === 'En retard').valeur).toBe(0);
    });

    it('ne masque par défaut que les projets soldés', () => {
        const masques = SEGMENTS.filter(s => s.masque).map(s => s.etat);
        expect(masques).toEqual([ETATS.SOLDE]);
    });

    it('rend null quand aucune propriété n\'est classée', () => {
        expect(tranchesVersements({ verse: 0, manquant: 0, attendu: 0, solde: 0 })).toBeNull();
    });

    it('rend null sans relevé', () => {
        expect(tranchesVersements(null)).toBeNull();
        expect(tranchesVersements(undefined)).toBeNull();
    });

    it('traite une valeur absente ou aberrante comme un zéro', () => {
        const tranches = tranchesVersements({ verse: 2, solde: undefined, manquant: NaN });

        expect(tranches.map(t => t.valeur)).toEqual([2, 0, 0, 0]);
    });

    it('couvre exactement les états que compterVersements renvoie', () => {
        // Le camembert prétend être une partition : si un état apparaissait
        // dans le calcul sans être ici, des propriétés disparaîtraient du
        // disque sans que rien ne le signale.
        const comptes = compterVersements([]);

        expect(SEGMENTS.map(s => s.etat).sort()).toEqual(Object.keys(comptes).sort());
    });

    it('somme les tranches sur l\'effectif classé', () => {
        const proprietes = [
            { versement: { etat: ETATS.VERSE } },
            { versement: { etat: ETATS.VERSE } },
            { versement: { etat: ETATS.MANQUANT } },
            { versement: { etat: ETATS.SOLDE } },
            { versement: { etat: ETATS.INCONNU } }
        ];

        const tranches = tranchesVersements(compterVersements(proprietes));
        const total = tranches.reduce((somme, t) => somme + t.valeur, 0);

        // `inconnu` n'est pas un état de la partition : il compte les
        // propriétés dont on ne sait rien, et il reste hors du disque.
        expect(total).toBe(4);
    });
});
