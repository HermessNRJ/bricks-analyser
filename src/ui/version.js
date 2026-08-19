/**
 * Version de l'application, et signalement d'une version plus récente
 *
 * Le numéro qui tourne est affiché en permanence dans le pied de page : sans
 * lui, personne ne pouvait dire quelle version il avait sous les yeux, et un
 * rapport de bug ne pouvait pas le préciser.
 *
 * Une fois par jour, la dernière release publiée est demandée à GitHub via le
 * proxy nginx. C'est le seul appel sortant que l'application fait d'elle-même,
 * et il faut savoir ce qu'il coûte : rien du portefeuille n'y passe — la
 * requête ne porte que le nom du dépôt — mais GitHub apprend l'adresse IP d'où
 * l'outil tourne, une fois par jour. C'est dit dans docs/securite.md.
 *
 * Les deux vérifications n'ont pas le même contrat, et c'est délibéré.
 *
 * L'automatique se tait dans trois cas : hors ligne, quota atteint, ou version
 * locale en avance sur la dernière release — le cas normal quand on travaille
 * sur main après un tag. Personne ne l'a demandée ; une fausse alerte, ou une
 * erreur affichée pour un service dont on n'attendait rien, coûte plus cher que
 * le silence.
 *
 * Celle qu'on déclenche en cliquant le numéro doit répondre, toujours. Un clic
 * sans réponse se lit comme une panne de l'interface, et l'absence de nouvelle
 * n'y est plus une bonne nouvelle : « à jour » et « vérification impossible »
 * sont deux informations différentes, et celui qui a cliqué a le droit de
 * savoir laquelle il a obtenue.
 */

import { CONFIG } from '../core/config.js';
import { lirePreference, ecrirePreference } from '../core/preferences.js';
import { miseAJourDisponible, analyserVersion } from '../utils/version.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Page des versions publiées, écrite en dur : aucune URL ne vient du réseau */
const PAGE_RELEASES = 'https://github.com/HermessNRJ/bricks-analyser/releases';

/**
 * Ce qu'il faut taper pour se mettre à jour, en une seule commande
 *
 * Les trois temps sont enchaînés parce que les faire faire à la main laissait
 * le plus important de côté : `docker pull` seul ne change rien tant que le
 * conteneur qui tourne porte encore l'ancienne image, et on croyait avoir
 * monté de version.
 *
 * `docker rm -f` sur un conteneur absent sort en 0 — la commande vaut donc
 * aussi pour une première installation. Le conteneur ne détient rien : le
 * portefeuille vit dans le localStorage du navigateur, pas dans l'image.
 *
 * Elle suppose le conteneur nommé « bricks » et publié sur 8080, ce que le
 * README donne comme voie principale. Qui a cloné le dépôt et passe par
 * docker-compose met à jour autrement, et le README le dit à côté.
 *
 * Coupée à la main, aux barres obliques inversées, plutôt que laissée au
 * navigateur : livrée d'un seul tenant, elle se repliait après le tiret de
 * « --name », qui est une occasion de coupure comme une autre pour lui. Une
 * commande qui affiche « -name » sur la ligne suivante est fausse à la
 * lecture, même si le copier-coller, lui, reste juste.
 */
const COMMANDE = [
    'docker pull ghcr.io/hermessnrj/bricks-analyser:latest \\',
    '  && docker rm -f bricks \\',
    '  && docker run -d -p 8080:80 --name bricks ghcr.io/hermessnrj/bricks-analyser:latest'
].join('\n');

/**
 * Faut-il redemander la dernière version publiée ?
 *
 * @param {number} derniereVerification - Horodatage du dernier appel
 * @param {number} maintenant - Horodatage courant
 * @param {number} intervalle - Délai minimal entre deux appels
 * @returns {boolean} Vrai s'il est temps de redemander
 */
export function verificationDue(derniereVerification, maintenant, intervalle) {
    // Une horloge reculée — changement de fuseau, correction NTP — rendrait
    // l'écart négatif et figerait la vérification pour toujours si on se
    // contentait de comparer la différence à l'intervalle.
    if (!Number.isFinite(derniereVerification) || derniereVerification > maintenant) {
        return true;
    }

    return maintenant - derniereVerification >= intervalle;
}

/**
 * Extrait le numéro de version d'une réponse de l'API GitHub
 *
 * Seul `tag_name` est lu, et il ne survit que s'il ressemble à un numéro de
 * version : rien de ce que renvoie le réseau n'arrive tel quel dans la page.
 * `html_url` est ignoré — l'adresse de la page des versions est écrite en dur,
 * une URL reçue n'a pas à devenir un lien.
 *
 * @param {*} charge - Corps JSON de la réponse
 * @returns {string|null} Numéro de version, ou null si la réponse ne dit rien
 */
export function versionPubliee(charge) {
    const tag = charge?.tag_name;

    return analyserVersion(tag) ? tag.trim() : null;
}

/**
 * Ce qu'une vérification manuelle affiche à côté du numéro
 *
 * @param {string} etat - Issue de l'appel : 'ok' ou 'injoignable'
 * @param {string} locale - Version qui tourne
 * @param {string|null} publiee - Dernière version publiée, si elle est connue
 * @returns {string} Message court, vide s'il y a mieux à dire ailleurs
 */
