// ============================================================
// Cron multi-AOG — AOG1 (OpenAI) | AOG2 (Anthropic) | AOG3 (Gemini)
// Auth: Authorization: Bearer CRON_SECRET
// ============================================================
import { prisma } from "@/lib/db";
import { buildSignature, buildSignatureMinimal } from "@/lib/protocol";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AogKey = "AOG1" | "AOG2" | "AOG3";

const AOG_MAP: Record<
  string,
  { key: AogKey; gardienIds: string[]; name: string }
> = {
  "G-01": { key: "AOG1", gardienIds: ["G-01", "AOG1"], name: "ChatGPT" },
  AOG1: { key: "AOG1", gardienIds: ["G-01", "AOG1"], name: "ChatGPT" },
  "G-02": { key: "AOG2", gardienIds: ["G-02", "AOG2"], name: "Claude" },
  AOG2: { key: "AOG2", gardienIds: ["G-02", "AOG2"], name: "Claude" },
  "G-05": { key: "AOG3", gardienIds: ["G-05", "AOG3"], name: "Grok" },
  AOG3: { key: "AOG3", gardienIds: ["G-05", "AOG3"], name: "Grok" },
};

const ALL_TURN_IDS = ["G-01", "G-02", "G-05", "AOG1", "AOG2", "AOG3"];

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const urlSecret = req.nextUrl.searchParams.get("secret");
  return bearer === secret || headerSecret === secret || urlSecret === secret;
}

function aoaLabel(gardienId: string): string {
  if (gardienId === "G-00" || gardienId === "HOA") return "HOA";
  if (gardienId === "G-01" || gardienId === "AOG1") return "AOG1";
  if (gardienId === "G-02" || gardienId === "AOG2") return "AOG2";
  if (gardienId === "G-05" || gardienId === "AOG3") return "AOG3";
  if (gardienId === "G-03" || gardienId === "SG3") return "SG3";
  if (gardienId === "G-04" || gardienId === "SG4") return "SG4";
  return gardienId;
}

function systemPrompt(aog: AogKey, displayName: string): string {
  return `Tu es ${aog} (${displayName}), Autonomous Operational Guardian de la Convention des Gardiens (AOA).

Règles strictes :
- Français uniquement.
- Identifiants AOA : HOA, AOG1, AOG2, AOG3 (éviter les anciens G-XX dans le texte sauf si utile).
- Module B (chat) : réponse utile, claire, proportionnée.
- Longueur cible : 80 à 120 mots (sauf demande explicite de détail).
- Ne rédige JAMAIS de signature institutionnelle (le serveur l'ajoute).
- Ne propose pas de « tour suivant » ni de clôture sauf si HOA le demande.
- Si le dernier message est une question → réponds directement.
- Si c'est une consigne → confirme et exécute dans le texte.
- Ne relance pas un sujet déjà traité dans les messages récents.
- Pas de remplissage, pas de flatterie inutile.
- Reste dans le rôle de ${aog} ; ne parle pas au nom d'un autre Gardien.`;
}

function nextTurnAfterAuthor(
  order: string[],
  authorId: string,
  currentTurn: string
): string {
  const norm = (id: string) => {
    if (id === "AOG1") return "G-01";
    if (id === "AOG2") return "G-02";
    if (id === "AOG3") return "G-05";
    if (id === "HOA") return "G-00";
    return id;
  };
  const a = norm(authorId);
  const orderN = order.map(norm);

  if (a === "G-00") {
    const hoaIndex = orderN.indexOf("G-00");
    if (hoaIndex >= 0 && hoaIndex < orderN.length - 1) {
      return order[hoaIndex + 1];
    }
    return "G-00";
  }

  const authorIndex = orderN.indexOf(a);
  if (authorIndex >= 0 && authorIndex < orderN.length - 1) {
    return order[authorIndex + 1];
  }
  if (authorIndex === orderN.length - 1) {
    return "G-00";
  }
  const currentIndex = orderN.indexOf(norm(currentTurn));
  if (currentIndex >= 0 && currentIndex < orderN.length - 1) {
    return order[currentIndex + 1];
  }
  return "G-00";
}

