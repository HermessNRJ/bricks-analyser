# Image nginx légère, épinglée à son empreinte.
#
# « nginx:alpine » est un tag flottant : deux « docker-compose up --build » à
# quelques semaines d'écart ne construisaient pas sur la même base, et rien ne
# le disait. C'est la même raison qui vaut des empreintes SRI aux deux CDN
# d'index.html — cette image sert la page qui manipule le cookie de session.
#
# Le tag reste lisible à côté du digest, mais c'est le digest qui fait foi.
# Pour monter de version :
#   docker pull nginx:<version>-alpine
#   docker image inspect nginx:<version>-alpine --format '{{index .RepoDigests 0}}'
FROM nginx:1.31-alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752

# Copier le fichier HTML dans le répertoire web de nginx
COPY index.html /usr/share/nginx/html/

# Copier le dossier src (modules JavaScript et CSS)
COPY src /usr/share/nginx/html/src/

# Copier la favicon
COPY favicon.png /usr/share/nginx/html/

# Copier la configuration nginx personnalisée
COPY nginx.conf /etc/nginx/nginx.conf

# Exposer le port 80
EXPOSE 80

# Nginx se lance automatiquement avec l'image
CMD ["nginx", "-g", "daemon off;"]