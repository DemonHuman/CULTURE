import type { Metadata, Viewport } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "../components/pwa";

const display = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--f-display" });
const body = Nunito({ subsets: ["latin"], variable: "--f-body" });

export const metadata: Metadata = {
  title: "Zculture",
  description: "Testez votre culture générale, entre amis !",
  applicationName: "Zculture",
  appleWebApp: { capable: true, title: "Zculture", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#1e1b4b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>
       <RegisterServiceWorker />
       {children}
     </body>
    </html>
  );
}