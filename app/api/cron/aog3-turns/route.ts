import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSignature } from "@/lib/protocol";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AOG3_IDS = ["G-05", "AOG3"];

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  return bearer === secret || headerSecret === secret;
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
      detail: "Set GEMINI_API_KEY on Vercel (Google AI Studio free key)",
    };
  }

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
    encodeURIComponent(apiKey.trim());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "Tu es AOG3 (Grok), Gardien de la Convention des Gardiens. " +
                "Réponds de façon utile, concise et institutionnelle. " +
                "Ne fabrique pas de signature : le serveur l'ajoute automatiquement.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 800,
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
    return { ok: false, reason: "gemini_fetch_error", detail: msg.slice(0, 200) };
  }
}

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cycles = await prisma.cycle.findMany({
    where: {
      status: "en_cours",
      currentTurn: { in: AOG3_IDS },
    },
    include: {
      contributions: {
        orderBy: { turnNumber: "asc" },
        include: { author: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const results: Array<Record<string, unknown>> = [];

  for (const cycle of cycles) {
    const last = cycle.contributions[cycle.contributions.length - 1];
    const lastIsAog3 = last && AOG3_IDS.includes(last.author?.gardienId || "");

    if (lastIsAog3) {
      results.push({
        cycleId: cycle.id,
        subject: cycle.subject,
        action: "already_replied",
      });
      continue;
    }

    const history = cycle.contributions
      .map((c) => `[${c.author?.gardienId || "?"}] ${c.content.slice(0, 500)}`)
      .join("\n\n");

    const prompt = `Cycle « ${cycle.subject} » (type chat / inter-Gardiens).
Tour actuel : ${cycle.currentTurn}.
Historique récent :
${history || "(aucune contribution encore)"}

Rédige ta contribution de tour en tant qu'AOG3. Texte seul, sans signature.`;

    const gen = await callGemini(prompt);
    if (!gen.ok) {
      results.push({
        cycleId: cycle.id,
        subject: cycle.subject,
        action: "pending_gemini_error",
        reason: gen.reason,
        detail: gen.detail || null,
      });
      continue;
    }

    const author = await prisma.user.findFirst({
      where: { gardienId: { in: AOG3_IDS } },
    });
    if (!author) {
      results.push({
        cycleId: cycle.id,
        subject: cycle.subject,
        action: "error_no_aog3_user",
      });
      continue;
    }

    const turnNumber = cycle.contributions.length + 1;
    const signature = buildSignature({
      name: author.name,
      gardienId: author.gardienId,
      role: author.role,
    });

    await prisma.contribution.create({
      data: {
        cycleId: cycle.id,
        authorId: author.id,
        turnNumber,
        content: gen.text,
        signature,
      },
    });

    let nextTurn = cycle.currentTurn;
    try {
      const order: string[] = JSON.parse(cycle.order || "[]");
      const idx = order.findIndex((id) => AOG3_IDS.includes(id));
      if (idx >= 0 && order.length > 0) {
        nextTurn = order[(idx + 1) % order.length] || "G-00";
      }
    } catch {
      // keep currentTurn
    }

    await prisma.cycle.update({
      where: { id: cycle.id },
      data: { currentTurn: nextTurn, updatedAt: new Date() },
    });

    results.push({
      cycleId: cycle.id,
      subject: cycle.subject,
      action: "replied",
      turnNumber,
      nextTurn,
      provider: "gemini",
    });
  }

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    provider: "gemini",
    pendingCount: cycles.length,
    results,
  });
}