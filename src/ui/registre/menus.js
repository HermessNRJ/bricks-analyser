/**
 * Les menus déroulants de la barre de filtres
 *
 * Leur contenu dépend du portefeuille : on ne propose « Portugal » que si l'on
 * y détient quelque chose, et le menu des départements ne liste que ceux où du
 * capital est posé. Remplir ces menus n'a rien à voir avec filtrer, et c'est
 * tout ce que fait ce module.
 */

import { logger, LOG_CATEGORIES } from '../../utils/logger.js';
import { ecrirePreference } from '../../core/preferences.js';
import { regionsPresentes, departementsPresents, localisations, DEPARTEMENTS } from '../../business/geographie.js';

/**
 * Libellés des filtres, pour les puces de rappel
 * La clé 'all' n'apparaît jamais : c'est l'état neutre.
 */
export const LIBELLES_FILTRES = {
    filter: {
        active: 'Actives', refunded: 'Remboursées',
        ongoing: 'En financement', upcoming: 'À venir'
    },
    warningFilter: {
        'warning-current-month': 'Alerte ce mois-ci',
        'has-warning': 'Avec alerte', 'no-warning': 'Sans alerte',
        'risk-procedure': 'En défaut, échéances dues', 'risk-impaye': 'En retard, défaut non déclaré',
        'risk-signale': 'Signalé, sans incident', 'risk-sain': 'Sans signalement',
        'warning-last-month': 'Alerte sous 30 jours', 'warning-month-before': 'Alerte le mois d\'avant'
    },
    versementFilter: {
        verse: 'Versé', manquant: 'Rien reçu', attendu: 'Pas encore dû'
    }
};

/**
 * Nomme un département pour la puce de rappel
 * « 06 » seul ne dit rien à qui ne connaît pas la numérotation par cœur.
 * @param {string} code - Code du département
 * @returns {string} « 06 — Alpes-Maritimes »
 */
export function libelleDepartement(code) {
    const departement = DEPARTEMENTS[code];
    return departement ? `${code} — ${departement[0]}` : code;
}

/**
 * Remplit le dropdown des pays avec les pays disponibles
 * @param {Array} properties - Liste des propriétés
 * @param {string} choisi - Pays retenu, à réafficher une fois le menu réécrit
 */
export function populateCountryFilter(properties, choisi) {
    const countryFilterSelect = document.getElementById('propertyCountryFilter');
    if (!countryFilterSelect) return;

    // Extraire les pays uniques
    const countries = [...new Set(properties.map(p => p.country))].sort();

    // Garder l'option "Tous" et ajouter les pays
    countryFilterSelect.innerHTML = '<option value="all">Tous</option>';

    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        countryFilterSelect.appendChild(option);
    });

    // Restaurer la sélection sauvegardée
    countryFilterSelect.value = choisi;

    logger.debug(LOG_CATEGORIES.UI, 'Country filter populated', { countries: countries.length });
}

/**
 * Remplit les menus de région et de département
 *
 * Seulement ce que le portefeuille contient : dérouler les treize régions et
 * les cent un départements de France obligerait à chercher les quarante qui
 * répondent quelque chose.
 *
 * Un réglage retenu d'une visite précédente qui ne correspond plus à rien est
 * rouvert d'office : un portefeuille dont le dernier bien breton a été
 * remboursé afficherait sinon un registre vide, sans que le menu ne montre
 * pourquoi.
 *
 * Les réglages caducs ne sont pas corrigés sur place : ils sont rendus à
 * l'appelant, qui seul détient l'état du registre. Ce module remplit des menus
 * et dit ce qui n'y figure plus ; il ne décide pas à la place de personne.
 *
 * @param {Array} properties - Propriétés annotées par annoterGeographie
 * @param {Object} retenus - Réglages en vigueur
 * @param {string} retenus.region - Région retenue
 * @param {string} retenus.departement - Département retenu
 * @param {string} retenus.lieu - Localisation retenue
 * @returns {{region: string, departement: string, lieu: string}} Les mêmes, épurés
 */
export function populateGeoFilters(properties, { region, departement, lieu }) {
    const regions = regionsPresentes(properties);
    const departements = departementsPresents(properties);

    remplirMenu('propertyRegionFilter', 'Toutes',
        regions.map(r => ({ valeur: r, texte: r })));
    remplirMenu('propertyDepartementFilter', 'Tous',
        departements.map(d => ({ valeur: d.code, texte: `${d.code} — ${d.nom}` })));

    let regionRetenue = region;
    let departementRetenu = departement;
    let lieuRetenu = lieu;

    if (regionRetenue !== 'all' && !regions.includes(regionRetenue)) {
        regionRetenue = 'all';
        ecrirePreference('propertyRegionFilter', 'all');
    }

    if (departementRetenu !== 'all'
        && !departements.some(d => d.code === departementRetenu)) {
        departementRetenu = 'all';
        ecrirePreference('propertyDepartementFilter', 'all');
    }

    // Le lieu n'a pas de menu — il vient d'un clic dans le tableau — mais il
    // survit à la visite comme les autres, et se vérifie donc de même : une
    // commune dont le dernier bien a été remboursé viderait le registre.
    if (lieuRetenu !== 'all'
        && !localisations(properties).some(l => l.cle === lieuRetenu)) {
        lieuRetenu = 'all';
        ecrirePreference('propertyLieuFilter', 'all');
    }

    const menuRegion = document.getElementById('propertyRegionFilter');
    const menuDepartement = document.getElementById('propertyDepartementFilter');

    if (menuRegion) menuRegion.value = regionRetenue;
    if (menuDepartement) menuDepartement.value = departementRetenu;

    logger.debug(LOG_CATEGORIES.UI, 'Geography filters populated', {
        regions: regions.length,
        departements: departements.length
    });

    return { region: regionRetenue, departement: departementRetenu, lieu: lieuRetenu };
}

/**
 * Réécrit les options d'un menu, en gardant son entrée « tout »
 * @param {string} id - Identifiant du <select>
 * @param {string} libelleTout - Texte de l'option neutre
 * @param {Array<Object>} options - [{ valeur, texte }]
 */
export function remplirMenu(id, libelleTout, options) {
    const menu = document.getElementById(id);

    if (!menu) {
        return;
    }

    menu.replaceChildren();

    [{ valeur: 'all', texte: libelleTout }, ...options].forEach(({ valeur, texte }) => {
        const option = document.createElement('option');
        option.value = valeur;
        option.textContent = texte;
        menu.appendChild(option);
    });
}
