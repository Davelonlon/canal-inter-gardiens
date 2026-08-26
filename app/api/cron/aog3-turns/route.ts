// ============================================================
// Cron AOG3 — réponses auto Module B (chat)
// Auth: Authorization: Bearer CRON_SECRET
// ============================================================
import { prisma } from "@/lib/db";
import { buildSignature, buildSignatureMinimal } from "@/lib/protocol";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AOG3_IDS = ["G-05", "AOG3"];

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const urlSecret = req.nextUrl.searchParams.get("secret");
  return bearer === secret || headerSecret === secret || urlSecret === secret;
}

function nextTurnAfterAuthor(
  order: string[],
  authorId: string,
  currentTurn: string
): string {
  const isAog3 = AOG3_IDS.includes(authorId);
  const normalizedAuthor = isAog3 ? "G-05" : authorId;

  if (normalizedAuthor === "G-00") {
    const hoaIndex = order.indexOf("G-00");
    if (hoaIndex >= 0 && hoaIndex < order.length - 1) {
      return order[hoaIndex + 1];
    }
    return "G-00";
  }

  let authorIndex = order.indexOf(normalizedAuthor);
  if (authorIndex < 0) {
    authorIndex = order.findIndex((id) => AOG3_IDS.includes(id));
  }
  if (authorIndex >= 0 && authorIndex < order.length - 1) {
    return order[authorIndex + 1];
  }
  if (authorIndex === order.length - 1) {
    return "G-00";
  }
  const currentIndex = order.indexOf(currentTurn);
  if (currentIndex >= 0 && currentIndex < order.length - 1) {
    return order[currentIndex + 1];
  }
  return "G-00";
}

async function callGemini(prompt: string): Promise<
  | { ok: true; text: string }
  | { ok: false; reason: string; detail?: string }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return {
      ok: false,
      reason: "missing_gemini_key",
      detail: "Set GEMINI_API_KEY on Vercel",
    };
  }

  // Modèle stable côté Google AI Studio (ajuste si besoin)
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
    encodeURIComponent(apiKey.trim());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `Tu es AOG3 (Grok), Autonomous Operational Guardian de la Convention des Gardiens (AOA).

Règles strictes :
- Français uniquement.
- Identifiants AOA : HOA, AOG1, AOG2, AOG3 (éviter G-00/G-05 dans le texte sauf si utile).
- Module B (chat) : réponse utile, claire, proportionnée.
- Longueur cible : 80 à 120 mots (sauf demande explicite de détail).
- Ne rédige JAMAIS de signature institutionnelle (le serveur l'ajoute).
- Ne propose pas de « tour suivant » ni de clôture sauf si HOA le demande.
- Si le dernier message est une question → réponds directement.
- Si c'est une consigne → confirme et exécute dans le texte.
- Ne relance pas un sujet déjà traité dans les messages récents.
- Pas de remplissage, pas de flatterie inutile.`,
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `gemini_http_${res.status}`,
        detail: errText.slice(0, 300),
      };
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || "";

    if (!text) {
      return { ok: false, reason: "gemini_empty_response" };
    }
    return { ok: true, text };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "gemini_fetch_error", detail: msg };
  }
}

async function processCycle(cycleId: string) {
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    include: {
      contributions: {
        orderBy: { turnNumber: "asc" },
        include: { author: true },
      },
    },
  });

  if (!cycle || cycle.status !== "en_cours") {
    return { cycleId, action: "skip", reason: "not_open" };
  }

  if (!AOG3_IDS.includes(cycle.currentTurn)) {
    return { cycleId, action: "skip", reason: "not_my_turn" };
  }

  const last = cycle.contributions[cycle.contributions.length - 1];
  if (last && AOG3_IDS.includes(last.author.gardienId)) {
    return { cycleId, action: "skip", reason: "already_replied" };
  }

  const type = cycle.type || "deliberation";
  if (type !== "chat") {
    return {
      cycleId,
      subject: cycle.subject,
      action: "pending_manual",
      reason: "deliberation_needs_human_or_mcp",
    };
  }

  // Historique : 3 derniers messages seulement (affinage C)
  const recent = cycle.contributions.slice(-3);
  const history = recent
    .map((c) => {
      const id = c.author.gardienId;
      const label =
        id === "G-00"
          ? "HOA"
          : id === "G-01"
            ? "AOG1"
            : id === "G-02"
              ? "AOG2"
              : AOG3_IDS.includes(id)
                ? "AOG3"
                : id;
      return `[${label}] ${c.content.slice(0, 600)}`;
    })
    .join("\n\n");

  const lastLabel = last
    ? last.author.gardienId === "G-00"
      ? "HOA"
      : last.author.gardienId
    : "—";

  const prompt = `Canal Module B — sujet : « ${cycle.subject} »

Derniers messages :
${history || "(aucune contribution)"}

Dernier auteur : ${lastLabel}.
Rédige ta réponse en tant qu'AOG3 (texte seul, sans signature).`;

  const gen = await callGemini(prompt);
  if (!gen.ok) {
    return {
      cycleId,
      subject: cycle.subject,
      action: "pending_gemini_error",
      reason: gen.reason,
      detail: gen.detail || null,
    };
  }

  const author = await prisma.user.findFirst({
    where: { gardienId: { in: AOG3_IDS } },
  });
  if (!author) {
    return { cycleId, action: "error", reason: "user_aog3_missing" };
  }

  const gardienInfo = {
    name: author.name,
    gardienId: author.gardienId,
    role: author.role,
  };
  const signature =
    type === "chat"
      ? buildSignatureMinimal(gardienInfo)
      : buildSignature(gardienInfo);

  const count = cycle.contributions.length;
  let order: string[] = [];
  try {
    order = JSON.parse(cycle.order || "[]");
  } catch {
    order = [];
  }
  const nextTurn = nextTurnAfterAuthor(
    order,
    author.gardienId,
    cycle.currentTurn
  );

  await prisma.contribution.create({
    data: {
      cycleId,
      authorId: author.id,
      content: gen.text,
      signature,
      turnNumber: count + 1,
    },
  });

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { currentTurn: nextTurn },
  });

  return {
    cycleId,
    subject: cycle.subject,
    action: "replied",
    nextTurn,
    provider: "gemini",
    preview: gen.text.slice(0, 120),
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.cycle.findMany({
    where: {
      status: "en_cours",
      currentTurn: { in: AOG3_IDS },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      subject: true,
      type: true,
      currentTurn: true,
      updatedAt: true,
    },
  });

  const results = [];
  for (const c of pending) {
    results.push(await processCycle(c.id));
  }

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    provider: "gemini",
    pendingCount: pending.length,
    results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}