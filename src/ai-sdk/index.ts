import { generateText, embed } from 'ai';
import { google } from '@ai-sdk/google';


export async function GenerateText(text: string, systemPrompt: string) {
    const response = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        prompt: text,
    });
    return response;
}

type EmbeddingVector = number[] | Float32Array;

export async function GenerateEmbedding(text: string): Promise<number[]> {
    try {
        const embeddingResponse = await embed({
            model: google.textEmbedding('text-embedding-004'),
            value: text,
            providerOptions: {
                google: {
                    outputDimensionality: 768
                }
            }
        }) as { embedding?: EmbeddingVector; embeddings?: EmbeddingVector[] };

        const vector: EmbeddingVector | undefined = embeddingResponse.embedding ?? embeddingResponse.embeddings?.[0];

        if (!vector) {
            throw new Error('Embedding provider returned an empty vector response.');
        }
        console.log(Array.from(vector));
        return Array.from(vector);
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }

}

// export async function generateSector(content: string): Promise<string> {
//     const prompt = `Analyze the following content and determine the most appropriate sector it belongs to (e.g., technology, health, finance, education, entertainment, etc.). Respond with just the sector name.
// `;
//     const response = await generateText({
//         model: google('gemini-2.5-flash'),
//         system: prompt,
//         prompt: content,
//     });
//     return response.text.trim();
// }