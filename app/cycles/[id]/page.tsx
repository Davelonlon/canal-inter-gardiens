// ============================================================
// BLOC 1 — IMPORTS
// ============================================================
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  buildSignature,
  buildSignatureMinimal,
  toAoaId,
  toAoaLabel,
} from "@/lib/protocol";

export const dynamic = "force-dynamic";

// ============================================================
// BLOC 2 — PUBLIER UNE CONTRIBUTION (UNE SEULE FOIS)
// Module A = signature complète | Module B = signature courte
// ============================================================
async function addContribution(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  const authorGardienId = formData.get("authorGardienId") as string;
  const content = formData.get("content") as string;
  if (!cycleId || !authorGardienId || !content) return;

  const author = await prisma.user.findUnique({
    where: { gardienId: authorGardienId },
  });
  if (!author) return;

  const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
  if (!cycle || cycle.status !== "en_cours") return;
  if (cycle.phase === "clos") return;

  const count = await prisma.contribution.count({ where: { cycleId } });

  const gardienInfo = {
    name: author.name,
    gardienId: author.gardienId,
    role: author.role,
  };

  const signature =
    cycle.type === "chat"
      ? buildSignatureMinimal(gardienInfo)
      : buildSignature(gardienInfo);

  await prisma.contribution.create({
    data: {
      cycleId,
      authorId: author.id,
      content,
      signature,
      turnNumber: count + 1,
    },
  });

  // --- Avancer le tour ---
  const order: string[] = JSON.parse(cycle.order);
  let nextTurn = cycle.currentTurn;

  if (authorGardienId === "G-00") {
    const hoaIndex = order.indexOf("G-00");
    if (hoaIndex >= 0 && hoaIndex < order.length - 1) {
      nextTurn = order[hoaIndex + 1];
    } else {
      nextTurn = "G-00";
    }
  } else {
    const authorIndex = order.indexOf(authorGardienId);
    if (authorIndex >= 0 && authorIndex < order.length - 1) {
      nextTurn = order[authorIndex + 1];
    } else if (authorIndex === order.length - 1) {
      nextTurn = cycle.facilitatorId || "G-00";
    } else {
      const currentIndex = order.indexOf(cycle.currentTurn);
      if (currentIndex >= 0 && currentIndex < order.length - 1) {
        nextTurn = order[currentIndex + 1];
      } else {
        nextTurn = cycle.facilitatorId || "G-00";
      }
    }
  }

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { currentTurn: nextTurn },
  });

  redirect(`/cycles/${cycleId}`);
}

// ============================================================
// BLOC 3 — CHANGER DE PHASE (Module A : depot → synthese → …)
// ============================================================
async function setPhase(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  const phase = formData.get("phase") as string;
  if (!cycleId || !["depot", "synthese", "arbitrage", "clos"].includes(phase))
    return;

  const data: { phase: string; currentTurn?: string; status?: string } = {
    phase,
  };
  if (phase === "synthese") {
    const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
    data.currentTurn = cycle?.facilitatorId || "G-00";
  }
  if (phase === "arbitrage") {
    data.currentTurn = "G-00";
  }
  if (phase === "clos") {
    data.status = "cloture";
  }

  await prisma.cycle.update({ where: { id: cycleId }, data });
  redirect(`/cycles/${cycleId}`);
}

// ============================================================
// BLOC 4 — LANCER LE TOUR 2 (Module A, max 2 tours)
// ============================================================
async function startRound2(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  if (!cycleId) return;
  const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
  if (!cycle || (cycle.turnRound ?? 1) >= 2) return;

  const order: string[] = JSON.parse(cycle.order);
  const depotDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await prisma.cycle.update({
    where: { id: cycleId },
    data: {
      turnRound: 2,
      phase: "depot",
      currentTurn: order[0] || "G-00",
      status: "en_cours",
      depotDeadline,
    },
  });
  redirect(`/cycles/${cycleId}`);
}

// ============================================================
// BLOC 5 — STATUT DU CYCLE (interrompre / clôturer / reprendre)
// ============================================================
async function updateCycleStatus(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  const newStatus = formData.get("status") as string;
  if (
    !cycleId ||
    !["cloture", "interrompu", "en_cours", "archive"].includes(newStatus)
  )
    return;
  await prisma.cycle.update({
    where: { id: cycleId },
    data: { status: newStatus },
  });
  redirect(`/cycles/${cycleId}`);
}

// ============================================================
// BLOC 6 — SUPPRIMER LE CYCLE
// ============================================================
async function deleteCycle(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  if (!cycleId) return;
  await prisma.contribution.deleteMany({ where: { cycleId } });
  await prisma.cycle.delete({ where: { id: cycleId } });
  redirect("/cycles");
}

// ============================================================
// BLOC 7 — AFFICHAGE DU DÉLAI 48 H
// ============================================================
function formatDeadline(deadline: Date | null): {
  label: string;
  expired: boolean;
} {
  if (!deadline) return { label: "—", expired: false };
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0) return { label: "Timeout dépassé", expired: true };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return {
    label: `${h} h ${m} min restantes`,
    expired: false,
  };
}
function formatLocal(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(d);
}