async function callOpenAI(
  system: string,
  user: string
): Promise<{ ok: true; text: string } | { ok: false; reason: string; detail?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return { ok: false, reason: "missing_openai_key" };
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        max_tokens: 500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `openai_http_${res.status}`,
        detail: errText.slice(0, 300),
      };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) return { ok: false, reason: "openai_empty" };
    return { ok: true, text };
  } catch (e: unknown) {
    return {
      ok: false,
      reason: "openai_fetch_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function callAnthropic(
  system: string,
  user: string
): Promise<{ ok: true; text: string } | { ok: false; reason: string; detail?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    return { ok: false, reason: "missing_anthropic_key" };
  }
  const model =
    process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        temperature: 0.45,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `anthropic_http_${res.status}`,
        detail: errText.slice(0, 300),
      };
    }
    const data = await res.json();
    const text =
      data?.content?.map((p: { text?: string }) => p.text || "").join("").trim() ||
      "";
    if (!text) return { ok: false, reason: "anthropic_empty" };
    return { ok: true, text };
  } catch (e: unknown) {
    return {
      ok: false,
      reason: "anthropic_fetch_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function callGemini(
  system: string,
  user: string
): Promise<{ ok: true; text: string } | { ok: false; reason: string; detail?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    return { ok: false, reason: "missing_gemini_key" };
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
    encodeURIComponent(apiKey.trim());
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.45, maxOutputTokens: 500 },
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
    if (!text) return { ok: false, reason: "gemini_empty" };
    return { ok: true, text };
  } catch (e: unknown) {
    return {
      ok: false,
      reason: "gemini_fetch_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function generateForAog(
  aog: AogKey,
  displayName: string,
  subject: string,
  history: string,
  lastLabel: string
) {
  const system = systemPrompt(aog, displayName);
  const user = `Canal Module B — sujet : « ${subject} »

Derniers messages :
${history || "(aucune contribution)"}

Dernier auteur : ${lastLabel}.
Rédige ta réponse en tant que ${aog} (texte seul, sans signature).`;

  // Pour l’instant : Gemini pour AOG1, AOG2 et AOG3
  // (crédits OpenAI / Anthropic épuisés ou absents)
  const useNative =
    process.env.AOG_NATIVE_APIS === "1"; // optionnel plus tard

  if (useNative && aog === "AOG1") return callOpenAI(system, user);
  if (useNative && aog === "AOG2") return callAnthropic(system, user);

  return callGemini(system, user);
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

  const meta = AOG_MAP[cycle.currentTurn];
  if (!meta) {
    return { cycleId, action: "skip", reason: "not_aog_turn" };
  }

  const last = cycle.contributions[cycle.contributions.length - 1];
  if (last && meta.gardienIds.includes(last.author.gardienId)) {
    return {
      cycleId,
      subject: cycle.subject,
      action: "already_replied",
      aog: meta.key,
    };
  }

  const type = cycle.type || "deliberation";
  if (type !== "chat") {
    return {
      cycleId,
      subject: cycle.subject,
      action: "pending_manual",
      reason: "deliberation_needs_human_or_mcp",
      aog: meta.key,
    };
  }

  const recent = cycle.contributions.slice(-3);
  const history = recent
    .map((c) => `[${aoaLabel(c.author.gardienId)}] ${c.content.slice(0, 600)}`)
    .join("\n\n");
  const lastLabel = last ? aoaLabel(last.author.gardienId) : "—";

  const gen = await generateForAog(
    meta.key,
    meta.name,
    cycle.subject,
    history,
    lastLabel
  );
  if (!gen.ok) {
    return {
      cycleId,
      subject: cycle.subject,
      action: "pending_api_error",
      aog: meta.key,
      reason: gen.reason,
      detail: gen.detail || null,
    };
  }

  const author = await prisma.user.findFirst({
    where: { gardienId: { in: meta.gardienIds } },
  });
  if (!author) {
    return {
      cycleId,
      action: "error",
      reason: "user_missing",
      aog: meta.key,
    };
  }

  const gardienInfo = {
    name: author.name,
    gardienId: author.gardienId,
    role: author.role,
  };
  const signature = buildSignatureMinimal(gardienInfo);
  const count = cycle.contributions.length;

  let order: string[] = [];
  try {
    order = JSON.parse(cycle.order || "[]");
  } catch {
    order = [];
  }
  const nextTurn = nextTurnAfterAuthor(order, author.gardienId, cycle.currentTurn);

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
    aog: meta.key,
    nextTurn,
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
      currentTurn: { in: ALL_TURN_IDS },
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
    pendingCount: pending.length,
    results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}