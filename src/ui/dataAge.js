/**
 * Affichage de l'âge des données
 *
 * Les chiffres du tableau de bord viennent du localStorage, parfois vieux de
 * plusieurs semaines. Sans repère, un filtre comme « alerte ce mois-ci » qui
 * renvoie zéro se lit comme une bonne nouvelle alors qu'il traduit simplement
 * des données qui n'ont pas été rafraîchies.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

// Au-delà de ce délai, l'âge des données est signalé plutôt que mentionné
const SEUIL_PERIME_JOURS = 14;

/**
 * Nombre de jours de calendrier écoulés depuis une date
 *
 * Des tranches de vingt-quatre heures ne conviennent pas : un relevé pris hier
 * à 20 h 50 et consulté ce matin à 10 h en compte moins d'une, et s'annonçait
 * donc « aujourd'hui à 20:50 » — une heure encore à venir. Ce sont les dates
 * qui se comparent, minuit à minuit et en heure locale, celle qu'affiche le
 * libellé.
 *
 * @param {Date} date - Date de référence
 * @param {Date} [maintenant] - Instant de comparaison
 * @returns {number} Nombre de jours
 */
export function joursDepuis(date, maintenant = new Date()) {
    const millisecondesParJour = 24 * 60 * 60 * 1000;
    const minuit = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    // Arrondi et non troncature : les changements d'heure font des journées de
    // 23 ou 25 heures, qui donneraient sinon un jour de moins deux fois l'an.
    return Math.round((minuit(maintenant) - minuit(date)) / millisecondesParJour);
}

/**
 * Formule l'âge des données en français
 * @param {string|null} savedAt - Date ISO de récupération, ou null si inconnue
 * @param {Date} [maintenant] - Instant de comparaison
 * @returns {{texte: string, estPerime: boolean}|null} Libellé, ou null si rien à dire
 */
export function decrireAge(savedAt, maintenant = new Date()) {
    if (!savedAt) {
        return null;
    }

    const date = new Date(savedAt);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const jours = joursDepuis(date, maintenant);

    // Une date postérieure à maintenant vient d'une horloge décalée : on
    // n'annonce pas des données « dans 2 jours ».
    const anciennete = Math.max(0, jours);

    const dateLisible = date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // L'heure vaut surtout pour la journée en cours : Bricks règle autour du 8
    // du mois, et savoir qu'un relevé a été pris à 7 h plutôt qu'à 19 h dit si
    // les versements du jour avaient eu le temps d'y figurer.
    const heure = date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Répéter la date complète quand elle est du jour n'apprend rien : le
    // repère utile est alors l'heure seule.
    let quand;
    if (anciennete === 0) {
        quand = `aujourd'hui à ${heure}`;
    } else if (anciennete === 1) {
        quand = `hier à ${heure}`;
    } else {
        quand = `le ${dateLisible} à ${heure}, il y a ${anciennete} jours`;
    }

    return {
        texte: `Données récupérées ${quand}.`,
        estPerime: anciennete >= SEUIL_PERIME_JOURS
    };
}

/**
 * Affiche l'âge des données sous le panneau de session
 * @param {string|null} savedAt - Date ISO de récupération
 */
export function afficherAgeDonnees(savedAt) {
    const element = document.getElementById('dataAge');

    if (!element) {
        return;
    }

    const age = decrireAge(savedAt);

    if (!age) {
        element.classList.add('hidden');
        element.textContent = '';
        return;
    }

    element.textContent = age.estPerime
        ? `${age.texte} Rechargez-les pour tenir compte des dernières alertes.`
        : age.texte;

    element.classList.toggle('est-perime', age.estPerime);
    element.classList.remove('hidden');

    logger.debug(LOG_CATEGORIES.UI, 'Data age displayed', { savedAt, estPerime: age.estPerime });
}
