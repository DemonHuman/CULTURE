"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { imageUrl, loadRecap } from "../lib/quiz";
import type { Player, RecapAnswer, RecapQuestion } from "../lib/quiz";
import { Shell, Avatar } from "./ui";

type Props = {
  roomId: string;
  players: Player[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onFinish: () => Promise<string | null>;
};

export default function Correction({
  roomId,
  players,
  initialIndex = 0,
  onIndexChange,
  onFinish,
}: Props) {
  const [questions, setQuestions] = useState<RecapQuestion[]>([]);
  const [answers, setAnswers] = useState<RecapAnswer[]>([]);
  const [bonusOverride, setBonusOverride] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerIds = players.map((p) => p.id).join(",");

  const reload = useCallback(async () => {
    const data = await loadRecap(roomId, playerIds ? playerIds.split(",") : []);
    setQuestions(data.questions);
    setAnswers(data.answers);
    setLoading(false);
  }, [roomId, playerIds]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Change de question et prévient les autres joueurs (via la base de données)
  function goTo(next: number) {
    setIdx(next);
    onIndexChange?.(next);
  }

  const bonusOf = (p: Player) => bonusOverride[p.id] ?? p.bonus;
  const totalOf = (p: Player) =>
    answers.filter((a) => a.player_id === p.id).reduce((sum, a) => sum + (a.points ?? 0), 0) +
    bonusOf(p);

  async function mark(a: RecapAnswer, q: RecapQuestion, juste: boolean) {
    const points = juste ? q.difficulte : 0;
    setError(null);
    setAnswers((prev) => prev.map((x) => (x.id === a.id ? { ...x, points } : x)));
    const { error } = await supabase.from("answers").update({ points }).eq("id", a.id);
    if (error) {
      setError("Impossible d'enregistrer cette correction.");
      reload();
    }
  }

  async function adjust(p: Player, delta: number) {
    const next = bonusOf(p) + delta;
    setError(null);
    setBonusOverride((prev) => ({ ...prev, [p.id]: next }));
    const { error } = await supabase.from("players").update({ bonus: next }).eq("id", p.id);
    if (error) {
      setError("Impossible d'enregistrer l'ajustement.");
      setBonusOverride((prev) => ({ ...prev, [p.id]: bonusOf(p) }));
    }
  }

  async function finish() {
    const pending = answers.filter((a) => a.points === null && a.texte.trim() !== "").length;
    if (
      pending > 0 &&
      !window.confirm(
        `${pending} réponse(s) pas encore corrigée(s) compteront 0 point. Terminer quand même ?`
      )
    ) {
      return;
    }
    setFinishing(true);
    const err = await onFinish();
    if (err) setError(err);
    setFinishing(false);
  }

  if (loading) {
    return (
      <Shell center wide>
        <p className="text-center font-display text-2xl text-white/70">Chargement de la correction...</p>
      </Shell>
    );
  }

  const safeIdx = Math.min(idx, Math.max(0, questions.length - 1));
  const q = questions[safeIdx];
  const corrected = answers.filter((a) => a.texte.trim() !== "" && a.points !== null).length;
  const toCorrect = answers.filter((a) => a.texte.trim() !== "").length;

  return (
    <Shell wide>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">Correction</h1>
        <span className="chip bg-white/15 text-white">
          {corrected} sur {toCorrect} corrigées
        </span>
      </header>

      {q && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => goTo(Math.max(0, safeIdx - 1))}
              disabled={safeIdx === 0}
              className="btn btn-ghost btn-sm"
            >
              Précédente
            </button>
            <span className="text-center font-bold text-white/80">
              Question {safeIdx + 1} sur {questions.length}
            </span>
            <button
              onClick={() => goTo(Math.min(questions.length - 1, safeIdx + 1))}
              disabled={safeIdx === questions.length - 1}
              className="btn btn-ghost btn-sm"
            >
              Suivante
            </button>
          </div>

          <div className="panel space-y-4">
            <div className="flex flex-wrap gap-2">
              {q.categorie && <span className="chip bg-brume text-nuit">{q.categorie}</span>}
              <span className="chip bg-soleil text-nuit">
                {q.difficulte} point{q.difficulte > 1 ? "s" : ""}
              </span>
            </div>
            <p className="font-display text-2xl leading-snug sm:text-3xl">{q.texte}</p>
            {q.image_path && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl(q.image_path)}
                alt="Image de la question"
                className="mx-auto max-h-64 w-full rounded-2xl bg-brume object-contain"
              />
            )}
            <div className="rounded-2xl bg-menthe px-4 py-3 text-nuit">
              <p className="text-sm font-bold">Bonne réponse</p>
              <p className="font-display text-2xl">{q.bonne_reponse}</p>
            </div>
          </div>

          <ul className="space-y-3">
            {players.map((p, pi) => {
              const a = answers.find((x) => x.player_id === p.id && x.question_id === q.id);
              const hasText = !!a && a.texte.trim() !== "";
              const juste = !!a && a.points !== null && a.points > 0;
              const faux = !!a && a.points === 0;
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-nuit2 p-3">
                  <Avatar name={p.pseudo} index={pi} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white/60">{p.pseudo}</p>
                    {hasText ? (
                      <p className="break-words text-lg font-bold">{a!.texte}</p>
                    ) : (
                      <p className="italic text-white/40">Pas de réponse</p>
                    )}
                  </div>

                  {hasText && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => mark(a!, q, true)}
                        aria-pressed={juste}
                        className={`btn btn-sm ${juste ? "btn-menthe" : "btn-ghost"}`}
                      >
                        Juste
                      </button>
                      <button
                        onClick={() => mark(a!, q, false)}
                        aria-pressed={faux}
                        className={`btn btn-sm ${faux ? "btn-tomate" : "btn-ghost"}`}
                      >
                        Faux
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Scores</h2>
        <p className="text-sm text-white/60">
          Ajoute ou retire des points à un joueur pour rattraper une erreur de correction.
        </p>
        <ul className="space-y-2">
          {players.map((p, pi) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-nuit2 p-3">
              <Avatar name={p.pseudo} index={pi} size="sm" />
              <span className="min-w-0 flex-1 truncate font-bold">{p.pseudo}</span>
              <button
                onClick={() => adjust(p, -1)}
                aria-label={`Retirer un point à ${p.pseudo}`}
                className="btn btn-ghost btn-sm btn-icon"
              >
                −
              </button>
              <span className="w-20 text-center font-display text-xl tabular-nums">
                {totalOf(p)} pts
                {bonusOf(p) !== 0 && (
                  <span className="block text-xs font-bold text-white/60">
                    dont {bonusOf(p) > 0 ? "+" : ""}
                    {bonusOf(p)} bonus
                  </span>
                )}
              </span>
              <button
                onClick={() => adjust(p, 1)}
                aria-label={`Ajouter un point à ${p.pseudo}`}
                className="btn btn-ghost btn-sm btn-icon"
              >
                +
              </button>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p role="alert" className="text-center text-sm font-bold text-tomate">
          {error}
        </p>
      )}

      <button onClick={finish} disabled={finishing} className="btn btn-soleil">
        Terminer la correction
      </button>
    </Shell>
  );
}