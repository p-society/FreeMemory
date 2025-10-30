import { HierarchicalNSW } from 'hnswlib-node';
import { GenerateEmbedding } from '../ai-sdk/index';
import { db } from '../db/db'
import { memories } from '../db/schema';
import { uuidv7 } from "uuidv7";

const VECTOR_DIMENSION = 768;
const INITIAL_CAPACITY = 10_000;

const hnswIndex = new HierarchicalNSW('cosine', VECTOR_DIMENSION);

let indexInitialized = false;
let nextLabel = 0;

type MemoryMetadata = {
    userId: string;
    chatId: string;
};

const metadataByLabel = new Map<number, MemoryMetadata>();

function ensureIndexInitialized() {
    if (!indexInitialized) {
        hnswIndex.initIndex(INITIAL_CAPACITY);
        indexInitialized = true;
        return;
    }

    const currentCount = hnswIndex.getCurrentCount();
    const maxElements = hnswIndex.getMaxElements();

    if (currentCount >= maxElements) {
        hnswIndex.resizeIndex(maxElements + INITIAL_CAPACITY);
    }
}

export async function addMemory(content: string, userId: string, chatId: string, userType: string) {
    ensureIndexInitialized();

    try {
        const embeddingVector = await GenerateEmbedding(content);
        const label = nextLabel++;
        hnswIndex.addPoint(embeddingVector, label);

        metadataByLabel.set(label, { userId, chatId });

        await db.insert(memories).values({
            id: uuidv7(),
            content,
            userId,
            chatId,
            userType,
            embeddingId: label,
            strength: 0.75,
            decayRate: 0.95,
            initialStrength: 0.75,
            accessCount: 0,
            reinforcementCount: 0,
            sectorId: 'programming',
            metadata: { type: 'problem', difficulty: 'advanced' }
        })

        return label;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

export function getMemoryMetadata(label: number) {
    return metadataByLabel.get(label);
}