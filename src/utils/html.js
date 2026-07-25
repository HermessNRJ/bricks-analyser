/**
 * Utilitaires d'échappement pour la génération de HTML
 *
 * Les libellés, adresses et descriptions de warnings viennent de l'API : ils sont
 * injectés via innerHTML et doivent donc être échappés pour éviter toute injection
 * de balise ou d'attribut.
 */

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * Échappe une valeur destinée à du HTML (texte ou valeur d'attribut entre guillemets)
 * @param {*} value - Valeur à échapper
 * @returns {string} Chaîne sûre à interpoler
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).replace(/[&<>"']/g, char => HTML_ENTITIES[char]);
}

/**
 * Ne conserve une URL que si son schéma est http(s), pour bloquer javascript: & data:
 * @param {*} url - URL à valider
 * @returns {string} URL sûre, ou chaîne vide
 */
export function safeUrl(url) {
    if (typeof url !== 'string' || url.trim() === '') {
        return '';
    }

    try {
        const parsed = new URL(url, 'https://app.bricks.co');
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
    } catch {
        return '';
    }

    return '';
}

/**
 * Retire les balises HTML d'un texte riche (descriptions de warnings)
 * @param {*} html - Texte potentiellement balisé
 * @returns {string} Texte brut
 */
export function stripTags(html) {
    if (html === null || html === undefined) {
        return '';
    }

    return String(html)
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
}
