/**
 * La section Géographie
 *
 * Trois lectures du même capital : combien de départements il couvre, comment
 * il se répartit entre régions, et où exactement il se trouve. La question à
 * laquelle elle répond n'est pas « où sont mes biens » — le registre le dit
 * déjà, fiche par fiche — mais « à quel point sont-ils au même endroit ».
 *
 * Repliée par défaut, et dessinée seulement au premier dépliage. Ce n'est pas
 * une précaution de principe : le tableau des localisations fait une ligne par
 * commune, et sur un portefeuille de 241 biens il s'en compose une centaine,
 * qu'on ne regarde pas à chaque visite.
 *
 * Aucune couleur : dans ce système visuel elle est réservée à l'argent et au
 * risque, et une région n'est ni l'un ni l'autre. Ce sont les longueurs de
 * barres qui portent les montants — les teinter n'ajouterait rien à ce que la
 * longueur dit déjà.
 */

import {
    agregerParRegion, localisations, resumeGeographie, IMPRECISE
} from '../business/geographie.js';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters.js';
import { escapeHtml } from '../utils/html.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { pluriel } from './libelles.js';
import { updatePropertySortAndFilter } from './registre.js';
import { dessinerCarte } from './carte.js';

// Dernières propriétés reçues : le dépliage arrive longtemps après le calcul.
let dernieresProprietes = null;

// Un portefeuille rechargé doit être redessiné, un dépliage répété non.
let dessinee = false;

// Les localisations du dernier tracé, et le terme qui les tamise. Gardées ici
// pour que filtrer ne fasse que retrier une liste déjà calculée.
let lieuxCourants = [];
let recherche = '';

/**
 * Reçoit les propriétés annotées et prépare la section
 * @param {Array} properties - Propriétés portant leur champ `geo`
 */
export function initGeographie(properties) {
    dernieresProprietes = properties;
    dessinee = false;

    // Un portefeuille rechargé n'a pas de raison d'arriver déjà tamisé : la
    // recherche portait sur la liste d'avant.
    recherche = '';

    const champ = document.getElementById('geoRecherche');

    if (champ) {
        champ.value = '';
    }

    const section = document.getElementById('geographieSection');

    if (!section) {
        return;
    }

    const resume = resumeGeographie(properties);

    // Rien d'engagé, rien à situer : la section disparaît plutôt que d'afficher
    // trois zéros et un tableau vide.
    section.classList.toggle('hidden', resume.capital <= 0);

    // Le repli ne se referme pas à chaque rendu : quelqu'un qui recharge ses
    // données en gardant la section ouverte doit la retrouver ouverte, à jour.
    if (section.open) {
        dessiner();
    }
}

/**
 * Installe le dépliage
 * Appelé une fois au démarrage, avant même qu'il y ait des données.
 */
export function setupGeographie() {
    const section = document.getElementById('geographieSection');

    if (!section) {
        logger.warn(LOG_CATEGORIES.UI, 'Geography section not found');
        return;
    }

    section.addEventListener('toggle', () => {
        if (section.open) {
            dessiner();
        }
    });

    const champ = document.getElementById('geoRecherche');

    if (champ) {
        champ.addEventListener('input', (evenement) => {
            recherche = evenement.target.value;
            remplirLieux();
        });
    }

    // Délégation : les lignes sont réécrites à chaque recherche, et poser un
    // écouteur sur chacune en aurait laissé autant derrière à chaque frappe.
    const corps = document.getElementById('geoLieuxCorps');

    if (corps) {
        corps.addEventListener('click', (evenement) => {
            const ligne = evenement.target.closest('tr[data-lieu]');

            if (ligne) {
                montrerDansLeRegistre(ligne.dataset.lieu);
            }
        });
    }

    logger.debug(LOG_CATEGORIES.UI, 'Geography section configured');
}

/**
 * Renvoie au registre, filtré sur un lieu
 *
 * Le même geste que les tuiles d'incident : un chiffre agrégé doit pouvoir être
 * vérifié sur pièces, et la pièce ici est la fiche de chaque bien. Le filtre est
 * rappelé en puce au-dessus de la grille, et se retire comme les autres.
 *
 * @param {string} cle - Clé du lieu, telle que cleLieu la compose
 */
