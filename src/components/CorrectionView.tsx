"use client";

import { useEffect, useState } from "react";
import { imageUrl, loadAnswers, loadRecap } from "../lib/quiz";
import type { Player, RecapAnswer, RecapQuestion } from "../lib/quiz";
import { Shell, Avatar } from "./ui";

type Props = {
  roomId: string;
  players: Player[];
  currentIndex: number; // question affichée chez l'hôte (synchronisée par la base de données)
  myId: string | null;
};

export default function CorrectionView({ roomId, players, currentIndex, myId }: Props) {
  const [questions, setQuestions] = useState<RecapQuestion[]>([]);
  const [answers, setAnswers] = useState<RecapAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  const playerIds = players.map((p) => p.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = playerIds ? playerIds.split(",") : [];

    // Chargement initial des questions et des réponses
    loadRecap(roomId, ids).then((data) => {
      if (cancelled) return;
      setQuestions(data.questions);
      setAnswers(data.answers);
      setLoading(false);
    });

    // Les points attribués par l'hôte sont rafraîchis toutes les 2 secondes
    const timer = setInterval(async () => {
      const fresh = await loadAnswers(ids);
      if (!cancelled) setAnswers(fresh);
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId, playerIds]);

  if (loading) {
    return (
      <Shell center wide>
        <p className="text-center font-display text-2xl text-white/70">Chargement...</p>
      </Shell>
    );
  }

  const safeIdx = Math.min(currentIndex, Math.max(0, questions.length - 1));
  const q = questions[safeIdx];

  const bonusOf = (p: Player) => p.bonus ?? 0;
  const totalOf = (p: Player) =>
    answers.filter((a) => a.player_id === p.id).reduce((sum, a) => sum + (a.points ?? 0), 0) +
    bonusOf(p);
  const indexOf = (p: Player) => players.findIndex((x) => x.id === p.id);
  const ranking = [...players].sort((a, b) => totalOf(b) - totalOf(a));

  return (
    <Shell wide>
      <header className="space-y-2 text-center">
        <h1 className="font-display text-4xl">Correction en cours</h1>
        <p className="font-bold text-white/70">
          {"L'hôte corrige les réponses. Tu suis en direct, sans pouvoir modifier."}
        </p>
      </header>

      {q && (
        <section className="space-y-4">
          <p className="text-center font-bold text-white/80">
            Question {safeIdx + 1} sur {questions.length}
          </p>

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
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-2xl bg-nuit2 p-3 ${
                    p.user_id === myId ? "ring-4 ring-white/40" : ""
                  }`}
                >
                  <Avatar name={p.pseudo} index={pi} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white/60">
                      {p.pseudo}
                      {p.user_id === myId && " (toi)"}
                    </p>
                    {hasText ? (
                      <p className="break-words text-lg font-bold">{a!.texte}</p>
                    ) : (
                      <p className="italic text-white/40">Pas de réponse</p>
                    )}
                  </div>

                  {hasText && (
                    <span
                      className={`chip shrink-0 text-base ${
                        a!.points === null
                          ? "bg-white/15 text-white/70"
                          : a!.points > 0
                          ? "bg-menthe text-nuit"
                          : "bg-tomate text-white"
                      }`}
                    >
                      {a!.points === null ? "En attente" : a!.points > 0 ? `Juste +${a!.points}` : "Faux"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Scores en direct</h2>
        <ul className="space-y-2">
          {ranking.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-nuit2 p-3">
              <Avatar name={p.pseudo} index={indexOf(p)} size="sm" />
              <span className="min-w-0 flex-1 truncate font-bold">
                {p.pseudo}
                {p.user_id === myId && <span className="text-white/60"> (toi)</span>}
              </span>
              <span className="font-display text-xl tabular-nums">{totalOf(p)} pts</span>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}