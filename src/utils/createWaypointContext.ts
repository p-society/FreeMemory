import { RetrieveMemories } from "./retrieve";

/**
 * Retrieves memories with graph expansion and formats them into a structured
 * context block suitable for prompt injection into an LLM.
 */
export async function createWaypointContext(
    userId: string,
    chatId: string,
    content: string
): Promise<string> {
    const results = await RetrieveMemories({ query: content, userId, chatId, k: 5 });
    if (results.length === 0) {
        return "";
    }

    let context = "RELEVANT MEMORIES (Graph-RAG Context):\n";
    for (const r of results) {
        context += `* [Memory ${r.id}] "${r.content}" (Strength: ${r.strength.toFixed(2)}, Similarity: ${r.similarity.toFixed(2)})\n`;
        if (r.relationships.length > 0) {
            context += "  Connections:\n";
            for (const rel of r.relationships) {
                context += `    - Related to [Memory ${rel.targetId}] via ${rel.relationshipType} (edge strength: ${rel.strength.toFixed(2)})\n`;
            }
        }
    }
    return context;
}