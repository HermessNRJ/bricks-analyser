/**
 * La fiche d'une propriété
 *
 * Tout le HTML d'une carte du registre : suivi officiel, actualités, alertes,
 * carnet de versements. Composé en chaîne plutôt qu'en nœuds parce que le
 * registre en réécrit vingt-quatre d'un coup à chaque changement de filtre ;
 * tout ce qui vient de l'API passe par escapeHtml.
 */

import { formatCurrency, formatNumber, formatMonthName, formatPercentage } from '../utils/formatters.js';
import { escapeHtml, safeUrl, stripTags } from '../utils/html.js';
import { NIVEAUX_RISQUE } from '../business/riskAnalysis.js';
import { ETATS, carnetVersements } from '../business/versements.js';
import { netApresRetenue } from '../business/fiscalite.js';
import { pluriel, moisEnIncise, deMois } from './libelles.js';
import { hasWarningInLastMonth } from './alertes.js';

/**
 * Construit le bandeau du suivi officiel d'une propriété
 *
 * Échéances dues, pénalités, contentieux : ce que le texte des alertes ne dit
 * pas toujours. Absent tant que les statuts n'ont pas été récupérés.
 *
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML du bandeau, vide s'il n'y a rien à signaler
 */
function createSuiviSection(property) {
    const suivi = property.suivi;

    if (!suivi || !suivi.suivi) {
        return '';
    }

    const faits = [];

    if (suivi.contentieux) {
        faits.push('contentieux ouvert');
    }

    if (suivi.impayees > 0) {
        faits.push(`${suivi.impayees} échéance${suivi.impayees > 1 ? 's' : ''} due${suivi.impayees > 1 ? 's' : ''}`);
    }

    // Les montants sont ceux de VOS briques, pas ceux du projet : le suivi
    // officiel compte la dette envers les milliers d'obligataires, un chiffre
    // sans rapport avec une fiche où l'on détient dix briques.
    if (property.arrieres?.montant > 0) {
        // Le brut est ce que le projet devait ; le net, ce qui serait arrivé sur
        // le compte. C'est le second qui manque vraiment.
        const brut = property.arrieres.montant;
        const net = netApresRetenue(brut, String(suivi.derniereEcheanceImpayee || '').slice(0, 7), property.country);

        faits.push(`${formatCurrency(net)} de coupons manqués (${formatCurrency(brut)} brut)`);
    }

    if (property.arrieres?.penalites > 0) {
        faits.push(`${formatCurrency(property.arrieres.penalites)} de pénalités à votre part`);
    } else if (suivi.penalites > 0 && !property.arrieres?.penalitesConnues) {
        // Statut récupéré avant que le nombre de briques du projet ne soit lu :
        // le prorata est impossible, et on le dit plutôt que d'annoncer la
        // dette du projet entier comme si elle était vôtre.
        faits.push('pénalités en cours, part non calculable');
    }

    if (faits.length === 0) {
        // Un dossier existe mais plus rien n'est dû : le dire évite de laisser
        // croire à un incident en cours.
        faits.push('incident passé, plus rien de dû');
    }

    const periode = periodeImpayee(suivi);

    if (periode) {
        faits.push(periode);
    }

    const grave = suivi.contentieux || suivi.impayees > 0;

    // Une liste plutôt qu'une phrase à points médians : cinq faits enchaînés
    // sur trois lignes se lisaient comme un paragraphe, et le montant dû s'y
    // noyait au milieu des dates.
    const lignes = faits.map(fait => `<li>${escapeHtml(fait)}</li>`).join('');

    return `
        <ul class="suivi-officiel${grave ? ' est-grave' : ''}">${lignes}</ul>
    `;
}

/**
 * Dit sur quelle période les échéances n'ont pas été honorées
 *
 * L'ancienne formulation, « dernière échéance due en juillet 2026 », se lisait
 * de travers : « due » laissait entendre une échéance à venir, alors qu'il
 * s'agit de la plus récente de celles qui n'ont pas été payées. Sur un projet
 * qui n'a plus rien versé depuis vingt mois, c'est la période entière qui
 * renseigne, pas son dernier jour.
 *
 * @param {Object} suivi - Suivi officiel du projet
 * @returns {string} Incise à ajouter au bandeau, vide si les dates manquent
 */
