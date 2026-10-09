import { supabase } from "./supabase";

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: "lobby" | "playing" | "correcting" | "finished";
  current_question: number;
  question_ends_at: string | null;
  total_questions: number;
  correction_index: number;
  question_seconds: number;
  nb_questions: number;
  categories: string[] | null;
};

export type Player = {
  id: string;
  pseudo: string;
  user_id: string;
  score: number;
  bonus: number;
};

export type RecapQuestion = {
  id: string;
  position: number;
  texte: string;
  difficulte: number;
  categorie: string | null;
  image_path: string | null;
  bonne_reponse: string;
};

export type RecapAnswer = {
  id: string;
  player_id: string;
  question_id: string;
  texte: string;
  points: number | null;
};

// Charge uniquement les réponses des joueurs (léger, utilisé pour le rafraîchissement régulier).
export async function loadAnswers(playerIds: string[]): Promise<RecapAnswer[]> {
  if (playerIds.length === 0) return [];
  const { data } = await supabase
    .from("answers")
    .select("id, player_id, question_id, texte, points")
    .in("player_id", playerIds);
  return (data ?? []) as RecapAnswer[];
}

// Charge toutes les questions de la partie (avec la bonne réponse) et les réponses des joueurs.
// Les règles RLS décident de ce qui est lisible : tous les membres pendant la correction et à la fin.
export async function loadRecap(roomId: string, playerIds: string[]) {
  const { data: rq } = await supabase
    .from("room_questions")
    .select("position, questions(id, texte, difficulte, categorie, image_path, question_answers(bonne_reponse))")
    .eq("room_id", roomId)
    .order("position");

  const questions: RecapQuestion[] = (rq ?? [])
    .filter((row: any) => row.questions)
    .map((row: any) => {
      const q = row.questions;
      const qa = Array.isArray(q.question_answers) ? q.question_answers[0] : q.question_answers;
      return {
        id: q.id,
        position: row.position,
        texte: q.texte,
        difficulte: q.difficulte,
        categorie: q.categorie,
        image_path: q.image_path ?? null,
        bonne_reponse: qa?.bonne_reponse ?? "?",
      };
    });

  const answers = await loadAnswers(playerIds);
  return { questions, answers };
}

// Adresse publique d'une image de question (stockée dans Supabase Storage)
export function imageUrl(path: string) {
  return supabase.storage.from("question-images").getPublicUrl(path).data.publicUrl;
}