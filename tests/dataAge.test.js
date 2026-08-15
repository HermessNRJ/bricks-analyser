import { describe, it, expect, beforeEach } from 'vitest';
import { decrireAge, joursDepuis, afficherAgeDonnees } from '../src/ui/dataAge.js';

const LE_15_JUIN = new Date('2024-06-15T12:00:00Z');

describe('joursDepuis', () => {
    it('compte les jours entiers écoulés', () => {
        expect(joursDepuis(new Date('2024-06-12T12:00:00Z'), LE_15_JUIN)).toBe(3);
    });

    it('ne compte pas une journée entamée', () => {
        expect(joursDepuis(new Date('2024-06-15T01:00:00Z'), LE_15_JUIN)).toBe(0);
    });
});

describe('decrireAge', () => {
    it('dit « aujourd\'hui » pour des données du jour', () => {
        const age = decrireAge('2024-06-15T09:00:00Z', LE_15_JUIN);

        // La date complète n'apprendrait rien si elle est du jour : l'heure,
        // elle, dit si le relevé précède ou suit le règlement du mois.
        expect(age.texte).toContain("aujourd'hui à ");
        expect(age.texte).not.toContain('15 juin 2024');
        expect(age.texte).toMatch(/\d{2}:\d{2}/);
        expect(age.estPerime).toBe(false);
    });

    it('dit « hier » au singulier', () => {
        expect(decrireAge('2024-06-14T09:00:00Z', LE_15_JUIN).texte).toContain('hier à ');
    });

    it('compte les jours au-delà', () => {
        const texte = decrireAge('2024-06-10T12:00:00Z', LE_15_JUIN).texte;

        expect(texte).toContain('il y a 5 jours');
        // Au-delà d'hier, la date complète revient, l'heure avec elle
        expect(texte).toContain('10 juin 2024 à ');
    });

    it('signale des données périmées au-delà de deux semaines', () => {
        expect(decrireAge('2024-06-01T12:00:00Z', LE_15_JUIN).estPerime).toBe(true);
        expect(decrireAge('2024-06-02T12:00:00Z', LE_15_JUIN).estPerime).toBe(false);
    });

    it('ne dit rien sans date enregistrée', () => {
        // Les sauvegardes antérieures à cette version n'en portent pas
        expect(decrireAge(null, LE_15_JUIN)).toBeNull();
        expect(decrireAge(undefined, LE_15_JUIN)).toBeNull();
        expect(decrireAge('pas-une-date', LE_15_JUIN)).toBeNull();
    });

    it('n\'annonce pas des données venues du futur', () => {
        // Une horloge décalée ne doit pas produire « il y a -2 jours »
        const age = decrireAge('2024-06-17T12:00:00Z', LE_15_JUIN);

        expect(age.texte).toContain("aujourd'hui");
        expect(age.estPerime).toBe(false);
    });
});

describe('afficherAgeDonnees', () => {
    beforeEach(() => {
        document.body.innerHTML = '<p id="dataAge" class="hidden"></p>';
    });

    it('affiche le texte et retire la classe hidden', () => {
        afficherAgeDonnees(new Date().toISOString());

        const el = document.getElementById('dataAge');
        expect(el.classList.contains('hidden')).toBe(false);
        expect(el.textContent).toContain('Données récupérées');
    });

    it('invite à recharger quand les données sont périmées', () => {
        afficherAgeDonnees('2020-01-01T00:00:00Z');

        const el = document.getElementById('dataAge');
        expect(el.classList.contains('est-perime')).toBe(true);
        expect(el.textContent).toContain('Rechargez-les');
    });

    it('reste caché sans date connue', () => {
        afficherAgeDonnees(null);

        expect(document.getElementById('dataAge').classList.contains('hidden')).toBe(true);
    });

    it('ne casse pas si l\'élément est absent', () => {
        document.body.innerHTML = '';

        expect(() => afficherAgeDonnees(new Date().toISOString())).not.toThrow();
    });
});
