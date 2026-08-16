import { logger } from '../src/utils/logger.js';

// Les modules loggent en niveau debug par défaut : on coupe le bruit dans les tests.
logger.setLevel('off');

// jsdom n'implémente pas le défilement. Changer de page en appelle pourtant,
// et sans ce doublon le test échouerait sur une absence de mise en page plutôt
// que sur ce qu'il mesure.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}
