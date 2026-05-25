import hono from "../../index";
import { db } from "../db/db";
import { memories, waypoints } from "../db/schema";
import { eq } from "drizzle-orm";
import { loadIndexFromDB } from "../hnsw/createHnswIndex";
import { graphIndex } from "./graphIndex";
import { uuidv7 } from "uuidv7";

async function runTests() {
    console.log("--- Starting CRUD Endpoints Integration Test ---");

    // 1. Initialize indices
    await loadIndexFromDB();
    await graphIndex.loadFromDB();

    const userId = uuidv7();
    const chatId = uuidv7();

    // 2. Test GET /api/health initially
    console.log("Testing GET /api/health (initial)...");
    const healthRes = await hono.request("/api/health");
    if (healthRes.status !== 200) {
        throw new Error(`Health check failed with status ${healthRes.status}`);
    }
    const healthData = await healthRes.json() as any;
    console.log("Initial health data:", healthData);
    if (!healthData.version || typeof healthData.indexCount !== "number" || !healthData.dbStats) {
        throw new Error("Invalid health check response schema");
    }

    // 3. Test POST /api/memory/add via API to seed a memory
    console.log("\nAdding a new memory via API...");
    const addRes = await hono.request("/api/memory/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            userId,
            chatId,
            userType: "user",
            content: "Svelte is a component framework that compiles templates to tiny, focus-driven JS."
        })
    });
    if (addRes.status !== 200) {
        throw new Error(`Failed to add memory: ${addRes.status}`);
    }
    const addData = await addRes.json() as any;
    const memoryId = addData.memoryId;
    console.log(`Added memory successfully, ID: ${memoryId}`);

    // Wait a bit to ensure async waypoint generator runs
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Test GET /api/memory/all
    console.log("\nTesting GET /api/memory/all...");
    const listRes = await hono.request(`/api/memory/all?userId=${userId}`);
    if (listRes.status !== 200) {
        throw new Error(`Failed to list memories: ${listRes.status}`);
    }
    const listData = await listRes.json() as any;
    console.log(`List results: found ${listData.total} memories.`);
    if (listData.total === 0 || !listData.memories.some((m: any) => m.id === memoryId)) {
        throw new Error("Created memory not found in list output");
    }

    // 5. Test GET /api/sectors
    console.log("\nTesting GET /api/sectors...");
    const sectorsRes = await hono.request("/api/sectors");
    if (sectorsRes.status !== 200) {
        throw new Error(`Failed to get sectors: ${sectorsRes.status}`);
    }
    const sectorsData = await sectorsRes.json() as any;
    console.log("Sectors data:", sectorsData);
    if (!sectorsData.sectors || sectorsData.sectors.length === 0) {
        throw new Error("Sectors list is empty after adding a memory");
    }

    // 6. Test GET /api/memory/get/:id
    console.log(`\nTesting GET /api/memory/get/${memoryId}...`);
    const getRes = await hono.request(`/api/memory/get/${memoryId}`);
    if (getRes.status !== 200) {
        throw new Error(`Failed to retrieve single memory: ${getRes.status}`);
    }
    const getData = await getRes.json() as any;
    console.log("Retrieved memory details:", getData.memory.content);

    // Create a dummy waypoint manually to test graph index removal
    const dummyTargetId = uuidv7();
    // Add dummy target memory to db to avoid constraint issues during query
    await db.insert(memories).values({
        id: dummyTargetId,
        content: "Dummy target",
        userId,
        chatId,
        userType: "user",
        initialStrength: 0.8
    });
    // Add waypoint to db and in-memory map
    const wpId = uuidv7();
    await db.insert(waypoints).values({
        id: wpId,
        sourceMemoryId: memoryId,
        targetMemoryId: dummyTargetId,
        relationshipType: "semantic",
        strength: 0.8
    });
    graphIndex.addEdge(chatId, memoryId, dummyTargetId, 0.8, "semantic");
    console.log(`Added test waypoint in-memory. Neighbors:`, graphIndex.getNeighbors(chatId, memoryId));

    // 7. Test DELETE /api/memory/:id (soft delete + graph sync)
    console.log(`\nTesting DELETE /api/memory/${memoryId}...`);
    const deleteRes = await hono.request(`/api/memory/${memoryId}`, {
        method: "DELETE"
    });
    if (deleteRes.status !== 200) {
        throw new Error(`Failed to delete memory: ${deleteRes.status}`);
    }
    const deleteData = await deleteRes.json() as any;
    console.log("Delete response:", deleteData);

    // Verify DB soft-delete state
    const [deletedMem] = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
    if (!deletedMem || !deletedMem.archived) {
        throw new Error("Memory archived flag not set to true in database");
    }

    // Verify in-memory graph synchronization
    const neighbors = graphIndex.getNeighbors(chatId, memoryId);
    console.log("Neighbors in-memory after delete:", neighbors);
    if (neighbors.length > 0) {
        throw new Error("Graph index was not cleared of deleted memory relationships");
    }

    // Verify it is no longer returned in default /api/memory/all
    const listResAfter = await hono.request(`/api/memory/all?userId=${userId}`);
    const listDataAfter = await listResAfter.json() as any;
    if (listDataAfter.memories.some((m: any) => m.id === memoryId)) {
        throw new Error("Soft-deleted memory was returned in list view");
    }

    // Verify it IS returned when archived=true is passed
    const listResArchived = await hono.request(`/api/memory/all?userId=${userId}&archived=true`);
    const listDataArchived = await listResArchived.json() as any;
    if (!listDataArchived.memories.some((m: any) => m.id === memoryId)) {
        throw new Error("Soft-deleted memory was NOT returned when query archived=true was set");
    }

    // 8. Test GET /api/health (final)
    console.log("\nTesting GET /api/health (final)...");
    const healthFinal = await hono.request("/api/health");
    const healthFinalData = await healthFinal.json() as any;
    console.log("Final health data:", healthFinalData);

    console.log("\n--- All CRUD Endpoints Tested Successfully! ---");
    process.exit(0);
}

runTests().catch((err) => {
    console.error("CRUD test execution failed:", err);
    process.exit(1);
});
