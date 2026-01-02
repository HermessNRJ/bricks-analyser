/**
 * Gestionnaire d'upload de fichier JSON
 */

import { parseJSONFile } from '../data/fileParser.js';
import { processData } from '../business/processor.js';
import { showError, hideError } from '../ui/modals.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Configure le gestionnaire d'upload de fichier
 */
export function setupFileUploadHandler() {
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');

    if (!fileInput) {
        logger.error(LOG_CATEGORIES.EVENT, 'File input element not found');
        return;
    }

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];

        if (!file) {
            return;
        }

        logger.info(LOG_CATEGORIES.EVENT, 'File selected', {
            name: file.name,
            size: file.size,
            type: file.type
        });

        if (fileNameDisplay) {
            fileNameDisplay.textContent = `Fichier sélectionné: ${file.name}`;
        }

        hideError();

        try {
            const data = await parseJSONFile(file);
            await processData(data);
        } catch (err) {
            logger.error(LOG_CATEGORIES.EVENT, 'File upload failed', err);
            showError(`Erreur lors de la lecture du fichier: ${err.message}. Vérifiez que le fichier est bien au format JSON valide.`);
        }
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'File upload handler configured');
}
