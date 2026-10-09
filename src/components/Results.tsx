"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { imageUrl, loadRecap } from "../lib/quiz";
import type { Player, RecapAnswer, RecapQuestion } from "../lib/quiz";
import { Shell, Avatar, playerColor } from "./ui";

type Props = {
  roomId: string;
  players: Player[];
  myId: string | null;
  isHost: boolean;
  onReplay: () => Promise<string | null>;
};

const MEDALS = ["🥇", "🥈", "🥉"];
const BAR_HEIGHT = ["h-36", "h-28", "h-20"]; // 1er, 2e, 3e

export default function Results({ roomId, players, myId, isHost, onReplay }: Props) {
  const [questions, setQuestions] = useState<RecapQuestion[]>([]);
  const [answers, setAnswers] = useState<RecapAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  const playerIds = players.map((p) => p.id).join(",");

  useEffect(() => {
    let cancelled = false;
    loadRecap(roomId, playerIds ? playerIds.split(",") : []).then((data) => {
      if (cancelled) return;
      setQuestions(data.questions);
      setAnswers(data.answers);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, playerIds]);

  const ranking = [...players].sort((a, b) => b.score - a.score);
  const rankOf = (p: Player) => 1 + ranking.filter((o) => o.score > p.score).length;
  const indexOf = (p: Player) => players.findIndex((x) => x.id === p.id);

  // Podium : 2e, 1er, 3e (le 1er au centre)
  const top = ranking.slice(0, 3);
  const podium = [top[1], top[0], top[2]].filter(Boolean) as Player[];
  const others = ranking.slice(3);

  async function replay() {
    setReplaying(true);
    setReplayError(null);
    const err = await onReplay();
    if (err) setReplayError(err);
    setReplaying(false);
  }

  const me = players.find((p) => p.user_id === myId);
  const myAnswers = me ? answers.filter((a) => a.player_id === me.id) : [];

  return (
    <Shell wide>
      <h1 className="text-center font-display text-5xl">Résultats</h1>

      <section className="flex items-end gap-3 pt-4" aria-label="Podium">
        {podium.map((p) => {
          const pos = ranking.indexOf(p);
          const rank = rankOf(p);
          return (
            <div key={p.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <Avatar name={p.pseudo} index={indexOf(p)} size="lg" />
              <p className="max-w-full truncate font-bold">
                {p.pseudo}
                {p.user_id === myId && <span className="text-white/60"> (toi)</span>}
              </p>
              <p className="font-display text-2xl tabular-nums">{p.score} pts</p>
              <div
                className={`flex w-full items-start justify-center rounded-t-2xl pt-2 text-4xl ${BAR_HEIGHT[pos]} ${playerColor(
                  indexOf(p)
                )}`}
              >
                {rank <= 3 ? MEDALS[rank - 1] : rank}
              </div>
            </div>
          );
        })}
      </section>

      {others.length > 0 && (
        <ul className="space-y-2">
          {others.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl bg-nuit2 p-3 ${
                p.user_id === myId ? "ring-4 ring-white/40" : ""
              }`}
            >
              <span className="w-8 text-center font-display text-xl text-white/70">{rankOf(p)}</span>
              <Avatar name={p.pseudo} index={indexOf(p)} size="sm" />
              <span className="min-w-0 flex-1 truncate font-bold">
                {p.pseudo}
                {p.user_id === myId && <span className="text-white/60"> (toi)</span>}
              </span>
              <span className="font-display text-xl tabular-nums">{p.score} pts</span>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3 pt-4">
        <h2 className="font-display text-3xl">Tes réponses</h2>

        {loading ? (
          <p className="font-bold text-white/70">Chargement...</p>
        ) : (
          <ul className="space-y-3">
            {questions.map((q) => {
              const a = myAnswers.find((x) => x.question_id === q.id);
              const pts = a?.points ?? 0;
              const hasText = !!a && a.texte.trim() !== "";
              return (
                <li
                  key={q.id}
                  className={`space-y-2 rounded-2xl border-l-8 bg-white p-4 text-nuit ${
                    pts > 0 ? "border-menthe" : "border-tomate"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <p className="font-bold">{q.texte}</p>
                      {q.image_path && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={imageUrl(q.image_path)}
                          alt="Image de la question"
                          className="max-h-40 rounded-xl bg-brume object-contain"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <span
                      className={`chip shrink-0 ${
                        pts > 0 ? "bg-menthe text-nuit" : "bg-tomate text-white"
                      }`}
                    >
                      {pts > 0 ? `+${pts}` : "0"} pt{pts > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-sm font-bold">
                    <span className="text-nuit/60">Bonne réponse : </span>
                    {q.bonne_reponse}
                  </p>
                  <p className="text-sm font-bold">
                    <span className="text-nuit/60">Ta réponse : </span>
                    {hasText ? a!.texte : <span className="italic text-nuit/50">aucune</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-4">
        {isHost ? (
          <button onClick={replay} disabled={replaying} className="btn btn-menthe">
            Rejouer avec les mêmes joueurs
          </button>
        ) : (
          <p className="text-center font-bold text-white/70">
            {"L'hôte peut relancer une partie avec vous."}
          </p>
        )}
        {replayError && (
          <p role="alert" className="text-center text-sm font-bold text-tomate">
            {replayError}
          </p>
        )}
        <Link href="/" className="btn btn-ghost">
          {"Retour à l'accueil"}
        </Link>
      </div>
    </Shell>
  );
}