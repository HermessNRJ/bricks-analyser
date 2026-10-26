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
 *
 * Le résultat est du texte, pas du HTML sûr : il doit encore passer par
 * escapeHtml avant toute injection, ce que font tous les appelants.
 *
 * Le « > » final est facultatif : une balise jamais refermée — « <script » en
 * fin de description tronquée — passait sinon intacte. Rien n'est perdu à la
 * retirer : la source est du HTML, où un « < » littéral s'écrit « &lt; ». Il
 * ne reste donc aucun « < » dans le texte rendu.
 *
 * Une passe suffit déjà à cela. Elle est pourtant répétée jusqu'à ce que plus
 * rien ne bouge : c'est la forme que l'analyse de code de GitHub reconnaît
 * comme complète, et elle ne coûte qu'une passe à vide.
 *
 * @param {*} html - Texte potentiellement balisé
 * @returns {string} Texte brut
 */
export function stripTags(html) {
    if (html === null || html === undefined) {
        return '';
    }

    let texte = String(html);
    let precedent;

    do {
        precedent = texte;
        texte = texte.replace(/<[^>]*>?/g, '');
    } while (texte !== precedent);

    return texte
        .replace(/&nbsp;/g, ' ')
        .trim();
}