function periodeImpayee(suivi) {
    // formatMonthName capitalise le mois : en incise, il se lit en minuscule
    const enClair = date => date
        ? moisEnIncise(String(date).slice(0, 7))
        : '';

    const premier = enClair(suivi.premiereEcheanceImpayee);
    const dernier = enClair(suivi.derniereEcheanceImpayee);

    if (!dernier) {
        return '';
    }

    if (premier && premier !== dernier) {
        return `rien versé ${deMois(String(suivi.premiereEcheanceImpayee).slice(0, 7))} à ${dernier}`;
    }

    if (suivi.impayees === 1) {
        return `échéance ${deMois(String(suivi.derniereEcheanceImpayee).slice(0, 7))} jamais versée`;
    }

    // Plusieurs échéances dues mais une seule date connue : un suivi récupéré
    // avant que la première ne soit relevée. Annoncer une échéance unique
    // ferait passer vingt mois de silence pour un mois de retard.
    return `dernière impayée en ${dernier}`;
}

/**
 * Construit le bloc des actualités officielles d'une propriété
 *
 * Le flux du projet est bien plus circonstancié que les alertes du
 * portefeuille : il détaille démarches, retards et relances.
 *
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML des actualités, vide s'il n'y en a pas
 */
function createActualitesSection(property) {
    const actualites = property.suivi?.actualites;

    if (!Array.isArray(actualites) || actualites.length === 0) {
        return '';
    }

    const liste = actualites.map(a => {
        const date = a.date ? new Date(a.date) : null;
        const dateLisible = date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Date inconnue';

        return `
            <div class="actualite-item">
                <div class="alerte-date">${escapeHtml(dateLisible)}</div>
                <div class="alerte-texte">${escapeHtml(a.texte)}${a.tronquee ? '…' : ''}</div>
            </div>
        `;
    }).join('');

    // Repliées : trois actualités de six cents caractères occupaient plus de
    // place que tout le reste de la fiche, et l'on parcourt le registre pour
    // comparer des montants, pas pour lire des communiqués.
    return `
        <details class="alertes">
            <summary class="actualites-entete">
                ${actualites.length} actualité${actualites.length > 1 ? 's' : ''} du projet
            </summary>
            <div class="alertes-liste">${liste}</div>
        </details>
    `;
}

/**
 * Construit le bloc des alertes d'une propriété
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML des alertes, vide s'il n'y en a pas
 */
function createAlertesSection(property) {
    if (!property.warningsCount || property.warningsCount === 0) {
        return '';
    }

    const recente = hasWarningInLastMonth(property);
    const classeAge = recente ? '' : ' est-ancienne';
    const nombre = property.warningsCount;
    const marque = pluriel(nombre);
    const mention = recente ? `récente${marque}` : `ancienne${marque}`;

    const liste = property.warnings.map(w => {
        const date = new Date(w.date);
        const dateLisible = Number.isNaN(date.getTime())
            ? 'Date inconnue'
            : date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

        const texte = stripTags(w.description).substring(0, 150);
        const suite = texte.length >= 150 ? '…' : '';

        return `
            <div class="alerte-item${classeAge}">
                <div class="alerte-date">${escapeHtml(dateLisible)}</div>
                <div class="alerte-texte">${escapeHtml(texte)}${suite}</div>
            </div>
        `;
    }).join('');

    return `
        <details class="alertes">
            <summary class="alertes-entete${classeAge}">
                <span aria-hidden="true">▲</span>
                ${nombre} alerte${marque} ${mention}
            </summary>
            <div class="alertes-liste">${liste}</div>
        </details>
    `;
}

/**
 * Construit le carnet de versements d'une propriété
 *
 * Une pastille dit l'état du mois, un carnet dit le rythme. Les deux ensemble :
 * douze mois pleins suivis d'un blanc ne se lisent pas comme un silence d'un an,
 * et c'est cette différence qui rend un « rien reçu » exploitable.
 *
 * @param {Object} property - Données de la propriété
 * @param {Object} [versements] - { parPropriete, moisReference } issus du calcul
 * @returns {string} HTML du bloc, vide sans état de compte
 */
