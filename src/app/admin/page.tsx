"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { imageUrl } from "../../lib/quiz";
import { Shell, Pills } from "../../components/ui";

type Row = {
  id: string;
  texte: string;
  difficulte: number;
  categorie: string | null;
  actif: boolean;
  image_path: string | null;
  bonne_reponse: string;
};

type Draft = {
  id: string | null;
  texte: string;
  bonne_reponse: string;
  categorie: string;
  difficulte: number;
  image_path: string | null;
};

type NewQuestion = { texte: string; bonne_reponse: string; categorie: string; difficulte: number };

const EMPTY: Draft = {
  id: null,
  texte: "",
  bonne_reponse: "",
  categorie: "",
  difficulte: 1,
  image_path: null,
};
const PAGE = 50;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function parseBulk(text: string, existing: Set<string>) {
  const ok: NewQuestion[] = [];
  const errors: string[] = [];
  let duplicates = 0;
  const seen = new Set(existing);

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [texte, reponse, categorie, diff] = line.split("|").map((p) => p.trim());
    if (!texte || !reponse) {
      errors.push(`Ligne ${i + 1} : il faut au moins une question et une réponse séparées par |`);
      return;
    }
    const difficulte = diff ? Number(diff) : 1;
    if (![1, 2, 3].includes(difficulte)) {
      errors.push(`Ligne ${i + 1} : la difficulté doit être 1, 2 ou 3`);
      return;
    }
    if (seen.has(norm(texte))) {
      duplicates++;
      return;
    }
    seen.add(norm(texte));
    ok.push({ texte, bonne_reponse: reponse, categorie: categorie || "autre", difficulte });
  });

  return { ok, errors, duplicates };
}

const BUCKET = "question-images";

// Réduit l'image (1200 px max) et la convertit en WebP avant l'envoi :
// chargement rapide pour les joueurs, et peu d'espace utilisé sur Supabase.
async function compressImage(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("format");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85)
  );
  if (!blob) throw new Error("compression");
  return blob;
}

