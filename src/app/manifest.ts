import type { MetadataRoute } from "next";

// Next.js publie ce fichier à l'adresse /manifest.webmanifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zculture",
    short_name: "Zculture",
    description: "Le quiz multijoueur entre amis",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1e1b4b",
    theme_color: "#1e1b4b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}