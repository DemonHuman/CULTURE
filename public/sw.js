// Service worker minimal : il sert uniquement à rendre l'application installable.
// Il ne met rien en cache, car le jeu a besoin d'une connexion pour fonctionner,
// et on évite ainsi qu'une ancienne version du site reste affichée après une mise à jour.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});