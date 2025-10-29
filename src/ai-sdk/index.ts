import { generateText , embed } from 'ai';
import { google } from '@ai-sdk/google';

const systemPrompt = 
`You are an expert at creating knowledge graphs from unstructured text. we have given you two message of a user,identify the key 
entities and their relationships, and output them in a structured format suitable for constructing a knowledge graph.
When analyzing the text, focus on:
1. Identifying main entities (people, places, concepts, events).
2. Determining the relationships between these entities (e.g., "is a part of", "is related to", "causes", "influences").
3. Capturing attributes of entities that provide additional context (e.g., dates, descriptions, categories).
Output Format:
- Use JSON format to represent the entities and their relationships.
- Each entity should have a unique identifier, a type, and relevant attributes.
- Relationships should clearly indicate the source entity, target entity, and the nature of the relationship.
`;

export async function GenerateGraphRelation(text:string) {
    const response = await generateText({
        model: google('gemini-1.5-flash'),
        system: systemPrompt,
        prompt: text,
    });
    return response;
}

export async function GenerateEmbedding(text:string) {
    const embeddingResponse = await embed({
        model: google.textEmbedding('text-embedding-004'),
        value: text,
        providerOptions: {
            google: {
                outputDimensionality : 768
            }
        }
    });
    return embeddingResponse;
}