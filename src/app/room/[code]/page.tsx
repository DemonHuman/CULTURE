"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase, ensureSession } from "../../../lib/supabase";
import type { Room, Player } from "../../../lib/quiz";
import Correction from "../../../components/Correction";
import CorrectionView from "../../../components/CorrectionView";
import Results from "../../../components/Results";
import { Shell, Avatar, CodeTiles } from "../../../components/ui";

type Question = { texte: string; difficulte: number; categorie: string | null };

// Doit correspondre à la durée d'une question dans start_game / advance_room (SQL)
const QUESTION_SECONDS = 20;

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [sent, setSent] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [progress, setProgress] = useState(1);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answerRef = useRef("");
  const latestRef = useRef<{ q: number; status: string }>({ q: 0, status: "" });

  const roomId = room?.id;
  const status = room?.status;
  const currentQ = room?.current_question ?? 0;
  const endsAt = room?.question_ends_at ?? null;

  useEffect(() => {
    latestRef.current = { q: currentQ, status: status ?? "" };
  }, [currentQ, status]);

  // ---------- Chargement du salon + temps réel ----------
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const session = await ensureSession();
      if (!session || cancelled) return;
      setMyId(session.user.id);

      // Grâce aux règles RLS, on ne voit le salon que si on en est membre
      const { data: r } = await supabase
        .from("rooms")
        .select(
          "id, code, host_id, status, current_question, question_ends_at, total_questions, correction_index"
        )
        .eq("code", code)
        .maybeSingle();

      if (cancelled) return;
      if (!r) {
        setNotFound(true);
        return;
      }

      async function refreshPlayers() {
        const { data } = await supabase
          .from("players")
          .select("id, pseudo, user_id, score, bonus")
          .eq("room_id", r!.id)
          .order("joined_at");
        if (!cancelled && data) setPlayers(data as Player[]);
      }
      await refreshPlayers();
      if (cancelled) return;
      setRoom(r as Room);

      channel = supabase
        .channel(`room-${r.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "players", filter: `room_id=eq.${r.id}` },
          () => refreshPlayers()
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${r.id}` },
          (payload) =>
            setRoom((prev) => (prev ? { ...prev, ...(payload.new as Partial<Room>) } : prev))
        )
        .subscribe();

      if (cancelled) supabase.removeChannel(channel);
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [code]);

  // ---------- Chargement de la question en cours ----------
  useEffect(() => {
    if (!roomId || status !== "playing") return;
    let cancelled = false;

    setQuestion(null);
    setAnswer("");
    answerRef.current = "";
    setSent(false);
    setError(null);

    supabase
      .from("room_questions")
      .select("position, questions(texte, difficulte, categorie)")
      .eq("room_id", roomId)
      .eq("position", currentQ)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setQuestion((data as any).questions as Question);
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, status, currentQ]);

  // ---------- Chrono (basé sur l'heure de fin donnée par le serveur) ----------
  useEffect(() => {
    if (!roomId || status !== "playing" || !endsAt) return;

    const questionIndex = currentQ;
    const end = new Date(endsAt).getTime();
    let done = false;

    const finishQuestion = async () => {
      // 1. envoyer la dernière version de la réponse
      await supabase.rpc("submit_answer", {
        p_room: roomId,
        p_position: questionIndex,
        p_texte: answerRef.current,
      });
      // 2. demander à passer à la suite. Le serveur ne bouge que lorsque son horloge
      //    est aussi à l'heure : on réessaie jusqu'à ce que la question change.
      for (let i = 0; i < 15; i++) {
        if (latestRef.current.q !== questionIndex || latestRef.current.status !== "playing") return;
        await supabase.rpc("advance_room", { p_room: roomId });
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    const tick = () => {
      const ms = Math.max(0, end - Date.now());
      const left = Math.ceil(ms / 1000);
      setRemaining(left);
      setProgress(Math.min(1, ms / (QUESTION_SECONDS * 1000)));
      if (left === 0 && !done) {
        done = true;
        finishQuestion();
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [roomId, status, currentQ, endsAt]);

  // ---------- Actions ----------
  async function handleStart() {
    if (!room) return;
    setError(null);
    setStarting(true);
    const { error } = await supabase.rpc("start_game", { p_room: room.id, p_nb: 20 });
    if (error) {
      setError(
        error.message.includes("no questions")
          ? "Aucune question en base de données."
          : "Impossible de lancer la partie."
      );
    }
    setStarting(false);
  }

  async function sendAnswer() {
    if (!room) return;
    setError(null);
    const { error } = await supabase.rpc("submit_answer", {
      p_room: room.id,
      p_position: room.current_question,
      p_texte: answer,
    });
    if (error) setError("Réponse refusée : le temps est écoulé.");
    else setSent(true);
  }

  // L'hôte change de question pendant la correction : les autres joueurs suivent
  async function handleIndexChange(index: number) {
    if (!room) return;
    await supabase.from("rooms").update({ correction_index: index }).eq("id", room.id);
  }

  async function handleFinish(): Promise<string | null> {
    if (!room) return "Salon introuvable.";
    const { error } = await supabase.rpc("finish_game", { p_room: room.id });
    return error ? "Impossible de terminer la correction." : null;
  }

  // ---------- Affichage ----------
  if (notFound) {
    return (
      <Shell center>
        <div className="panel space-y-4 text-center">
          <p className="font-display text-2xl">Salon introuvable</p>
          <p className="font-bold text-nuit/70">{"Le code est faux, ou tu n'as pas rejoint ce salon."}</p>
          <Link href="/" className="btn btn-bleu">
            {"Retour à l'accueil"}
          </Link>
        </div>
      </Shell>
    );
  }

  if (!room) {
    return (
      <Shell center>
        <p className="text-center font-display text-2xl text-white/70">Chargement...</p>
      </Shell>
    );
  }

  const isHost = myId === room.host_id;

  // Phase 4 : résultats
  if (room.status === "finished") {
    return <Results roomId={room.id} players={players} myId={myId} />;
  }

  // Phase 3 : correction (l'hôte corrige, les autres regardent)
  if (room.status === "correcting") {
    if (isHost) {
      return (
        <Correction
          roomId={room.id}
          players={players}
          initialIndex={room.correction_index}
          onIndexChange={handleIndexChange}
          onFinish={handleFinish}
        />
      );
    }
    return (
      <CorrectionView
        roomId={room.id}
        players={players}
        currentIndex={room.correction_index}
        myId={myId}
      />
    );
  }

  // Phase 2 : questions
  if (room.status === "playing") {
    const barColor = progress > 0.5 ? "bg-menthe" : progress > 0.25 ? "bg-soleil" : "bg-tomate";
    return (
      <Shell wide>
        <div className="flex items-center justify-between gap-4">
          <span className="chip bg-white/15 text-white">
            Question {room.current_question + 1} sur {room.total_questions}
          </span>
          <span
            className={`font-display text-4xl tabular-nums ${
              remaining <= 5 ? "animate-pulse text-tomate" : "text-white"
            }`}
            aria-label={`${remaining} secondes restantes`}
          >
            {remaining}
          </span>
        </div>

        <div className="h-4 w-full overflow-hidden rounded-full bg-nuit2" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-linear ${barColor}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {question ? (
          <>
            <div className="panel space-y-4">
              <div className="flex flex-wrap gap-2">
                {question.categorie && (
                  <span className="chip bg-brume text-nuit">{question.categorie}</span>
                )}
                <span className="chip bg-soleil text-nuit">
                  {question.difficulte} point{question.difficulte > 1 ? "s" : ""}
                </span>
              </div>
              <h1 className="font-display text-2xl leading-snug sm:text-4xl">{question.texte}</h1>
            </div>

            <div className="space-y-4">
              <input
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  answerRef.current = e.target.value;
                  setSent(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && sendAnswer()}
                placeholder="Ta réponse"
                aria-label="Ta réponse"
                maxLength={200}
                autoFocus
                className="field"
              />

              <button onClick={sendAnswer} className="btn btn-bleu">
                Envoyer
              </button>

              <p
                className={`min-h-6 text-center text-sm font-bold ${
                  error ? "text-tomate" : "text-menthe"
                }`}
                role="status"
              >
                {error ?? (sent ? "Réponse enregistrée. Tu peux encore la modifier." : "")}
              </p>
              <p className="text-center text-sm text-white/60">
                Les bonnes réponses seront révélées pendant la correction.
              </p>
            </div>
          </>
        ) : (
          <p className="text-center font-display text-2xl text-white/70">Chargement de la question...</p>
        )}
      </Shell>
    );
  }

  // Phase 1 : lobby
  return (
    <Shell center>
      <div className="space-y-8">
        <div className="space-y-3 text-center">
          <p className="font-bold text-white/70">Partage ce code à tes amis</p>
          <CodeTiles code={room.code} />
        </div>

        <section className="space-y-3">
          <h2 className="font-display text-2xl">Joueurs ({players.length})</h2>
          <ul className="flex flex-wrap gap-3">
            {players.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 font-bold text-nuit"
              >
                <Avatar name={p.pseudo} index={i} />
                <span>{p.pseudo}</span>
                {p.user_id === myId && <span className="chip bg-brume text-nuit">toi</span>}
                {p.user_id === room.host_id && <span className="chip bg-soleil text-nuit">Hôte</span>}
              </li>
            ))}
          </ul>
        </section>

        {isHost ? (
          <button onClick={handleStart} disabled={starting} className="btn btn-menthe">
            Lancer la partie
          </button>
        ) : (
          <p className="text-center font-bold text-white/70">
            {"L'hôte lance la partie quand tout le monde est là."}
          </p>
        )}

        {error && (
          <p role="alert" className="text-center text-sm font-bold text-tomate">
            {error}
          </p>
        )}
      </div>
    </Shell>
  );
}