// ============================================================
// BLOC 8 — PAGE (ce que tu vois à l’écran)
// ============================================================
export default async function CyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      contributions: {
        orderBy: { turnNumber: "asc" },
        include: { author: true },
      },
    },
  });
  if (!cycle) notFound();

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { gardienId: "asc" },
  });

  const order: string[] = JSON.parse(cycle.order);
  const type = cycle.type || "deliberation";
  const phase = cycle.phase || "depot";
  const turnRound = cycle.turnRound ?? 1;
  const isDelib = type === "deliberation";
  const maskTexts = isDelib && phase === "depot";

  const publishedIds = new Set(
    cycle.contributions.map((c) => c.author.gardienId)
  );

  const deadlineInfo = formatDeadline(
    cycle.depotDeadline ? new Date(cycle.depotDeadline) : null
  );

  const apiUrl = `https://canal-inter-gardiens-2dhi.vercel.app/api/cycles/${cycle.id}`;

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        {/* --- Lien retour --- */}
        <div className="mb-6">
          <Link
            href="/cycles"
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Retour aux cycles
          </Link>
        </div>

        {/* --- En-tête cycle --- */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                {cycle.subject}
              </h1>

              {/* Infos Module / Phase / Tour */}
              <div className="flex flex-wrap gap-3 text-sm text-slate-600 mb-3">
                <span>
                  Module :{" "}
                  <strong>{isDelib ? "A — Délibération" : "B — Chat"}</strong>
                </span>
                <span>
                  Phase : <strong>{phase}</strong>
                </span>
                <span>
                  Tour n° <strong>{turnRound}</strong>
                </span>
                <span>
                  Statut : <strong>{cycle.status}</strong>
                </span>
                <span>
                  Tour actuel :{" "}
                  <strong>{toAoaId(cycle.currentTurn)}</strong>
                </span>
                {cycle.facilitatorId && (
                  <span>
                    Facilitateur :{" "}
                    <strong>{toAoaId(cycle.facilitatorId)}</strong>
                  </span>
                )}
              </div>

              {/* Bandeau Module B (chat) */}
              {!isDelib && (
                <div className="mb-3 p-3 rounded-lg border border-sky-200 bg-sky-50 text-sky-900 text-sm">
                  Module B — Chat : contributions visibles en direct. Pas
                  d&apos;arbitrage obligatoire à chaque message. Clôture quand
                  le but est atteint.
                </div>
              )}

              {/* Bandeau timeout Module A */}
              {isDelib && phase === "depot" && (
                <div
                  className={
                    deadlineInfo.expired
                      ? "mb-3 p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-sm"
                      : "mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm"
                  }
                >
                  Délai de dépôt : <strong>{deadlineInfo.label}</strong>
                  {deadlineInfo.expired && (
                    <span className="block mt-1">
                      HOA peut forcer → Synthèse (bypass).
                    </span>
                  )}
                </div>
              )}

              {/* ID + API */}
              <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs font-medium text-slate-500 mb-1">
                  ID du cycle
                </div>
                <code className="text-sm text-slate-900 break-all">
                  {cycle.id}
                </code>
                <div className="text-xs text-slate-500 mt-2">API JSON</div>
                <code className="text-xs text-slate-700 break-all">
                  {apiUrl}
                </code>
              </div>

              {/* Voyants rouge / vert */}
              <p className="text-xs font-medium text-slate-500 mb-2">
                Publications (ce cycle)
              </p>
              <div className="flex flex-wrap gap-3 mb-2">
                {order.map((gardienId) => {
                  const done = publishedIds.has(gardienId);
                  return (
                    <div
                      key={gardienId}
                      className={
                        done
                          ? "flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-green-500 bg-green-50"
                          : "flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-red-400 bg-red-50"
                      }
                    >
                      <span
                        className={
                          done
                            ? "h-3 w-3 rounded-full bg-green-500"
                            : "h-3 w-3 rounded-full bg-red-500"
                        }
                      />
                      <span
                        className={
                          done
                            ? "text-sm font-medium text-green-900"
                            : "text-sm font-medium text-red-900"
                        }
                      >
                        {toAoaId(gardienId)}
                      </span>
                      <span
                        className={
                          done
                            ? "text-xs text-green-700"
                            : "text-xs text-red-700"
                        }
                      >
                        {done ? "publié" : "en attente"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {maskTexts && (
                <p className="text-xs text-amber-700 mt-2">
                  Mode A — phase dépôt : textes masqués entre Gardiens. HOA
                  force la suite via les boutons de phase.
                </p>
              )}
            </div>

            {/* --- Boutons HOA (droite) --- */}
            <div className="flex flex-col gap-2 shrink-0">
              {cycle.status === "en_cours" && isDelib && (
                <>
                  {phase === "depot" && (
                    <form action={setPhase}>
                      <input type="hidden" name="cycleId" value={cycle.id} />
                      <input type="hidden" name="phase" value="synthese" />
                      <button
                        type="submit"
                        className="w-full text-sm px-3 py-1.5 rounded-lg border border-blue-300 text-blue-800 hover:bg-blue-50 font-medium"
                      >
                        → Synthèse
                        {deadlineInfo.expired ? " (bypass)" : ""}
                      </button>
                    </form>
                  )}
                  {phase === "synthese" && (
                    <form action={setPhase}>
                      <input type="hidden" name="cycleId" value={cycle.id} />
                      <input type="hidden" name="phase" value="arbitrage" />
                      <button
                        type="submit"
                        className="w-full text-sm px-3 py-1.5 rounded-lg border border-blue-300 text-blue-800 hover:bg-blue-50 font-medium"
                      >
                        → Arbitrage
                      </button>
                    </form>
                  )}
                  {phase === "arbitrage" && turnRound < 2 && (
                    <form action={startRound2}>
                      <input type="hidden" name="cycleId" value={cycle.id} />
                      <button
                        type="submit"
                        className="w-full text-sm px-3 py-1.5 rounded-lg border border-violet-300 text-violet-800 hover:bg-violet-50"
                      >
                        Lancer tour 2
                      </button>
                    </form>
                  )}
                  {phase === "arbitrage" && (
                    <form action={setPhase}>
                      <input type="hidden" name="cycleId" value={cycle.id} />
                      <input type="hidden" name="phase" value="clos" />
                      <button
                        type="submit"
                        className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Clôturer
                      </button>
                    </form>
                  )}
                </>
              )}

              {cycle.status === "en_cours" ? (
                <>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="interrompu" />
                    <button
                      type="submit"
                      className="w-full text-sm px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      Interrompre
                    </button>
                  </form>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="cloture" />
                    <button
                      type="submit"
                      className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Clôturer (statut)
                    </button>
                  </form>
                </>
              ) : (
                <form action={updateCycleStatus}>
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <input type="hidden" name="status" value="en_cours" />
                  <button
                    type="submit"
                    className="w-full text-sm px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50"
                  >
                    Reprendre
                  </button>
                </form>
              )}

              {cycle.status !== "en_cours" && (
                <form action={deleteCycle}>
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <button
                    type="submit"
                    className="w-full text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

               {/* --- Liste des contributions --- */}
        <div className={isDelib ? "space-y-4 mb-8" : "space-y-2 mb-8"}>
          {cycle.contributions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
              Aucune contribution pour le moment.
            </div>
          ) : isDelib ? (
            /* ===== MODULE A : cartes classiques ===== */
            cycle.contributions.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-slate-200 p-5"
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-slate-900">
                    Tour {c.turnNumber} — {c.author.name} (
                    {toAoaId(c.author.gardienId)})
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(c.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
                {!maskTexts ? (
                  <>
                    <div className="text-slate-700 whitespace-pre-wrap mb-4">
                      {c.content}
                    </div>
                    <pre className="text-xs text-slate-500 bg-slate-50 p-3 rounded overflow-x-auto">
                      {c.signature}
                    </pre>
                  </>
                ) : (
                  <div className="text-sm text-slate-500 italic bg-slate-50 p-3 rounded">
                    Contenu masqué jusqu&apos;à la phase synthèse.
                  </div>
                )}
              </div>
            ))
          ) : (
            /* ===== MODULE B : chat horizontal ===== */
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {cycle.contributions.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap sm:flex-nowrap gap-3 px-4 py-3 items-start hover:bg-slate-50"
                >
                  {/* Expéditeur */}
                  <div className="shrink-0 w-28 sm:w-32">
                    <div className="text-sm font-semibold text-slate-900">
                      {c.author.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {toAoaId(c.author.gardienId)}
                    </div>
                  </div>

                  {/* Message */}
                  <div className="flex-1 min-w-0 text-slate-800 whitespace-pre-wrap text-sm leading-relaxed">
                    {c.content}
                  </div>

                  {/* Date / heure */}
                  <div className="shrink-0 text-xs text-slate-400 sm:text-right w-full sm:w-28">
                    {new Date(c.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Formulaire nouvelle contribution --- */}
        {cycle.status === "en_cours" && phase !== "clos" ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Nouvelle contribution
            </h2>
            <form action={addContribution} className="space-y-4">
              <input type="hidden" name="cycleId" value={cycle.id} />
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Auteur
                </label>
                <select
                  name="authorGardienId"
                  required
                  defaultValue={cycle.currentTurn}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.gardienId}>
                      {toAoaLabel(u.gardienId)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Contenu
                </label>
                <textarea
                  name="content"
                  required
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
                  placeholder="Écris ta contribution ici..."
                />
              </div>
              <button
                type="submit"
                className="w-full bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800"
              >
                Publier
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl border border-slate-200 p-6 text-center text-slate-700">
            Cycle <strong>{cycle.status}</strong> / phase{" "}
            <strong>{phase}</strong>.
          </div>
        )}
      </div>
    </main>
  );
}