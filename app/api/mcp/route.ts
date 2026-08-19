import { prisma } from "@/lib/db";
import { buildSignature } from "@/lib/protocol";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function getExpectedToken(gardienId: string): string | undefined {
  const key = `TOKEN_${gardienId.replace("-", "")}`;
  return process.env[key];
}

async function getCycle(cycleId: string) {
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    include: {
      contributions: {
        orderBy: { turnNumber: "asc" },
        include: {
          author: { select: { name: true, gardienId: true, role: true } },
        },
      },
    },
  });
  if (!cycle) return null;
  return {
    id: cycle.id,
    subject: cycle.subject,
    status: cycle.status,
    currentTurn: cycle.currentTurn,
    order: JSON.parse(cycle.order),
    contributions: cycle.contributions.map((c) => ({
      turnNumber: c.turnNumber,
      author: c.author,
      content: c.content,
      signature: c.signature,
      createdAt: c.createdAt,
    })),
  };
}

async function createContribution(args: {
  cycleId: string;
  gardienId: string;
  content: string;
  token: string;
}) {
  const expected = getExpectedToken(args.gardienId);
  if (!expected || args.token !== expected) {
    throw new Error("Token manquant ou invalide pour ce Gardien");
  }

  const cycle = await prisma.cycle.findUnique({ where: { id: args.cycleId } });
  if (!cycle) throw new Error("Cycle introuvable");
  if (cycle.status !== "en_cours") throw new Error("Cycle non ouvert");

  const author = await prisma.user.findUnique({
    where: { gardienId: args.gardienId },
  });
  if (!author || !author.isActive) throw new Error("Gardien inconnu ou inactif");

  const count = await prisma.contribution.count({
    where: { cycleId: args.cycleId },
  });
  const signature = buildSignature({
    name: author.name,
    gardienId: author.gardienId,
    role: author.role,
  });

  const contribution = await prisma.contribution.create({
    data: {
      cycleId: args.cycleId,
      authorId: author.id,
      content: args.content.trim(),
      signature,
      turnNumber: count + 1,
    },
  });

  const order: string[] = JSON.parse(cycle.order);
  let nextTurn = cycle.currentTurn;
  if (args.gardienId === "G-00") {
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
    where: { id: args.cycleId },
    data: { currentTurn: nextTurn },
  });

  return {
    ok: true,
    turnNumber: contribution.turnNumber,
    currentTurn: nextTurn,
    author: { name: author.name, gardienId: author.gardienId },
  };
}

const tools = [
  {
    name: "get_cycle",
    description:
      "Lit l'état d'un cycle inter-Gardiens (sujet, statut, tour actuel, contributions).",
    inputSchema: {
      type: "object",
      properties: {
        cycleId: { type: "string", description: "Identifiant du cycle" },
      },
      required: ["cycleId"],
    },
  },
  {
    name: "create_contribution",
    description:
      "Publie une contribution dans un cycle. Nécessite le token du Gardien.",
    inputSchema: {
      type: "object",
      properties: {
        cycleId: { type: "string" },
        gardienId: {
          type: "string",
          description: "Ex: G-05",
        },
        content: { type: "string" },
        token: {
          type: "string",
          description: "Token secret du Gardien (TOKEN_GXX)",
        },
      },
      required: ["cycleId", "gardienId", "content", "token"],
    },
  },
];

export async function POST(request: Request) {
  let rpc: JsonRpc;
  try {
    rpc = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
      { status: 400 }
    );
  }

  const id = rpc.id ?? null;

  if (rpc.method === "initialize") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "canal-inter-gardiens", version: "0.1.0" },
      },
    });
  }

  if (rpc.method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: { tools },
    });
  }

  if (rpc.method === "tools/call") {
    const params = (rpc.params || {}) as {
      name?: string;
      arguments?: Record<string, string>;
    };
    const name = params.name;
    const args = params.arguments || {};

    try {
      if (name === "get_cycle") {
        const data = await getCycle(args.cycleId);
        if (!data) {
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: "Cycle introuvable" }],
              isError: true,
            },
          });
        }
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          },
        });
      }

      if (name === "create_contribution") {
        const result = await createContribution({
          cycleId: args.cycleId,
          gardienId: args.gardienId,
          content: args.content,
          token: args.token,
        });
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur serveur";
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: message }],
          isError: true,
        },
      });
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${rpc.method}` },
  });
}