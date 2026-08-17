/**
 * Fabrique le favori de collecte à partir de la source de l'application
 *
 * Le code que vous installez dans votre barre de favoris est lu, ici et
 * maintenant, dans le fichier src/collecte/extracteur.js servi par votre propre
 * machine. Il ne vient pas d'un domaine tiers et ne se recharge pas à
 * l'exécution : un favori posé aujourd'hui contient exactement le code de la
 * version que vous faites tourner, et il ne changera pas sous vos pieds.
 *
 * C'est la différence qui compte avec un chargeur distant. Un favori qui va
 * chercher son script sur un serveur à chaque clic donne à ce serveur un accès
 * complet au compte, en permanence, sans version à épingler et sans relecture
 * possible. Ici il n'y a rien à faire confiance de plus que ce dépôt.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Chemin de la source, relatif à index.html */
const SOURCE = './src/collecte/extracteur.js';

/**
 * Retire les lignes de commentaire de la source
 *
 * Uniquement les lignes qui ne sont *que* du commentaire : jamais de découpe à
 * l'intérieur d'une ligne de code. Un retrait naïf de tout ce qui suit « // »
 * couperait `'https://api.bricks.co'` en deux, et le favori mourrait sans
 * bruit. Le test `favori.test.js` vérifie que le résultat s'analyse encore et
 * que l'URL de l'API a survécu.
 *
 * La source complète, commentaires compris, reste lisible dans le dépôt : c'est
 * elle qui fait foi, pas cette copie dégraissée.
 *
 * @param {string} source - Contenu de extracteur.js
 * @returns {string} Source sans lignes de commentaire ni lignes vides
 */
export function degraisser(source) {
    return source
        .split('\n')
        .filter(ligne => {
            const nu = ligne.trim();
            return nu !== ''
                && !nu.startsWith('//')
                && !nu.startsWith('/*')
                && !nu.startsWith('*');
        })
        .join('\n');
}

/**
 * Emballe la source en URL « javascript: »
 *
 * `void 0` en fin d'expression : sans lui, la valeur rendue par la dernière
 * instruction remplacerait le document de Bricks si elle se trouvait être une
 * chaîne. L'encodage complet met les sauts de ligne à l'abri des gestionnaires
 * de favoris qui recomposent l'URL.
 *
 * @param {string} source - Contenu de extracteur.js
 * @returns {string} URL exécutable depuis la barre de favoris
 */
export function emballer(source) {
    return 'javascript:' + encodeURIComponent(degraisser(source) + '\nvoid 0;');
}

/**
 * Pose le lien à glisser dans la barre de favoris
 *
 * Le lien n'est pas cliquable sur place : exécuté depuis l'analyseur, le script
 * ne trouverait ni la session ni l'API, et son garde-fou de domaine se
 * contenterait d'une alerte. Le clic explique donc le geste attendu plutôt que
 * de laisser l'utilisateur conclure à une panne.
 *
 * @returns {Promise<boolean>} Vrai si le lien a pu être construit
 */
export async function initFavori() {
    const lien = document.getElementById('favoriCollecte');

    if (!lien) {
        return false;
    }

    try {
        const reponse = await fetch(SOURCE);

        if (!reponse.ok) {
            throw new Error(`${reponse.status} ${reponse.statusText}`);
        }

        const source = await reponse.text();
        lien.href = emballer(source);
        lien.removeAttribute('aria-disabled');

        lien.addEventListener('click', (evenement) => {
            evenement.preventDefault();
            lien.after(messageDeGeste());
        });

        logger.debug(LOG_CATEGORIES.EVENT, 'Collection bookmarklet built', {
            octets: lien.href.length
        });

        return true;

    } catch (err) {
        logger.warn(LOG_CATEGORIES.EVENT, 'Collection bookmarklet unavailable', err);

        lien.setAttribute('aria-disabled', 'true');
        lien.textContent = 'Favori indisponible';
        return false;
    }
}

/**
 * Rappelle que le lien se glisse et ne se clique pas
 * @returns {HTMLElement} Message à insérer sous le lien
 */
function messageDeGeste() {
    const deja = document.getElementById('favoriGeste');

    if (deja) {
        return deja;
    }

    const note = document.createElement('p');
    note.id = 'favoriGeste';
    note.className = 'aide';
    note.setAttribute('role', 'status');
    note.textContent = 'Ce lien se glisse dans la barre de favoris — il ne s\'ouvre pas ici. '
        + 'Une fois posé, cliquez-le depuis un onglet ouvert sur app.bricks.co.';

    return note;
}
