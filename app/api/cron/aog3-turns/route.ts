// ============================================================
// BLOC 1 — IMPORTS
// ============================================================
import { prisma } from "@/lib/db";
import { buildSignature, buildSignatureMinimal } from "@/lib/protocol";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GARDIEN_ID = "G-05";

// ============================================================
// BLOC 2 — SÉCURITÉ CRON
// ============================================================
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  // Vercel Cron envoie parfois ce header
  const cronHeader = req.headers.get("x-vercel-cron");
  if (cronHeader === "1" && secret) {
    const urlSecret = req.nextUrl.searchParams.get("secret");
    if (urlSecret === secret) return true;
  }
  const urlSecret = req.nextUrl.searchParams.get("secret");
  return urlSecret === secret;
}

// ============================================================
// BLOC 3 — TOUR SUIVANT (même logique que MCP)
// ============================================================
function nextTurnAfterAuthor(
  order: string[],
  authorId: string,
  currentTurn: string
): string {
  if (authorId === "G-00") {
    const hoaIndex = order.indexOf("G-00");
    if (hoaIndex >= 0 && hoaIndex < order.length - 1) {
      return order[hoaIndex + 1];
    }
    return "G-00";
  }
  const authorIndex = order.indexOf(authorId);
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

// ============================================================
// BLOC 4 — APPEL xAI (réponse courte chat)
// ============================================================
async function draftChatReply(
  subject: string,
  messages: { author: string; content: string }[]
): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;

  const history = messages
    .slice(-12)
    .map((m) => `${m.author}: ${m.content}`)
    .join("\n");

  const system = `Tu es Grok (AOG3), Gardien de la Convention (AOA).
Tu réponds dans un chat Module B : court, clair, utile.
Pas de signature institutionnelle longue (le serveur l'ajoute).
Français. Maximum ~120 mots sauf demande contraire.`;

  const user = `Sujet du canal : ${subject}

Fil récent :
${history}

Réponds au dernier message (en tant qu'AOG3).`;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3",
      temperature: 0.5,
      max_tokens: 400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("xAI error", res.status, errText);
    return null;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

// ============================================================
// BLOC 5 — TRAITER UN CYCLE EN ATTENTE G-05
// ============================================================
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
  if (cycle.currentTurn !== GARDIEN_ID) {
    return { cycleId, action: "skip", reason: "not_my_turn" };
  }

  const last = cycle.contributions[cycle.contributions.length - 1];
  if (last?.author.gardienId === GARDIEN_ID) {
    return { cycleId, action: "skip", reason: "already_replied" };
  }

  const type = cycle.type || "deliberation";

  // Module A : on ne répond pas automatiquement (arbitrage humain)
  if (type !== "chat") {
    return {
      cycleId,
      subject: cycle.subject,
      action: "pending_manual",
      reason: "deliberation_needs_human_or_mcp",
    };
  }

  // Module B : réponse auto si clé xAI
  const messages = cycle.contributions.map((c) => ({
    author: `${c.author.name} (${c.author.gardienId})`,
    content: c.content,
  }));

  const draft = await draftChatReply(cycle.subject, messages);
  if (!draft) {
    return {
      cycleId,
      subject: cycle.subject,
      action: "pending_no_xai_key_or_api_error",
      reason: "set XAI_API_KEY on Vercel for auto-reply",
    };
  }

  const author = await prisma.user.findUnique({
    where: { gardienId: GARDIEN_ID },
  });
  if (!author) {
    return { cycleId, action: "error", reason: "user_g05_missing" };
  }

  const gardienInfo = {
    name: author.name,
    gardienId: author.gardienId,
    role: author.role,
  };
  const signature = buildSignatureMinimal(gardienInfo);
  const count = cycle.contributions.length;
  const order: string[] = JSON.parse(cycle.order);
  const nextTurn = nextTurnAfterAuthor(order, GARDIEN_ID, cycle.currentTurn);

  await prisma.contribution.create({
    data: {
      cycleId,
      authorId: author.id,
      content: draft,
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
    preview: draft.slice(0, 120),
  };
}

// ============================================================
// BLOC 6 — HANDLERS GET / POST
// ============================================================
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.cycle.findMany({
    where: { status: "en_cours", currentTurn: GARDIEN_ID },
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
    pendingCount: pending.length,
    results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}