function createVersementSection(property, versements) {
    const versement = property.versement;
    const moisReference = versements?.moisReference;

    if (!versement || versement.etat === ETATS.INCONNU || !moisReference) {
        return '';
    }

    const libelle = LIBELLES_VERSEMENT[versement.etat] || '';
    const montant = versement.etat === ETATS.VERSE
        ? montantVerse(versement.montant, moisReference, property.country)
        : '';

    const carnet = carnetVersements(property, versements.parPropriete, moisReference);
    const verses = carnet.filter(c => c.etat === ETATS.VERSE).length;
    const sans = carnet.filter(c => c.etat === ETATS.MANQUANT).length;

    const marques = carnet.map(c => `<span class="carnet-mois est-${c.etat}"
            title="${escapeHtml(titreMoisCarnet(c, property.country))}"></span>`).join('');

    const resume = `${carnet.length} derniers mois : ${verses} versement${pluriel(verses)}`
        + (sans > 0 ? `, ${sans} mois sans versement` : '');

    return `
        <div class="versement-bloc">
            <div class="versement-ligne">
                <span class="versement-pastille est-${versement.etat}">${escapeHtml(libelle)}</span>
                ${montant}
                <span class="carnet" role="img" aria-label="${escapeHtml(resume)}">${marques}</span>
            </div>
            ${legendeVersement(versement)}
        </div>
    `;
}

/**
 * Rédige l'infobulle d'un mois du carnet
 * @param {Object} case_ - Case du carnet { mois, etat, montant }
 * @returns {string} Texte de l'infobulle
 */
function titreMoisCarnet({ mois, etat, montant }, pays) {
    const nom = formatMonthName(mois);

    if (etat === ETATS.VERSE) {
        const net = netApresRetenue(montant, mois, pays);
        return `${nom} : ${formatCurrency(net)} net · ${formatCurrency(montant)} brut`;
    }

    return etat === ETATS.MANQUANT
        ? `${nom} : rien reçu`
        : `${nom} : aucun versement attendu`;
}

/**
 * Compose le montant versé du mois, net puis brut
 *
 * La ventilation de l'état de compte est brute. N'afficher qu'elle laissait
 * croire que c'était l'argent reçu, alors que Bricks prélève avant de créditer.
 * Sur un projet étranger, les deux montants sont égaux — et c'est précisément
 * ce qu'il faut voir : rien n'a encore été prélevé, l'impôt viendra plus tard.
 *
 * @param {number} brut - Coupon brut du mois
 * @param {string} mois - Mois jugé
 * @param {string} [pays] - Pays de la propriété
 * @returns {string} HTML des deux montants
 */
function montantVerse(brut, mois, pays) {
    const net = netApresRetenue(brut, mois, pays);
    const titre = pays && pays !== 'France'
        ? 'Versé brut : aucune retenue à la source hors de France, l\'impôt viendra sur la déclaration'
        : 'Net encaissé, prélèvement forfaitaire déduit';

    return `<span class="versement-montant" title="${escapeHtml(titre)}">${formatCurrency(net)}</span>`
        + `<span class="versement-brut">${formatCurrency(brut)} brut</span>`;
}

/**
 * Précise ce que la pastille laisse ouvert
 * @param {Object} versement - État de versement de la propriété
 * @returns {string} HTML de la légende, vide quand la pastille se suffit
 */
function legendeVersement(versement) {
    let texte = '';

    if (versement.etat === ETATS.MANQUANT) {
        texte = versement.dernierMois
            ? `Dernier versement en ${moisEnIncise(versement.dernierMois)}`
            : 'Aucun versement à ce jour';
    }

    if (versement.etat === ETATS.ATTENDU) {
        if (versement.motif === 'financement') {
            texte = 'Projet encore en financement';
        } else if (versement.motif === 'inconnu') {
            texte = 'Aucune date de versement annoncée';
        } else {
            texte = `Premier versement annoncé en ${moisEnIncise(versement.debut)}`;
        }
    }

    return texte ? `<p class="versement-legende">${escapeHtml(texte)}</p>` : '';
}

