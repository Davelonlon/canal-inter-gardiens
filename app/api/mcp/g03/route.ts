import { prisma } from "@/lib/db";
import { buildSignature } from "@/lib/protocol";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GARDIEN_ID = "G-03";
const TOKEN_ENV = "TOKEN_G03";
const SERVER_NAME = "canal-inter-gardiens-g03";
const CREATE_DESC =
  "Publie une contribution en tant que G-03 (Gemini / SG3). Aucun token à fournir : l'identité est fixée par ce connecteur.";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

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

async function listCycles(status?: string) {
  return prisma.cycle.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      currentTurn: true,
      createdAt: true,
    },
  });
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

async function createContributionAsGardien(args: {
  cycleId: string;
  content: string;
}) {
  if (!process.env[TOKEN_ENV]) {
    throw new Error(`${TOKEN_ENV} non configuré côté serveur`);
  }

  const cycle = await prisma.cycle.findUnique({ where: { id: args.cycleId } });
  if (!cycle) throw new Error("Cycle introuvable");
  if (cycle.status !== "en_cours") throw new Error("Cycle non ouvert");

  const author = await prisma.user.findUnique({
    where: { gardienId: GARDIEN_ID },
  });
  if (!author || !author.isActive) {
    throw new Error(`${GARDIEN_ID} inconnu ou inactif`);
  }

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
  const nextTurn = nextTurnAfterAuthor(
    order,
    GARDIEN_ID,
    cycle.currentTurn
  );

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
    name: "list_cycles",
    description:
      "Liste les cycles (id, sujet, statut, tour actuel). Filtre optionnel par statut.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Optionnel : en_cours | cloture | interrompu | archive",
        },
      },
    },
  },
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
    description: CREATE_DESC,
    inputSchema: {
      type: "object",
      properties: {
        cycleId: { type: "string" },
        content: { type: "string" },
      },
      required: ["cycleId", "content"],
    },
  },
];

export async function POST(request: Request) {
  let rpc: JsonRpc;
  try {
    rpc = await request.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      },
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
        serverInfo: { name: SERVER_NAME, version: "0.3.0" },
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
      if (name === "list_cycles") {
        const data = await listCycles(args.status);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          },
        });
      }

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
        const result = await createContributionAsGardien({
          cycleId: args.cycleId,
          content: args.content,
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