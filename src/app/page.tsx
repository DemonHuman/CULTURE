"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, ensureSession } from "../lib/supabase";
import { Shell, Wordmark } from "../components/ui";

function traduireErreur(message: string, code?: string) {
  if (code === "23505") return "Ce pseudo est déjà pris dans ce salon.";
  if (message.includes("room not found")) return "Aucun salon avec ce code.";
  if (message.includes("game already started")) return "La partie a déjà commencé.";
  if (message.includes("check")) return "Le pseudo doit faire entre 2 et 20 caractères.";
  return "Une erreur est survenue. Réessaie.";
}

export default function Home() {
  const router = useRouter();
  const [pseudo, setPseudo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      await ensureSession();
      const { data, error } = await supabase.rpc("create_room", { p_pseudo: pseudo.trim() });
      if (error) throw error;
      router.push(`/room/${data}`);
    } catch (e: any) {
      setError(traduireErreur(e.message ?? "", e.code));
      setLoading(false);
    }
  }

  async function handleJoin() {
    setError(null);
    setLoading(true);
    try {
      await ensureSession();
      const roomCode = code.trim().toUpperCase();
      const { error } = await supabase.rpc("join_room", {
        p_code: roomCode,
        p_pseudo: pseudo.trim(),
      });
      if (error) throw error;
      router.push(`/room/${roomCode}`);
    } catch (e: any) {
      setError(traduireErreur(e.message ?? "", e.code));
      setLoading(false);
    }
  }

  const pseudoOk = pseudo.trim().length >= 2;

  return (
    <Shell center>
      <div className="space-y-8">
        <Wordmark />

        <div className="panel space-y-4">
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder="Ton pseudo"
            aria-label="Ton pseudo"
            maxLength={20}
            className="field"
          />

          <button onClick={handleCreate} disabled={!pseudoOk || loading} className="btn btn-menthe">
            Créer un salon
          </button>

          <div className="flex items-center gap-3 text-sm font-bold text-nuit/50" aria-hidden>
            <span className="h-1 flex-1 rounded bg-brume" />
            ou
            <span className="h-1 flex-1 rounded bg-brume" />
          </div>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Code du salon"
            aria-label="Code du salon"
            maxLength={5}
            className="field text-center uppercase tracking-[0.3em]"
          />

          <button
            onClick={handleJoin}
            disabled={!pseudoOk || code.trim().length < 5 || loading}
            className="btn btn-bleu"
          >
            Rejoindre
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
      </div>
    </Shell>
  );
}