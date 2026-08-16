import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    TAILLES_PAGE,
    CLES_FILTRES,
    lirePreference,
    ecrirePreference
} from '../src/core/preferences.js';

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('lirePreference', () => {
    it('rend le défaut quand rien n\'est enregistré', () => {
        expect(lirePreference('propertySortBy')).toBe('investment-desc');
        expect(lirePreference('propertyFilter')).toBe('all');
        expect(lirePreference('registreTaillePage')).toBe(24);
    });

    it('rend la valeur enregistrée', () => {
        localStorage.setItem('propertyCountryFilter', 'Portugal');
        expect(lirePreference('propertyCountryFilter')).toBe('Portugal');
    });

    // Aucun de ces réglages n'a de valeur vide — « tout afficher » s'écrit
    // 'all'. Une chaîne vide relue laisserait le <select> sans option
    // correspondante, donc sur la première venue.
    it('écarte une chaîne vide', () => {
        localStorage.setItem('propertyCountryFilter', '');
        expect(lirePreference('propertyCountryFilter')).toBe('all');
    });

    it('relit « Tout » comme Infinity', () => {
        localStorage.setItem('registreTaillePage', 'all');
        expect(lirePreference('registreTaillePage')).toBe(Infinity);
    });

    it('relit une taille chiffrée en nombre', () => {
        localStorage.setItem('registreTaillePage', '96');
        expect(lirePreference('registreTaillePage')).toBe(96);
    });

    // Une taille retirée du menu ne doit pas revenir : le <select> n'aurait
    // aucune option à sélectionner et afficherait la première venue, en
    // désaccord avec la liste réellement paginée.
    it('écarte une taille qui n\'est plus proposée', () => {
        localStorage.setItem('registreTaillePage', '7');
        expect(lirePreference('registreTaillePage')).toBe(24);
    });

    it('écarte une valeur illisible', () => {
        localStorage.setItem('registreTaillePage', 'beaucoup');
        expect(lirePreference('registreTaillePage')).toBe(24);
    });

    it('rend le défaut si le stockage est inaccessible', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });

        expect(lirePreference('propertyFilter')).toBe('all');
    });

    it('refuse une clé non déclarée', () => {
        expect(() => lirePreference('propertyInventé')).toThrow(/inconnue/);
    });
});

describe('ecrirePreference', () => {
    it('enregistre une chaîne telle quelle', () => {
        expect(ecrirePreference('propertyFilter', 'refunded')).toBe(true);
        expect(localStorage.getItem('propertyFilter')).toBe('refunded');
    });

    it('enregistre Infinity sous le mot « all »', () => {
        expect(ecrirePreference('registreTaillePage', Infinity)).toBe(true);
        expect(localStorage.getItem('registreTaillePage')).toBe('all');
    });

    it('refuse une taille hors du menu sans rien écrire', () => {
        expect(ecrirePreference('registreTaillePage', 7)).toBe(false);
        expect(localStorage.getItem('registreTaillePage')).toBeNull();
    });

    // Navigation privée, quota atteint, stockage désactivé : le réglage vaut
    // pour la session et sera simplement oublié, mais rien ne doit remonter
    // jusqu'à l'appelant, qui est en train de redessiner le registre.
    it('avale un échec d\'écriture', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        expect(ecrirePreference('propertyFilter', 'active')).toBe(false);
    });

    it('refuse une clé non déclarée', () => {
        expect(() => ecrirePreference('propertyInventé', 'x')).toThrow(/inconnue/);
    });
});

describe('aller-retour', () => {
    it('rend chaque taille du menu telle qu\'elle a été écrite', () => {
        TAILLES_PAGE.forEach(taille => {
            ecrirePreference('registreTaillePage', taille);
            expect(lirePreference('registreTaillePage')).toBe(taille);
        });
    });

    it('couvre les quatre filtres du registre', () => {
        CLES_FILTRES.forEach(cle => {
            expect(ecrirePreference(cle, 'valeur')).toBe(true);
            expect(lirePreference(cle)).toBe('valeur');
        });
    });
});
