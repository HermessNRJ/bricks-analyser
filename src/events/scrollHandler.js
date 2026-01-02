/**
 * Gestionnaire du bouton "Scroll to Top"
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Configure le bouton scroll to top
 */
export function setupScrollToTop() {
    const scrollBtn = document.getElementById('scrollToTopBtn');

    if (!scrollBtn) {
        logger.warn(LOG_CATEGORIES.EVENT, 'Scroll to top button not found');
        return;
    }

    // Afficher/cacher le bouton selon le scroll
    window.addEventListener('scroll', () => {
        if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
            scrollBtn.style.display = 'block';
        } else {
            scrollBtn.style.display = 'none';
        }
    });

    // Gérer le clic sur le bouton
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        logger.debug(LOG_CATEGORIES.EVENT, 'Scrolled to top');
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'Scroll to top handler configured');
}
