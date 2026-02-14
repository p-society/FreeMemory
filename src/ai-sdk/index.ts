import { generateText, embed, generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { sectorPrompt } from '../constants/index.js';
import { z } from 'zod';
import { graphGenerationPrompt } from '../constants';
import { openrouter } from '@openrouter/ai-sdk-provider';

export async function GenerateText(text: string, systemPrompt: string) {
    const response = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        prompt: text,
    });
    return response;
}

export async function GenerateSectorObject(text: string, systemPrompt: string) {
    const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: z.object({
            sector: z.object({
                name: z.string(),
                topics: z.array(z.string()),
            }),
        }),
        system: systemPrompt,
        prompt: text,
    });
    return object.sector;
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

export async function GenerateGraph(memory1: string, memory2: string): Promise<string> {
    const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: z.object({
            relations: z.string(),
        }),
        system: graphGenerationPrompt,
        prompt: `${memory1}\n\n${memory2}`,
    });
    return object.relations;
}
