import { generateText, embed, generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { deepseek } from '@ai-sdk/deepseek';
import { z } from 'zod';
import { sectorPrompt, graphGenerationPrompt } from '../constants/index.js';

type EmbeddingVector = number[] | Float32Array;

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 2500): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        const isRateLimit = error.status === 429 || 
                            error.statusCode === 429 || 
                            error.message?.includes('429') || 
                            error.name?.includes('APICallError') ||
                            error.name?.includes('RateLimitError');
        if (retries > 0 && isRateLimit) {
            console.warn(`[AI SDK] Rate limited. Retrying in ${delayMs}ms... (${retries} retries left)`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return withRetry(fn, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

export async function GenerateText(text: string, systemPrompt: string) {
    return withRetry(() => generateText({
        model: deepseek('deepseek-v4-flash'),
        system: systemPrompt,
        prompt: text,
    }));
}

export async function GenerateSectorObject(text: string, systemPrompt: string) {
    const { object } = await withRetry(() => generateObject({
        model: deepseek('deepseek-v4-flash'),
        schema: z.object({
            name: z.string(),
            topics: z.array(z.string()),
        }),
        system: systemPrompt,
        prompt: text,
    }));
    return object;
}

export async function GenerateEmbedding(text: string): Promise<number[]> {
    try {
        const embeddingResponse = await withRetry(() => embed({
            model: google.textEmbedding('gemini-embedding-001'),
            value: text,
            providerOptions: {
                google: {
                    outputDimensionality: 768
                }
            }
        })) as { embedding?: EmbeddingVector; embeddings?: EmbeddingVector[] };

        const vector: EmbeddingVector | undefined = embeddingResponse.embedding ?? embeddingResponse.embeddings?.[0];

        if (!vector) {
            throw new Error('Embedding provider returned an empty vector response.');
        }
        return Array.from(vector);
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

export async function GenerateGraph(memory1: string, memory2: string): Promise<string> {
    const { object } = await withRetry(() => generateObject({
        model: deepseek('deepseek-v4-flash'),
        schema: z.object({
            relation: z.string(),
        }),
        system: graphGenerationPrompt,
        prompt: `${memory1}\n\n${memory2}`,
    }));
    return object.relation;
}
