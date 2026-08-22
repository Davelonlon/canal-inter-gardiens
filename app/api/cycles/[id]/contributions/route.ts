import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { buildSignature } from "@/lib/protocol";

export const dynamic = "force-dynamic";

function getExpectedToken(gardienId: string): string | undefined {
  const key = `TOKEN_${gardienId.replace("-", "")}`;
  return process.env[key];
}

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
  const nextTurn = nextTurnAfterAuthor(order, gardienId, cycle.currentTurn);

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