async function uploadImage(file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

async function removeImageFile(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

export default function AdminPage() {
  const [phase, setPhase] = useState<"loading" | "login" | "denied" | "ready">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Quand on ouvre ou ferme le formulaire, on oublie le fichier choisi
  useEffect(() => {
    setFile(null);
    setPreview(null);
  }, [draft?.id]);

  function pickFile(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  // ---------- Connexion ----------
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      // Une session anonyme (celle des joueurs) n'est pas un compte administrateur
      if (!user || user.is_anonymous) {
        if (!cancelled) setPhase("login");
        return;
      }
      const { data: ok } = await supabase.rpc("is_admin");
      if (!cancelled) setPhase(ok ? "ready" : "denied");
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login() {
    setAuthError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setAuthError("E-mail ou mot de passe incorrect.");
      setBusy(false);
      return;
    }
    const { data: ok } = await supabase.rpc("is_admin");
    setPhase(ok ? "ready" : "denied");
    setBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setRows([]);
    setPhase("login");
  }

  // ---------- Chargement des questions ----------
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("id, texte, difficulte, categorie, actif, image_path, question_answers(bonne_reponse)")
      .order("categorie")
      .order("texte")
      .range(0, 4999);

    if (error) {
      setNotice({ kind: "error", text: "Impossible de charger les questions." });
      return;
    }
    setRows(
      (data ?? []).map((r: any) => {
        const qa = Array.isArray(r.question_answers) ? r.question_answers[0] : r.question_answers;
        return {
          id: r.id,
          texte: r.texte,
          difficulte: r.difficulte,
          categorie: r.categorie,
          actif: r.actif,
          image_path: r.image_path ?? null,
          bonne_reponse: qa?.bonne_reponse ?? "",
        };
      })
    );
  }, []);

  useEffect(() => {
    if (phase === "ready") load();
  }, [phase, load]);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.categorie).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const s = norm(search);
    return rows.filter(
      (r) =>
        (!catFilter || r.categorie === catFilter) &&
        (!s || norm(r.texte).includes(s) || norm(r.bonne_reponse).includes(s))
    );
  }, [rows, search, catFilter]);

  // ---------- Actions ----------
  function say(kind: "ok" | "error", text: string) {
    setNotice({ kind, text });
  }

  async function save() {
    if (!draft) return;
    const texte = draft.texte.trim();
    const reponse = draft.bonne_reponse.trim();
    const categorie = draft.categorie.trim();
    if (texte.length < 5 || !reponse || !categorie) {
      say("error", "Remplis la question (5 caractères minimum), la réponse et la catégorie.");
      return;
    }
    const duplicate = rows.find((r) => norm(r.texte) === norm(texte) && r.id !== draft.id);
    if (duplicate) {
      say("error", "Cette question existe déjà.");
      return;
    }

    setBusy(true);

    // Image : envoi du nouveau fichier si besoin (draft.image_path vaut null si on l'a retirée)
    const previousPath = draft.id ? rows.find((r) => r.id === draft.id)?.image_path ?? null : null;
    let imagePath: string | null = draft.image_path;
    let uploadedPath: string | null = null;
    if (file) {
      try {
        uploadedPath = await uploadImage(file);
        imagePath = uploadedPath;
      } catch {
        say("error", "Impossible d'envoyer l'image (formats acceptés : JPEG, PNG ou WebP, 2 Mo maximum).");
        setBusy(false);
        return;
      }
    }

    const payload = { texte, difficulte: draft.difficulte, categorie, image_path: imagePath };
    let failed = false;

    if (draft.id) {
      const { error } = await supabase.from("questions").update(payload).eq("id", draft.id);
      const { error: e2 } = error
        ? { error }
        : await supabase
            .from("question_answers")
            .upsert({ question_id: draft.id, bonne_reponse: reponse });
      failed = !!(error || e2);
      if (failed) say("error", "Impossible d'enregistrer les modifications.");
      else say("ok", "Question modifiée.");
    } else {
      const { data, error } = await supabase.from("questions").insert(payload).select("id").single();
      if (error || !data) {
        failed = true;
        say("error", "Impossible d'ajouter la question.");
      } else {
        const { error: e2 } = await supabase
          .from("question_answers")
          .insert({ question_id: data.id, bonne_reponse: reponse });
        if (e2) {
          await supabase.from("questions").delete().eq("id", data.id);
          failed = true;
          say("error", "Impossible d'enregistrer la réponse : la question n'a pas été ajoutée.");
        } else {
          say("ok", "Question ajoutée.");
        }
      }
    }

    // Ménage : on ne garde que les fichiers réellement utilisés
    if (failed && uploadedPath) await removeImageFile(uploadedPath);
    if (!failed && previousPath && previousPath !== imagePath) await removeImageFile(previousPath);

    setBusy(false);
    if (!failed) setDraft(null);
    await load();
  }

  async function remove(r: Row) {
    if (!window.confirm(`Supprimer cette question ?\n\n${r.texte}`)) return;
    const { error } = await supabase.from("questions").delete().eq("id", r.id);
    if (error?.code === "23503") {
      // Déjà utilisée dans une partie : on la désactive au lieu de la supprimer
      await supabase.from("questions").update({ actif: false }).eq("id", r.id);
      say("ok", "Cette question a déjà été jouée : elle est désactivée au lieu d'être supprimée.");
    } else if (error) {
      say("error", "Impossible de supprimer la question.");
    } else {
      say("ok", "Question supprimée.");
      if (r.image_path) await removeImageFile(r.image_path);
    }
    await load();
  }

  async function toggleActif(r: Row) {
    const { error } = await supabase.from("questions").update({ actif: !r.actif }).eq("id", r.id);
    if (error) say("error", "Impossible de modifier la question.");
    await load();
  }

  const bulk = useMemo(
    () => parseBulk(bulkText, new Set(rows.map((r) => norm(r.texte)))),
    [bulkText, rows]
  );

  async function importBulk() {
    if (bulk.ok.length === 0) return;
    setBusy(true);

    const { data, error } = await supabase
      .from("questions")
      .insert(bulk.ok.map((q) => ({ texte: q.texte, difficulte: q.difficulte, categorie: q.categorie })))
      .select("id, texte");

    if (error || !data) {
      say("error", "L'import a échoué : aucune question n'a été ajoutée.");
      setBusy(false);
      return;
    }

    const idByText = new Map(data.map((r: any) => [r.texte as string, r.id as string]));
    const answers = bulk.ok.map((q) => ({
      question_id: idByText.get(q.texte)!,
      bonne_reponse: q.bonne_reponse,
    }));
    const { error: e2 } = await supabase.from("question_answers").insert(answers);

    if (e2) {
      await supabase.from("questions").delete().in("id", data.map((r: any) => r.id));
      say("error", "L'import a échoué : aucune question n'a été ajoutée.");
    } else {
      say("ok", `${data.length} question${data.length > 1 ? "s" : ""} ajoutée${data.length > 1 ? "s" : ""}.`);
      setBulkText("");
      setBulkOpen(false);
    }

    setBusy(false);
    await load();
  }

  // ---------- Affichage : connexion ----------
  if (phase === "loading") {
    return (
      <Shell center>
        <p className="text-center font-display text-2xl text-white/70">Chargement...</p>
      </Shell>
    );
  }

  if (phase === "login") {
    return (
      <Shell center>
        <div className="space-y-6">
          <h1 className="text-center font-display text-4xl">Administration</h1>
          <div className="panel space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              aria-label="E-mail"
              autoComplete="email"
              className="field"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && password && login()}
              placeholder="Mot de passe"
              aria-label="Mot de passe"
              autoComplete="current-password"
              className="field"
            />
            <button onClick={login} disabled={!email || !password || busy} className="btn btn-bleu">
              Se connecter
            </button>
            {authError && (
              <p role="alert" className="rounded-xl bg-tomate/10 px-3 py-2 text-center text-sm font-bold text-erreur">
                {authError}
              </p>
            )}
          </div>
          <Link href="/" className="btn btn-ghost">
            Retour au jeu
          </Link>
        </div>
      </Shell>
    );
  }

  if (phase === "denied") {
    return (
      <Shell center>
        <div className="panel space-y-4 text-center">
          <p className="font-display text-2xl">Accès refusé</p>
          <p className="font-bold text-nuit/70">{"Ce compte n'a pas les droits d'administration."}</p>
          <button onClick={logout} className="btn btn-bleu">
            Se déconnecter
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Affichage : administration ----------
  const shown = filtered.slice(0, visible);

  return (
    <Shell wide>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-4xl">Questions</h1>
          <span className="chip bg-white/15 text-white">{rows.length} au total</span>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="btn btn-ghost btn-sm">
            Retour au jeu
          </Link>
          <button onClick={logout} className="btn btn-ghost btn-sm">
            Se déconnecter
          </button>
        </div>
      </header>

      {notice && (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 font-bold ${
            notice.kind === "ok" ? "bg-menthe text-nuit" : "bg-tomate text-white"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => {
            setDraft({ ...EMPTY });
            setBulkOpen(false);
            setNotice(null);
          }}
          className="btn btn-menthe btn-sm"
        >
          Ajouter une question
        </button>
        <button
          onClick={() => {
            setBulkOpen((o) => !o);
            setDraft(null);
            setNotice(null);
          }}
          className="btn btn-bleu btn-sm"
        >
          Importer plusieurs questions
        </button>
      </div>

      {draft && (
        <section className="panel space-y-4">
          <h2 className="font-display text-2xl">{draft.id ? "Modifier la question" : "Nouvelle question"}</h2>
          <textarea
            value={draft.texte}
            onChange={(e) => setDraft({ ...draft, texte: e.target.value })}
            placeholder="La question"
            aria-label="La question"
            rows={3}
            className="field"
          />
          <input
            value={draft.bonne_reponse}
            onChange={(e) => setDraft({ ...draft, bonne_reponse: e.target.value })}
            placeholder="La bonne réponse"
            aria-label="La bonne réponse"
            className="field"
          />
          <input
            value={draft.categorie}
            onChange={(e) => setDraft({ ...draft, categorie: e.target.value })}
            placeholder="Catégorie (anime, cinéma...)"
            aria-label="Catégorie"
            list="categories-existantes"
            className="field"
          />
          <datalist id="categories-existantes">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="space-y-2">
            <p className="font-bold">Difficulté (points rapportés)</p>
            <Pills
              options={[1, 2, 3]}
              value={draft.difficulte}
              onChange={(v) => setDraft({ ...draft, difficulte: v })}
            />
          </div>
          <div className="space-y-2">
            <p className="font-bold">Image (facultative)</p>
            {(preview || draft.image_path) && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={preview ?? imageUrl(draft.image_path!)}
                alt="Aperçu de l'image de la question"
                className="max-h-56 w-full rounded-2xl bg-brume object-contain"
              />
            )}
            <div className="flex flex-wrap gap-2">
              <label className="btn btn-bleu btn-sm cursor-pointer focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-bleu">
                {preview || draft.image_path ? "Changer l'image" : "Choisir une image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {(preview || draft.image_path) && (
                <button
                  type="button"
                  onClick={() => {
                    pickFile(null);
                    setDraft({ ...draft, image_path: null });
                  }}
                  className="btn btn-sm bg-brume text-nuit"
                >
                  {"Retirer l'image"}
                </button>
              )}
            </div>
            <p className="text-sm font-bold text-nuit/60">
              {"JPEG, PNG ou WebP. L'image est réduite automatiquement avant l'envoi."}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={save} disabled={busy} className="btn btn-menthe">
              Enregistrer
            </button>
            <button onClick={() => setDraft(null)} className="btn btn-sm bg-brume text-nuit">
              Annuler
            </button>
          </div>
        </section>
      )}

      {bulkOpen && (
        <section className="panel space-y-4">
          <h2 className="font-display text-2xl">Importer plusieurs questions</h2>
          <p className="font-bold text-nuit/70">
            Une question par ligne, avec ce format : question | réponse | catégorie | difficulté.
            La catégorie et la difficulté (1, 2 ou 3) sont facultatives.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Quelle est la capitale de l'Italie ? | Rome | géographie | 1\nQui a écrit Les Misérables ? | Victor Hugo | culture générale | 2"}
            aria-label="Questions à importer"
            rows={8}
            className="field font-mono text-base"
          />
          {bulkText.trim() && (
            <div className="space-y-1 text-sm font-bold">
              <p className="text-nuit">
                {bulk.ok.length} question{bulk.ok.length > 1 ? "s" : ""} prête{bulk.ok.length > 1 ? "s" : ""} à importer
                {bulk.duplicates > 0 && `, ${bulk.duplicates} déjà existante${bulk.duplicates > 1 ? "s" : ""} ignorée${bulk.duplicates > 1 ? "s" : ""}`}
              </p>
              {bulk.errors.map((e) => (
                <p key={e} className="text-erreur">
                  {e}
                </p>
              ))}
            </div>
          )}
          <button onClick={importBulk} disabled={busy || bulk.ok.length === 0} className="btn btn-menthe">
            {bulk.ok.length > 0 ? `Importer ${bulk.ok.length} question${bulk.ok.length > 1 ? "s" : ""}` : "Importer"}
          </button>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE);
          }}
          placeholder="Rechercher dans les questions et réponses"
          aria-label="Rechercher"
          className="field min-w-0 flex-1 basis-64"
        />
        <select
          value={catFilter}
          onChange={(e) => {
            setCatFilter(e.target.value);
            setVisible(PAGE);
          }}
          aria-label="Filtrer par catégorie"
          className="field w-auto"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="font-bold text-white/70">
        {filtered.length} question{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}
      </p>

      <ul className="space-y-3">
        {shown.map((r) => (
          <li
            key={r.id}
            className={`space-y-3 rounded-2xl bg-nuit2 p-4 ${r.actif ? "" : "opacity-60"}`}
          >
            <div className="flex flex-wrap gap-2">
              {r.categorie && <span className="chip bg-brume text-nuit">{r.categorie}</span>}
              <span className="chip bg-soleil text-nuit">
                {r.difficulte} point{r.difficulte > 1 ? "s" : ""}
              </span>
              {!r.actif && <span className="chip bg-tomate text-white">Désactivée</span>}
            </div>
            {r.image_path && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl(r.image_path)}
                alt="Image de la question"
                className="h-20 w-auto rounded-xl bg-brume object-contain"
                loading="lazy"
              />
            )}
            <p className="text-lg font-bold">{r.texte}</p>
            <p className="font-bold text-menthe">{r.bonne_reponse}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setDraft({
                    id: r.id,
                    texte: r.texte,
                    bonne_reponse: r.bonne_reponse,
                    categorie: r.categorie ?? "",
                    image_path: r.image_path,
                    difficulte: r.difficulte,
                  });
                  setBulkOpen(false);
                  setNotice(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="btn btn-ghost btn-sm"
              >
                Modifier
              </button>
              <button onClick={() => toggleActif(r)} className="btn btn-ghost btn-sm">
                {r.actif ? "Désactiver" : "Réactiver"}
              </button>
              <button onClick={() => remove(r)} className="btn btn-ghost btn-sm">
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>

      {filtered.length > visible && (
        <button onClick={() => setVisible((v) => v + PAGE)} className="btn btn-ghost">
          Afficher plus ({filtered.length - visible} restantes)
        </button>
      )}
    </Shell>
  );
}