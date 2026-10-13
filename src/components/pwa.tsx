"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// À mettre une fois dans le layout : enregistre le service worker (en production uniquement)
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

// Bouton « Installer l'application », à mettre sur l'accueil.
// - Android / Chrome / Edge : ouvre la fenêtre d'installation du navigateur
// - iPhone / iPad : affiche les étapes à suivre dans Safari
// - Déjà installée, ou navigateur non compatible : n'affiche rien
export function InstallButton() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  if (installed) return null;

  if (installEvent) {
    return (
      <button onClick={install} className="btn btn-ghost">
        {"Installer l'application"}
      </button>
    );
  }

  if (ios) {
    return (
      <div className="space-y-3">
        <button onClick={() => setShowHelp((v) => !v)} className="btn btn-ghost" aria-expanded={showHelp}>
          {"Ajouter à l'écran d'accueil"}
        </button>
        {showHelp && (
          <p className="rounded-2xl bg-nuit2 px-4 py-3 text-center font-bold text-white/80">
            {"Dans Safari, appuie sur le bouton Partager, puis sur « Sur l'écran d'accueil »."}
          </p>
        )}
      </div>
    );
  }

  return null;
}