function montrerDansLeRegistre(cle) {
    updatePropertySortAndFilter({ lieuFilter: cle });

    document.querySelector('.properties-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    logger.info(LOG_CATEGORIES.UI, 'Registry filtered from geography', { lieu: cle });
}

/**
 * Dessine la section, une fois par jeu de données
 */
function dessiner() {
    if (dessinee || !dernieresProprietes) {
        return;
    }

    const resume = resumeGeographie(dernieresProprietes);
    const regions = agregerParRegion(dernieresProprietes);

    lieuxCourants = localisations(dernieresProprietes);

    remplirResume(resume);
    remplirRegions(regions);
    remplirLieux();

    // Le tracé arrive du réseau : il ne fait pas attendre le reste de la
    // section, et la carte apparaît dans la place qui lui est réservée.
    dessinerCarte(dernieresProprietes);

    dessinee = true;

    logger.info(LOG_CATEGORIES.UI, 'Geography section rendered', {
        regions: regions.length,
        lieux: lieuxCourants.length,
        imprecises: resume.imprecises
    });
}

/**
 * Les trois compteurs et la phrase de concentration
 * @param {Object} resume - Sortie de resumeGeographie
 */
function remplirResume(resume) {
    ecrire('geoDepartements', formatNumber(resume.departements));
    ecrire('geoVilles', formatNumber(resume.villes));
    ecrire('geoPremiereRegion', resume.premiere ? resume.premiere.region : '—');
    ecrire('geoPremierePart', resume.premiere
        ? `${formatPercentage(resume.premiere.part, 0)} du capital engagé`
        : '');

    const note = document.getElementById('geoNote');

    if (!note) {
        return;
    }

    // Aucun seuil : dire « concentration élevée » au-delà d'un chiffre choisi
    // ici serait un jugement que rien dans les données ne fonde. Le pourcentage
    // est donné, la lecture appartient au lecteur.
    const parts = [];

    if (resume.premiere) {
        parts.push(`Votre première région pèse ${formatPercentage(resume.premiere.part, 0)}`
            + ` du capital engagé, répartie sur ${formatNumber(resume.premiere.projets)}`
            + ` propriété${pluriel(resume.premiere.projets)}.`);
    }

    if (resume.imprecises > 0) {
        const seule = resume.imprecises === 1;

        parts.push(`${formatNumber(resume.imprecises)} propriété${pluriel(resume.imprecises)}`
            + ` n'${seule ? 'a' : 'ont'} pas d'adresse exploitable :`
            + ` ${seule ? 'elle apparaît' : 'elles apparaissent'} sous « Localisation imprécise ».`
            + ' Le classement se fait sur le code postal, que toutes les annonces ne portent pas.');
    }

    note.textContent = parts.join(' ');
    note.classList.toggle('hidden', parts.length === 0);
}

/**
 * Les barres du capital par région
 * @param {Array} regions - Sortie de agregerParRegion
 */
function remplirRegions(regions) {
    const cadre = document.getElementById('geoRegions');

    if (!cadre) {
        return;
    }

    // Les barres se mesurent à la plus longue et non au total : rapportées au
    // total, treize régions donneraient treize traits également écrasés.
    const maximum = regions[0]?.capital || 1;

    cadre.innerHTML = regions.map(r => `
        <div class="geo-region${r.region === IMPRECISE ? ' est-imprecise' : ''}">
            <span class="geo-region-nom">${escapeHtml(r.region)}</span>
            <span class="geo-region-piste">
                <span class="geo-region-barre" style="width: ${(r.capital / maximum * 100).toFixed(1)}%"></span>
            </span>
            <span class="geo-region-montant montant">${formatCurrency(r.capital, 0)}</span>
            <span class="geo-region-part">${partLisible(r.part)}</span>
        </div>
    `).join('');
}

/**
 * Tout ce sur quoi la recherche mord, pour une ligne
 *
 * Les colonnes de texte, et elles seules : chercher dans les montants ferait
 * répondre « 250 » à qui tape un code de département, et les chiffres sont déjà
 * triés par la colonne Capital.
 *
 * @param {Object} lieu - Une localisation
 * @returns {string} Texte comparable, en minuscules
 */
function texteCherchable(lieu) {
    return [lieu.ville, lieu.departement, lieu.nomDepartement, lieu.region]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

/**
 * Le tableau des localisations, tamisé par la recherche courante
 */
function remplirLieux() {
    const corps = document.getElementById('geoLieuxCorps');
    const compte = document.getElementById('geoLieuxCompte');

    const terme = recherche.trim().toLowerCase();
    const retenus = terme
        ? lieuxCourants.filter(l => texteCherchable(l).includes(terme))
        : lieuxCourants;

    if (compte) {
        // Le total reste affiché à côté du nombre retenu : sans lui, on ne sait
        // pas si la recherche a écarté trois lignes ou quatre-vingts.
        compte.textContent = terme
            ? `${formatNumber(retenus.length)} sur ${formatNumber(lieuxCourants.length)} localisations`
            : `${formatNumber(lieuxCourants.length)} localisation${pluriel(lieuxCourants.length)}`;
    }

    if (!corps) {
        return;
    }

    if (retenus.length === 0) {
        corps.innerHTML = '<tr class="geo-lieux-vide"><td colspan="6">Aucune localisation ne correspond.</td></tr>';
        return;
    }

    // La ligne entière est cliquable pour la commodité, mais c'est le bouton du
    // nom de commune qui porte l'action : une ligne de tableau ne se sélectionne
    // ni au clavier ni au lecteur d'écran.
    corps.innerHTML = retenus.map(l => `
        <tr data-lieu="${escapeHtml(l.cle)}">
            <td>
                <button type="button" class="geo-lieu-bouton">${escapeHtml(l.ville || 'Commune non précisée')}</button>
            </td>
            <td class="geo-departement">${l.departement
        ? `${escapeHtml(l.departement)} — ${escapeHtml(l.nomDepartement)}`
        : '—'}</td>
            <td>${escapeHtml(l.region)}</td>
            <td class="montant">${formatNumber(l.projets)}</td>
            <td class="montant">${formatCurrency(l.capital, 0)}</td>
            <td class="montant">${formatPercentage(l.part, 1)}</td>
        </tr>
    `).join('');
}

/**
 * Une part, arrondie sans jamais tomber à zéro
 *
 * Une région qui pèse 0,4 % du portefeuille n'en pèse pas 0 : l'arrondi à
 * l'entier faisait afficher « 0 % » en face d'une barre pourtant visible, ce
 * qui se lit comme une erreur de calcul.
 *
 * @param {number} part - Pourcentage
 * @returns {string} Part formatée
 */
function partLisible(part) {
    return formatPercentage(part, part > 0 && part < 1 ? 1 : 0);
}

/**
 * Écrit un texte dans un élément, s'il existe
 * @param {string} id - Identifiant de l'élément
 * @param {string} texte - Contenu à poser
 */
function ecrire(id, texte) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = texte;
    }
}