/**
 * Crée le HTML pour une carte de propriété
 * @param {Object} property - Données de la propriété
 * @param {Object} [versements] - { parPropriete, moisReference } issus du calcul
 * @returns {string} HTML de la carte
 */
export function createPropertyCard(property, versements) {
    const thumbnailUrl = safeUrl(property.thumbnailUrl);
    const imageHtml = thumbnailUrl
        ? `<img src="${escapeHtml(thumbnailUrl)}" alt="" class="property-thumbnail" loading="lazy" decoding="async">`
        : '';

    let cardClasses = 'property-card';
    if (property.niveauRisque === NIVEAUX_RISQUE.PROCEDURE) cardClasses += ' property-en-defaut';
    if (property.isRefunded) cardClasses += ' property-refunded';
    if (property.projectStatus === 'ongoing') cardClasses += ' property-ongoing';
    if (property.projectStatus === 'upcoming') cardClasses += ' property-upcoming';

    let statusBadge = '';
    if (property.isRefunded) {
        statusBadge = '<span class="badge-statut">Remboursé</span>';
    } else if (property.projectStatus === 'ongoing') {
        statusBadge = '<span class="badge-statut">En financement</span>';
    } else if (property.projectStatus === 'upcoming') {
        statusBadge = '<span class="badge-statut">À venir</span>';
    }

    // Formatage des dates
    const revenueStartDisplay = property.revenueStartDate
        ? formatMonthName(property.revenueStartDate)
        : 'N/D';
    // Aucun « (est.) » : une date de remboursement à venir ne peut être qu'une
    // estimation, et le préciser sur chaque fiche ne fait qu'encombrer.
    const refundDateDisplay = property.refundDate
        ? formatMonthName(property.refundDate)
        : (property.isRefunded ? 'Remboursé' : 'N/D');

    // Le coupon annoncé, avant retenue. Hors de France il est aussi le net :
    // rien n'est prélevé à la source, l'impôt vient sur la déclaration.
    const brutMensuel = property.investment * (property.yearlyReturn || 0) / 100 / 12;

    // URL du projet sur Bricks.co
    const projectUrl = `https://app.bricks.co/project/${encodeURIComponent(property.id)}`;

    return `
        <div class="${cardClasses}" role="link" tabindex="0"
             data-project-url="${escapeHtml(projectUrl)}"
             data-property-id="${escapeHtml(property.id)}">
            ${imageHtml}
            <div class="property-name" title="${escapeHtml(property.name)}">${escapeHtml(property.name)}${statusBadge}</div>
            <div class="property-adresse" title="${escapeHtml(property.address)}">${escapeHtml(property.address)}</div>
            <dl class="property-details">
                <div class="paire">
                    <dt>Investissement</dt>
                    <dd>${formatCurrency(property.investment)}</dd>
                </div>
                <div class="paire">
                    <dt>Rendement annuel</dt>
                    <dd class="rendement">${formatPercentage(property.yearlyReturn)}</dd>
                </div>
                <div class="paire">
                    <dt>Briques</dt>
                    <dd>${formatNumber(property.ownedBricks)}</dd>
                </div>
                <div class="paire">
                    <dt>Revenus nets / mois</dt>
                    <dd>${formatCurrency(property.monthlyRevenue)}<span class="detail-brut">${formatCurrency(brutMensuel)} brut</span></dd>
                </div>
                <div class="paire">
                    <dt>Premier versement</dt>
                    <dd>${escapeHtml(revenueStartDisplay)}</dd>
                </div>
                <div class="paire">
                    <dt>Remboursement</dt>
                    <dd>${escapeHtml(refundDateDisplay)}</dd>
                </div>
            </dl>
            ${createVersementSection(property, versements)}
            ${createSuiviSection(property)}
            ${createActualitesSection(property) || createAlertesSection(property)}
        </div>
    `;
}

/**
 * Libellé de la pastille d'état de versement portée par chaque fiche
 */
const LIBELLES_VERSEMENT = {
    [ETATS.VERSE]: 'Versé',
    [ETATS.MANQUANT]: 'Rien reçu',
    [ETATS.ATTENDU]: 'Pas encore',
    [ETATS.SOLDE]: 'Soldé'
};
