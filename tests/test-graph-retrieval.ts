import hono from "../index";
import { db } from "../src/db/db";
import { memories, waypoints } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { loadIndexFromDB } from "../src/hnsw/createHnswIndex";
import { graphIndex } from "../src/utils/graphIndex";
import { uuidv7 } from "uuidv7";

async function runTest() {
    console.log("--- Starting Graph Memory API Integration Test ---");

    // 1. Initialize Indices
    await loadIndexFromDB();
    await graphIndex.loadFromDB();

    const userId = uuidv7();
    const chatId = uuidv7();
    console.log(`Test session: userId=${userId}, chatId=${chatId}`);

    // Helper to call memory add endpoint
    async function addMemoryApi(content: string) {
        console.log(`API -> Add Memory: "${content}"`);
        const res = await hono.request("/api/memory/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, chatId, userType: "user", content })
        });
        if (res.status !== 200) {
            throw new Error(`Add memory failed with status ${res.status}`);
        }
        const data = await res.json() as any;
        return data.memoryId as string;
    }

    // 2. Ingest 3 Semantically Related Memories via API
    const mem1Id = await addMemoryApi("Bun is a fast all-in-one JavaScript runtime, packager, test runner, and package manager.");
    const mem2Id = await addMemoryApi("JavaScript runtimes run JS code outside the browser. Bun and Node.js are popular examples.");
    const mem3Id = await addMemoryApi("Node.js is the traditional JavaScript runtime built on Chrome's V8 engine, while Bun uses WebKit's JSC engine.");

    // Wait for async waypoint generation to complete
    console.log("Waiting 2 seconds for background waypoint creation...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Verify in-memory graph contains the edges via GET /api/memory/get/:id
    console.log("\nVerifying waypoints for Memory 1...");
    const getRes1 = await hono.request(`/api/memory/get/${mem1Id}`);
    if (getRes1.status !== 200) {
        throw new Error(`Get memory 1 failed: ${getRes1.status}`);
    }
    const getData1 = await getRes1.json() as any;
    console.log("Memory 1 details:", getData1.memory.content);
    console.log("Memory 1 waypoints:", getData1.waypoints);
    if (getData1.waypoints.length === 0) {
        throw new Error("No waypoints created for Memory 1");
    }

    // 4. Query memories via POST /api/memory/query
    console.log("\n--- API -> Querying 'Bun runtime speed' ---");
    const queryRes = await hono.request("/api/memory/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Bun runtime speed", userId, chatId, k: 5 })
    });
    if (queryRes.status !== 200) {
        throw new Error(`Query failed with status ${queryRes.status}`);
    }
    const queryData = await queryRes.json() as any;

    console.log("Retrieval Results:");
    for (const r of queryData.results) {
        console.log(`- [Score: ${r.score.toFixed(4)}] ID: ${r.id} | Content: "${r.content}"`);
        console.log(`  Relationships:`, r.relationships);
    }

    if (queryData.results.length === 0) {
        throw new Error("Query returned zero results");
    }

    // Verify reinforcement worked (access count should be > 0 and strength updated)
    const getRes1After = await hono.request(`/api/memory/get/${mem1Id}`);
    const getData1After = await getRes1After.json() as any;
    console.log(`\nMemory 1 after query: accessCount=${getData1After.memory.accessCount}, strength=${getData1After.memory.strength}`);
    if ((getData1After.memory.accessCount || 0) === 0) {
        throw new Error("Access count was not reinforced during retrieval");
    }

    // 5. Test pruning
    console.log("\nTesting waypoint pruning...");
    const weakWpId = uuidv7();
    await db.insert(waypoints).values({
        id: weakWpId,
        sourceMemoryId: mem1Id,
        targetMemoryId: mem3Id,
        relationshipType: "semantic",
        strength: 0.02
    });
    graphIndex.addEdge(chatId, mem1Id, mem3Id, 0.02, "semantic");

    const edgesBefore = graphIndex.getNeighbors(chatId, mem1Id).length;
    console.log(`Edges before pruning: ${edgesBefore}`);

    const prunedCount = await graphIndex.pruneWaypoints();
    console.log(`Pruned ${prunedCount} waypoints.`);

    const edgesAfter = graphIndex.getNeighbors(chatId, mem1Id).length;
    console.log(`Edges after pruning: ${edgesAfter}`);
    if (edgesAfter >= edgesBefore) {
        throw new Error("Weak waypoints were not pruned");
    }

    console.log("\n--- Test Completed Successfully! ---");
    process.exit(0);
}

runTest().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
