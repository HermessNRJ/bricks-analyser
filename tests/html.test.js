import { describe, it, expect } from 'vitest';
import { escapeHtml, safeUrl, stripTags } from '../src/utils/html.js';

describe('escapeHtml', () => {
    it('neutralise les balises', () => {
        expect(escapeHtml('<script>alert(1)</script>'))
            .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('neutralise les sorties d\'attribut', () => {
        expect(escapeHtml('" onmouseover="alert(1)'))
            .toBe('&quot; onmouseover=&quot;alert(1)');
        expect(escapeHtml("' onclick='x")).toBe('&#39; onclick=&#39;x');
    });

    it('échappe les & sans double échappement des entités déjà produites', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('laisse passer un texte normal, accents et emojis inclus', () => {
        expect(escapeHtml('Villa 🇵🇹 Porto — 6,5%')).toBe('Villa 🇵🇹 Porto — 6,5%');
    });

    it('gère les valeurs non textuelles', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(6.5)).toBe('6.5');
    });
});

describe('safeUrl', () => {
    it('accepte http et https', () => {
        expect(safeUrl('https://cdn.bricks.co/a.png')).toBe('https://cdn.bricks.co/a.png');
        expect(safeUrl('http://cdn.bricks.co/a.png')).toBe('http://cdn.bricks.co/a.png');
    });

    it('rejette les schémas dangereux', () => {
        expect(safeUrl('javascript:alert(1)')).toBe('');
        expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
        expect(safeUrl('vbscript:msgbox')).toBe('');
    });

    it('rejette les valeurs vides ou non textuelles', () => {
        expect(safeUrl('')).toBe('');
        expect(safeUrl('   ')).toBe('');
        expect(safeUrl(null)).toBe('');
        expect(safeUrl(42)).toBe('');
    });

    it('résout les chemins relatifs sur le domaine Bricks', () => {
        expect(safeUrl('/media/a.png')).toBe('https://app.bricks.co/media/a.png');
    });
});

describe('stripTags', () => {
    it('retire les balises et les espaces insécables encodés', () => {
        expect(stripTags('<p>Retard&nbsp;de travaux</p>')).toBe('Retard de travaux');
    });

    it('gère les entrées vides', () => {
        expect(stripTags(null)).toBe('');
        expect(stripTags('')).toBe('');
    });
});
