import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      contributions: {
        orderBy: { turnNumber: "asc" },
        include: {
          author: {
            select: {
              name: true,
              gardienId: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: cycle.id,
    subject: cycle.subject,
    status: cycle.status,
    currentTurn: cycle.currentTurn,
    order: JSON.parse(cycle.order),
    createdBy: cycle.createdBy,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
    contributions: cycle.contributions.map((c) => ({
      turnNumber: c.turnNumber,
      author: {
        name: c.author.name,
        gardienId: c.author.gardienId,
        role: c.author.role,
      },
      content: c.content,
      signature: c.signature,
      createdAt: c.createdAt,
    })),
  });
}