export function messageVerification(etat, locale, publiee) {
    if (etat !== 'ok' || !publiee) {
        // Sans Docker, /version-api n'existe pas et l'appel finit en 404. Dire
        // « aucune version plus récente » serait un mensonge : on n'en sait
        // rien.
        return 'vérification impossible';
    }

    // Une version plus récente s'annonce sur sa propre ligne, avec la marche à
    // suivre : la répéter ici en trois mots ne servirait à rien.
    return miseAJourDisponible(locale, publiee) ? '' : 'à jour';
}

/**
 * Écrit la ligne d'invitation à monter de version, ou l'efface
 *
 * Exportée pour être éprouvée : c'est la seule branche que ni les tests
 * unitaires ni le smoke n'atteignaient — le premier ne touche pas au DOM, le
 * second tourne sans relais et n'a donc jamais de version plus récente à
 * annoncer. Une faute d'inattention y est passée inaperçue jusqu'à l'écran.
 *
 * @param {HTMLElement} hote - Paragraphe dédié, sous celui de la licence
 * @param {string} locale - Version qui tourne
 * @param {string} publiee - Dernière version connue, éventuellement vide
 */
export function afficherMiseAJour(hote, locale, publiee) {
    hote.textContent = '';

    if (!miseAJourDisponible(locale, publiee)) {
        return;
    }

    const lien = document.createElement('a');
    lien.href = PAGE_RELEASES;
    lien.textContent = `La ${analyserVersion(publiee).join('.')} est disponible`;

    const texte = document.createElement('code');
    texte.textContent = COMMANDE;

    const commande = document.createElement('pre');
    commande.append(texte);

    hote.append(lien, ' :', commande);

    logger.info(LOG_CATEGORIES.UI, 'Newer version available', { locale, publiee });
}

/**
 * Demande la dernière version publiée et la retient
 *
 * @returns {Promise<{etat: string, publiee: string|null}>} Issue de l'appel
 */
async function interroger() {
    try {
        const reponse = await fetch(CONFIG.VERSION_ENDPOINT, {
            headers: { Accept: 'application/json' }
        });

        // 404 sans Docker — « npm run serve » ne relaie rien —, 403 si le quota
        // GitHub est atteint. Ni l'un ni l'autre n'est une anomalie à signaler
        // de lui-même ; c'est le clic, s'il y en a eu un, qui appelle une
        // réponse.
        if (!reponse.ok) {
            logger.debug(LOG_CATEGORIES.API, 'Version check skipped', { statut: reponse.status });
            return { etat: 'injoignable', publiee: null };
        }

        const publiee = versionPubliee(await reponse.json());

        if (publiee) {
            ecrirePreference('versionDistante', publiee);
        }

        // L'horodatage est posé même quand la réponse ne dit rien d'exploitable :
        // sans cela, une API muette ferait réessayer à chaque chargement.
        ecrirePreference('versionVerifieeLe', Date.now());

        return { etat: publiee ? 'ok' : 'injoignable', publiee };
    } catch (err) {
        logger.debug(LOG_CATEGORIES.API, 'Version check unreachable', { err: err.message });
        return { etat: 'injoignable', publiee: null };
    }
}

/**
 * Affiche la version et vérifie, au plus une fois par jour, s'il y a mieux
 */
export function setupVersion() {
    const bouton = document.getElementById('versionApp');
    const etat = document.getElementById('versionEtat');
    const annonce = document.getElementById('versionMaj');

    if (!bouton || !etat || !annonce) {
        return;
    }

    const locale = CONFIG.VERSION;
    bouton.textContent = `Version ${locale}`;

    // Ce qu'on sait déjà s'affiche tout de suite : le pied de page ne doit pas
    // attendre le réseau pour être juste.
    afficherMiseAJour(annonce, locale, lirePreference('versionDistante'));

    // L'appel en vol tient lieu de verrou : un second clic s'y rattache au lieu
    // d'en lancer un autre, et le désarmement ne dépend pas d'un booléen relu
    // après une attente.
    let enVol = null;

    /**
     * @param {boolean} manuelle - Vrai si l'appel vient d'un clic
     * @returns {Promise} L'appel en cours
     */
    const verifier = (manuelle) => {
        if (enVol) {
            return enVol;
        }

        if (manuelle) {
            bouton.disabled = true;
            etat.textContent = ' · vérification…';
        }

        enVol = interroger()
            .then(({ etat: issue, publiee }) => {
                afficherMiseAJour(annonce, locale, publiee || lirePreference('versionDistante'));

                if (manuelle) {
                    const message = messageVerification(issue, locale, publiee);
                    etat.textContent = message ? ` · ${message}` : '';
                    bouton.disabled = false;
                }
            })
            .finally(() => {
                enVol = null;
            });

        return enVol;
    };

    bouton.addEventListener('click', () => verifier(true));

    if (verificationDue(lirePreference('versionVerifieeLe'), Date.now(), CONFIG.VERSION_INTERVALLE_MS)) {
        verifier(false);
    }
}
