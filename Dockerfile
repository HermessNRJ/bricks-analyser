# Utiliser une image nginx légère
FROM nginx:alpine

# Copier le fichier HTML dans le répertoire web de nginx
COPY index.html /usr/share/nginx/html/

# Copier le dossier src (modules JavaScript et CSS)
COPY src /usr/share/nginx/html/src/

# Copier la configuration nginx personnalisée
COPY nginx.conf /etc/nginx/nginx.conf

# Exposer le port 80
EXPOSE 80

# Nginx se lance automatiquement avec l'image
CMD ["nginx", "-g", "daemon off;"]