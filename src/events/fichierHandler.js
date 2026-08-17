/**
 * Chargement d'une collecte écrite par le favori
 *
 * Le transport le plus bête, et c'est pour ça qu'il est choisi : un fichier.
 * Il ne suppose ni popup autorisée, ni requête du navigateur vers le réseau
 * local, ni origine complaisante — trois choses que les navigateurs restreignent
 * un peu plus à chaque version, et dont la panne serait incompréhensible pour
 * qui veut juste voir son portefeuille.
 *
 * Le fichier porte le portefeuille en clair. C'est une donnée, pas une clé :
 * elle ne donne accès à rien, et elle s'efface. La page le dit à l'écran.
 */

import { validerEnveloppe, traiterCollecte } from '../business/collecte.js';
import { showError, hideError } from '../ui/modals.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { rafraichirStatuts } from './statusHandler.js';

/**
 * Lit un fichier de collecte et porte son contenu à l'écran
 *
 * @param {File} fichier - Fichier choisi ou déposé
 * @param {Function} avancer - Reçoit un libellé d'étape, chaîne vide pour finir
 * @returns {Promise<boolean>} Vrai si la collecte est affichée
 */
async function chargerFichier(fichier, avancer) {
    hideError();
    avancer(`Lecture de ${fichier.name}…`);

    let enveloppe;

    try {
        enveloppe = JSON.parse(await fichier.text());
    } catch {
        // Le cas courant n'est pas un JSON mal formé mais un mauvais fichier :
        // un export Bricks, une capture, un fichier renommé. Le dire ainsi évite
        // de faire chercher une corruption qui n'existe pas.
        avancer('');
        showError(`« ${fichier.name} » n'est pas un fichier JSON lisible. Le favori écrit un`
            + ' fichier nommé bricks-AAAA-MM-JJ-HHMM.json dans vos téléchargements.');
        return false;
    }

    const verdict = validerEnveloppe(enveloppe);

    if (!verdict.valide) {
        avancer('');
        showError(verdict.erreur);
        return false;
    }

    try {
        const compte = await traiterCollecte(enveloppe.brut, { surAvancement: avancer });

        logger.info(LOG_CATEGORIES.EVENT, 'Collection file loaded', {
            fichier: fichier.name,
            genereLe: enveloppe.genereLe,
            ...compte
        });

        avancer('');

        // Les statuts officiels ne sont pas dans le fichier : projects.bricks.co
        // n'accepte pas d'être appelé depuis app.bricks.co. Ils passent par le
        // proxy, qui n'a besoin d'aucun identifiant — on enchaîne donc tout seul.
        rafraichirStatuts();

        return true;

    } catch (err) {
        logger.error(LOG_CATEGORIES.EVENT, 'Collection file processing failed', err);
        avancer('');
        showError(err.message || 'Le traitement de la collecte a échoué.');
        return false;
    }
}

/**
 * Configure le chargement par fichier : sélection et glisser-déposer
 */
export function setupFichierHandler() {
    const champ = document.getElementById('collecteFichier');
    const zone = document.getElementById('uploadSection');
    const message = document.getElementById('apiLoadingMessage');

    if (!champ) {
        return;
    }

    const avancer = (texte) => {
        if (!message) {
            return;
        }

        message.textContent = texte || 'Chargement des données…';
        message.classList.toggle('hidden', !texte);
    };

    champ.addEventListener('change', async () => {
        const fichier = champ.files && champ.files[0];

        if (fichier) {
            await chargerFichier(fichier, avancer);
        }

        // Remettre le champ à zéro : sans ça, recharger deux fois le même
        // fichier ne déclenche pas de second « change ».
        champ.value = '';
    });

    // Glisser-déposer : le geste naturel juste après un téléchargement
    if (zone) {
        ['dragenter', 'dragover'].forEach(nom => {
            zone.addEventListener(nom, (evenement) => {
                evenement.preventDefault();
                zone.classList.add('depot-actif');
            });
        });

        ['dragleave', 'drop'].forEach(nom => {
            zone.addEventListener(nom, () => zone.classList.remove('depot-actif'));
        });

        zone.addEventListener('drop', async (evenement) => {
            evenement.preventDefault();

            const fichier = evenement.dataTransfer?.files?.[0];

            if (fichier) {
                await chargerFichier(fichier, avancer);
            }
        });
    }

    logger.debug(LOG_CATEGORIES.EVENT, 'Collection file handler configured');
}
