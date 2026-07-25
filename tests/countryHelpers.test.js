import { describe, it, expect } from 'vitest';
import {
    detectCountryFromProjectName,
    detectCountryFromProject
} from '../src/utils/countryHelpers.js';

describe('detectCountryFromProjectName', () => {
    it('détecte le pays depuis un emoji de drapeau', () => {
        expect(detectCountryFromProjectName('Appartement Lisbonne 🇵🇹')).toBe('Portugal');
        expect(detectCountryFromProjectName('🇪🇸 Villa Malaga')).toBe('Espagne');
    });

    it('prend le premier drapeau quand il y en a plusieurs', () => {
        expect(detectCountryFromProjectName('Duo 🇮🇹 et 🇩🇪')).toBe('Italie');
    });

    it('retombe sur France sans drapeau', () => {
        expect(detectCountryFromProjectName('Immeuble Lyon 3e')).toBe('France');
    });

    it('retombe sur France pour un drapeau non répertorié', () => {
        expect(detectCountryFromProjectName('Projet 🇯🇵 Tokyo')).toBe('France');
    });

    it('gère les entrées vides', () => {
        expect(detectCountryFromProjectName('')).toBe('France');
        expect(detectCountryFromProjectName(null)).toBe('France');
    });
});

describe('detectCountryFromProject', () => {
    it('lit le nom localisé fr en priorité', () => {
        const project = { name: { fr: 'Maison 🇵🇹 Porto', en: 'House 🇪🇸 Porto' } };
        expect(detectCountryFromProject(project)).toBe('Portugal');
    });

    it('retombe sur le nom en si le nom fr n\'a pas de drapeau', () => {
        const project = { name: { fr: 'Maison Porto', en: 'House 🇵🇹 Porto' } };
        expect(detectCountryFromProject(project)).toBe('Portugal');
    });

    it('accepte un nom sous forme de chaîne simple', () => {
        expect(detectCountryFromProject({ name: 'Chalet 🇨🇭 Verbier' })).toBe('Suisse');
    });

    it('retombe sur France si aucun nom exploitable', () => {
        expect(detectCountryFromProject({})).toBe('France');
        expect(detectCountryFromProject({ name: {} })).toBe('France');
    });
});
