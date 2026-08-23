/**
 * Gestionnaire du bouton d'export
 *
 * L'assemblage est dans src/export/instantane.js ; ici, seulement ce qui touche
 * au bouton : l'attente, le téléchargement et ce qu'on répond ensuite.
 *
 * Un mot sur l'attente. Construire l'instantané demande de relire quarante
 * photos et de les réencoder : deux ou trois secondes, pendant lesquelles le
 * registre se déplie à l'écran. Sans le dire, ça ressemble à un incident. Le
 * bouton annonce donc ce qu'il fait, et le poids du fichier une fois terminé —
 * un export pèse plus qu'on ne s'y attend, et mieux vaut l'apprendre à
 * l'enregistrement qu'en le joignant à un courriel.
 */

import { construireInstantane } from '../export/instantane.js';
import { showError } from '../ui/modals.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Ce qu'on demande avant d'écrire le fichier
 *
 * Le reste de l'application est bâti sur le fait que les données ne bougent
 * pas : c'est ce que dit le favori de collecte, c'est ce que dit le proxy, et
 * c'est ce qui justifie qu'on fasse tourner tout ça chez soi. L'export est la
 * seule commande qui fabrique délibérément une copie destinée à partir
 * ailleurs. Elle mérite d'être demandée, pas seulement documentée.
 *
 * La question dit ce que le fichier porte plutôt que d'agiter un danger : celui
 * qui exporte sait ce qu'il fait, il a juste besoin de savoir ce qu'il emporte.
 *
 * Une confirmation native, comme pour l'effacement des données locales : c'est
 * la même nature de décision, et elle mérite la même forme.
 */
export const AVERTISSEMENT = [
    'Le fichier produit contiendra tout votre portefeuille en clair : adresses, montants, arriérés et photos, sans aucune protection.',
    '',
    'Continuer ?'
].join('\n');

/** Étapes annoncées pendant la construction */
const ETAPES = {
    carte: 'Tracé de la carte…',
    registre: 'Dépliage du registre…',
    vignettes: 'Intégration des photos…',
    styles: 'Assemblage du fichier…'
};

/**
 * Poids d'un fichier, en unités lisibles
 * @param {number} octets - Taille en octets
 * @returns {string} Poids arrondi, « 1,8 Mo »
 */
export function poidsLisible(octets) {
    if (octets < 1024) {
        return `${octets} o`;
    }

    if (octets < 1024 * 1024) {
        return `${Math.round(octets / 1024)} Ko`;
    }

    return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Ce que le bouton répond une fois le fichier enregistré
 *
 * Les photos restées distantes sont dites, parce qu'elles changent la nature du
 * fichier : il n'est plus tout à fait autonome, et s'ouvrira sans elles sur une
 * machine hors ligne. C'est le cas quand l'application tourne sans Docker, donc
 * sans le relais que nginx ouvre vers la galerie.
 *
 * @param {number} octets - Poids du fichier
 * @param {{integrees: number, distantes: number}} vignettes - Bilan des photos
 * @returns {string} Message court
 */
export function messageExport(octets, vignettes) {
    const poids = poidsLisible(octets);

    if (vignettes.distantes > 0) {
        return `${poids} · ${vignettes.distantes} photo${vignettes.distantes > 1 ? 's' : ''} non intégrée${vignettes.distantes > 1 ? 's' : ''}`;
    }

    return `${poids} · enregistré`;
}

/**
 * Déclenche l'enregistrement du fichier
 * @param {string} html - Document complet
 * @param {string} nom - Nom du fichier proposé
 */
function telecharger(html, nom) {
    const adresse = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const lien = document.createElement('a');

    lien.href = adresse;
    lien.download = nom;
    document.body.append(lien);
    lien.click();
    lien.remove();

    URL.revokeObjectURL(adresse);
}

/**
 * Configure le bouton d'export du tableau de bord
 */
export function setupExport() {
    const bouton = document.getElementById('exportBtn');
    const etat = document.getElementById('exportEtat');

    if (!bouton || !etat) {
        return;
    }

    bouton.addEventListener('click', async () => {
        if (!confirm(AVERTISSEMENT)) {
            logger.debug(LOG_CATEGORIES.EVENT, 'Dashboard export declined');
            return;
        }

        bouton.disabled = true;

        try {
            const { html, vignettes, nom } = await construireInstantane({
                avancement: (etape) => { etat.textContent = ETAPES[etape] || ''; }
            });

            telecharger(html, nom);
            etat.textContent = messageExport(new Blob([html]).size, vignettes);

            logger.info(LOG_CATEGORIES.EVENT, 'Dashboard exported', { nom });
        } catch (err) {
            etat.textContent = '';
            showError(`L'export n'a pas abouti : ${err.message}`);
            logger.error(LOG_CATEGORIES.EVENT, 'Dashboard export failed', { err: err.message });
        } finally {
            bouton.disabled = false;
        }
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'Export handler configured');
}
