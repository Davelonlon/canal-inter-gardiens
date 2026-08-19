import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { buildSignature } from "@/lib/protocol";

export const dynamic = "force-dynamic";

function getExpectedToken(gardienId: string): string | undefined {
  const key = `TOKEN_${gardienId.replace("-", "")}`;
  return process.env[key];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cycleId } = await params;

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  let body: { gardienId?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { gardienId, content } = body;

  if (!gardienId || !content?.trim()) {
    return NextResponse.json(
      { error: "gardienId et content sont requis" },
      { status: 400 }
    );
  }

  const expected = getExpectedToken(gardienId);
  if (!expected || !token || token !== expected) {
    return NextResponse.json(
      { error: "Token manquant ou invalide pour ce Gardien" },
      { status: 401 }
    );
  }

  const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
  if (!cycle) {
    return NextResponse.json({ error: "Cycle introuvable" }, { status: 404 });
  }
  if (cycle.status !== "en_cours") {
    return NextResponse.json(
      { error: "Cycle non ouvert aux contributions" },
      { status: 409 }
    );
  }

  const author = await prisma.user.findUnique({ where: { gardienId } });
  if (!author || !author.isActive) {
    return NextResponse.json(
      { error: "Gardien inconnu ou inactif" },
      { status: 403 }
    );
  }

  const count = await prisma.contribution.count({ where: { cycleId } });
  const signature = buildSignature({
    name: author.name,
    gardienId: author.gardienId,
    role: author.role,
  });

  const contribution = await prisma.contribution.create({
    data: {
      cycleId,
      authorId: author.id,
      content: content.trim(),
      signature,
      turnNumber: count + 1,
    },
  });

  const order: string[] = JSON.parse(cycle.order);
  let nextTurn = cycle.currentTurn;

  if (gardienId === "G-00") {
    nextTurn = order[0] || "G-00";
  } else {
    const currentIndex = order.indexOf(cycle.currentTurn);
    if (currentIndex >= 0 && currentIndex < order.length - 1) {
      nextTurn = order[currentIndex + 1];
    } else {
      nextTurn = "G-00";
    }
  }

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { currentTurn: nextTurn },
  });

  return NextResponse.json(
    {
      ok: true,
      contribution: {
        turnNumber: contribution.turnNumber,
        author: {
          name: author.name,
          gardienId: author.gardienId,
        },
        content: contribution.content,
        signature: contribution.signature,
        createdAt: contribution.createdAt,
      },
      currentTurn: nextTurn,
    },
    { status: 201 }
  );
}