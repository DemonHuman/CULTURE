"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// Invitation au salon : feuille de partage du téléphone, copie du lien et QR code.
// Le lien (https://ton-site/j/CODE) mène à une page où l'invité n'a qu'à choisir son pseudo.
export default function InviteShare({ code }: { code: string}) {
    const [url, setUrl] = useState("");
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        setUrl('${window.location.origin}/j/${code}');
        setCanShare(typeof navigator.share === "function");
    }, [code]);

    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }  catch {

        }
    }

    async function share() {
        try {
            await navigator.share({
                title: "Zculture",
                text: 'Rejoins ma partie de Zculture ! Code : ${code}',
                url,
            });
        } catch {

        }
    }

    if (!url) return null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap justify-center gap-2">
                {canShare && (
                    <button onClick={share} className="btn btn-bleu btn-sm">
                        Partager le lien
                    </button>
                )}
                <button onClick={copy} className="btn btn-ghost btn-sm">
                    {copied ? "Lien copié" :"Copier le lien"}
                </button>
                <button
                    onClick={() => setShowQr((v) => !v)}
                    className="btn btn-ghost btn-sm"
                    aria-expanded={showQr}
                >
                    {showQr ? "Masquer le QR code" : "Afficher le QR code"}
                </button>
            </div>

            {showQr && (
                <div className="mx-auto w-fit space-y-3 rounded-3x1 bg-white p-5 text-center shadow-[0_8px_0_rgb(0_0_0/0.28)]">
                    <QRCodeSVG
                    value={url}
                    size={224}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#1eb14b"
                    title="QR code pour rejoindre le salon"
                />
                <p className="font-bold text-nuit">Scanne pour rejoindre</p>
                </div>
            )}
        </div>
    );
}