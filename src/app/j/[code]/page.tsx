"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase, ensureSession } from "../../../lib/supabase";
import { Shell, Wordmark, playerColor } from "../../../components/ui";

function traduireErreur(message: string, code?: string) {
  if (code === "23505") return "Ce pseudo est déjà pris dans ce salon.";
  if (message.includes("room not found")) return "Ce salon n'existe plus ou le code est faux.";
  if (message.includes("game already started")) return "La partie a déjà commencé.";
  if (message.includes("check")) return "Le pseudo doit faire entre 2 et 20 caractères.";
  return "Une erreur est survenue. Réessaie.";
}

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code.toUpperCase();

  const [pseudo, setPseudo] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si on est déjà dans ce salon (lien rouvert), on y retourne directement
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSession();
        const { data } = await supabase.from("rooms").select("id").eq("code", code).maybeSingle();
        if (!cancelled && data) {
          router.replace(`/room/${code}`);
          return;
        }
      } catch {
        // on affiche simplement le formulaire
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  async function handleJoin() {
    setError(null);
    setLoading(true);
    try {
      await ensureSession();
      const { error } = await supabase.rpc("join_room", { p_code: code, p_pseudo: pseudo.trim() });
      if (error) throw error;
      router.push(`/room/${code}`);
    } catch (e: any) {
      setError(traduireErreur(e.message ?? "", e.code));
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <Shell center>
        <p className="text-center font-display text-2xl text-white/70">Chargement...</p>
      </Shell>
    );
  }

  return (
    <Shell center>
      <div className="space-y-8">
        <Wordmark />

        <div className="panel space-y-5">
          <div className="space-y-3 text-center">
            <p className="font-display text-2xl">Tu es invité à jouer !</p>
            <div className="flex justify-center gap-2" role="img" aria-label={`Code du salon : ${code}`}>
              {code.split("").map((c, i) => (
                <span
                  key={i}
                  className={`flex h-12 w-10 items-center justify-center rounded-xl font-display text-2xl ${playerColor(i)}`}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pseudo.trim().length >= 2 && !loading && handleJoin()}
            placeholder="Ton pseudo"
            aria-label="Ton pseudo"
            maxLength={20}
            autoFocus
            className="field"
          />

          <button
            onClick={handleJoin}
            disabled={pseudo.trim().length < 2 || loading}
            className="btn btn-menthe"
          >
            Rejoindre la partie
          </button>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-tomate/10 px-3 py-2 text-center text-sm font-bold text-erreur"
            >
              {error}
            </p>
          )}
        </div>

        <Link href="/" className="btn btn-ghost">
          {"Aller à l'accueil"}
        </Link>
      </div>
    </Shell>
  );
}