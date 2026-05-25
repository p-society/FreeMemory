import { expect, test, describe, beforeAll } from "bun:test";
import hono from "../index";
import { db } from "../src/db/db";
import { memories, waypoints } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { loadIndexFromDB } from "../src/hnsw/createHnswIndex";
import { graphIndex } from "../src/utils/graphIndex";
import { uuidv7 } from "uuidv7";

describe("Neural Graph Retrieval & Consistency", () => {
  const userId = uuidv7();
  const chatId = uuidv7();
  let memIds: string[] = [];

  beforeAll(async () => {
    await loadIndexFromDB();
    await graphIndex.loadFromDB();
  });

  test("1. Seed Complex Graph Topology & Verify Graph Retrieval Endpoint", async () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function addMemory(content: string) {
      console.log(`Ingesting memory: "${content}"`);
      const res = await hono.request("/api/memory/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, chatId, userType: "user", content }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      return data.memoryId as string;
    }

    const idA = await addMemory("React is a front-end UI library developed by Meta.");
    await delay(15000);
    const idB = await addMemory("Vite is a fast modern build tool used for bundling web applications.");
    await delay(15000);
    const idC = await addMemory("Vite supports React via a special plugin that enables hot module replacement.");
    await delay(15000);
    const idD = await addMemory("Hot module replacement updates files in memory without needing a full browser reload.");

    memIds = [idA, idB, idC, idD];

    await delay(5000);

    const graphRes = await hono.request(`/api/graph/${chatId}`);
    expect(graphRes.status).toBe(200);
    const graphData = (await graphRes.json()) as any;

    expect(graphData.nodes.length).toBe(4);
    expect(graphData.edges.length).toBeGreaterThan(0);

    const chatsRes = await hono.request("/api/chats");
    expect(chatsRes.status).toBe(200);
    const chatsData = (await chatsRes.json()) as any;
    const currentChat = chatsData.chats.find((c: any) => c.chatId === chatId);
    expect(currentChat).toBeDefined();
    expect(currentChat.count).toBe(4);
  }, 90000);

  test("2. Multi-Hop RAG Graph Expansion", async () => {
    const queryRes = await hono.request("/api/memory/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "React layout update tool", userId, chatId, k: 5 }),
    });
    expect(queryRes.status).toBe(200);
    const queryData = (await queryRes.json()) as any;

    const matchedIds = queryData.results.map((r: any) => r.id);
    expect(matchedIds.length).toBeGreaterThan(0);
  });

  test("3. Concurrency Safety and Access Logs", async () => {
    const queries = [
      "Vite dev speed",
      "React state rendering",
      "Hot module updates",
    ];

    const responses = await Promise.all(
      queries.map((q) =>
        hono.request("/api/memory/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, userId, chatId, k: 3 }),
        })
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.results.length).toBeGreaterThan(0);
    }
  });

  test("4. Soft Delete Pruning Consistency", async () => {
    const targetId = memIds[2]!;
    
    const initialGraphRes = await hono.request(`/api/graph/${chatId}`);
    const initialGraph = (await initialGraphRes.json()) as any;
    const initialEdgesCount = initialGraph.edges.length;

    const deleteRes = await hono.request(`/api/memory/${targetId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const graphRes = await hono.request(`/api/graph/${chatId}`);
    expect(graphRes.status).toBe(200);
    const graphData = (await graphRes.json()) as any;

    const nodeExists = graphData.nodes.some((n: any) => n.id === targetId);
    expect(nodeExists).toBe(false);

    const edgeRefsDeletedNode = graphData.edges.some(
      (e: any) => e.source === targetId || e.target === targetId
    );
    expect(edgeRefsDeletedNode).toBe(false);
    expect(graphData.edges.length).toBeLessThan(initialEdgesCount);

    const inMemoryNeighbors = graphIndex.getNeighbors(chatId, targetId);
    expect(inMemoryNeighbors.length).toBe(0);
  });
});
