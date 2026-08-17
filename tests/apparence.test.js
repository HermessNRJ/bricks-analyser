/**
 * Bascule clair / sombre
 *
 * Trois fonctions pures portent toute la logique : quelle requête média donne
 * quel thème, ce qui est réellement à l'écran, et ce que fait le bouton. Le
 * reste n'est que du DOM.
 */

import { describe, it, expect } from 'vitest';
import { mediaPourTheme, themeAffiche, themeSuivant, THEMES } from '../src/ui/apparence.js';

describe('mediaPourTheme', () => {
    it('laisse le système décider en auto', () => {
        expect(mediaPourTheme('auto')).toBe('(prefers-color-scheme: dark)');
    });

    it('impose la feuille de nuit en sombre', () => {
        expect(mediaPourTheme('sombre')).toBe('all');
    });

    it('la désarme en clair', () => {
        // « not all » ne s'applique à aucun média : la feuille reste chargée,
        // simplement inerte, et le retour au sombre ne coûte pas un aller-retour.
        expect(mediaPourTheme('clair')).toBe('not all');
    });

    it('retombe sur auto devant une valeur inconnue', () => {
        expect(mediaPourTheme('turquoise')).toBe('(prefers-color-scheme: dark)');
        expect(mediaPourTheme(undefined)).toBe('(prefers-color-scheme: dark)');
    });

    it('couvre les trois thèmes déclarés', () => {
        THEMES.forEach(theme => {
            expect(mediaPourTheme(theme)).toBeTruthy();
        });
    });
});

describe('themeAffiche', () => {
    it('rend le choix explicite tel quel, quel que soit le système', () => {
        expect(themeAffiche('sombre', false)).toBe('sombre');
        expect(themeAffiche('clair', true)).toBe('clair');
    });

    it('suit le système en auto', () => {
        expect(themeAffiche('auto', true)).toBe('sombre');
        expect(themeAffiche('auto', false)).toBe('clair');
    });
});

describe('themeSuivant', () => {
    it('fait toujours le contraire de ce qui est affiché', () => {
        expect(themeSuivant('clair', false)).toBe('sombre');
        expect(themeSuivant('sombre', true)).toBe('clair');
    });

    it('depuis auto, fixe explicitement le contraire du système', () => {
        // C'est ce qui rend un seul bouton suffisant : sans choix enregistré,
        // le premier appui va forcément là où le système n'est pas.
        expect(themeSuivant('auto', false)).toBe('sombre');
        expect(themeSuivant('auto', true)).toBe('clair');
    });

    it('deux appuis ramènent à ce qui était affiché', () => {
        const premier = themeSuivant('auto', true);
        expect(themeSuivant(premier, true)).toBe('sombre');
    });
});
