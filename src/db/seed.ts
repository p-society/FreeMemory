import { db } from './db';
import { memories, sectors, waypoints, systemConfig, RELATIONSHIP_TYPES, ACCESS_TYPES, VALUE_TYPES } from './schema';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';

async function seedDatabase() {
  console.log('Seeding database...');

  try {
    await db.delete(memories);
    await db.delete(waypoints);
    await db.delete(sectors);
    await db.delete(systemConfig);

    await db.insert(systemConfig).values([
      { key: 'default_decay_rate', value: '0.95', valueType: 'number' },
      { key: 'min_strength_threshold', value: '0.1', valueType: 'number' },
      { key: 'auto_reinforce_on_access', value: 'true', valueType: 'boolean' },
      { key: 'reinforcement_strength', value: '0.15', valueType: 'number' },
      { key: 'max_memories_per_sector', value: '5000', valueType: 'number' },
      { key: 'auto_split_sectors', value: 'true', valueType: 'boolean' },
      { key: 'vector_dimension', value: '1536', valueType: 'number' },
    ]);

    const rootSectors = await db.insert(sectors).values([
      {
        id: 'work',
        name: 'Work',
        decayMultiplier: 0.95,
        memoryCount: 0,
        topics: ['projects', 'meetings', 'documentation'],
        metadata: { type: 'root', color: 'blue' }
      },
      {
        id: 'personal',
        name: 'Personal',
        decayMultiplier: 0.97,
        memoryCount: 0,
        topics: ['health', 'finance', 'hobbies'],
        metadata: { type: 'root', color: 'green' }
      },
      {
        id: 'learning',
        name: 'Learning',
        decayMultiplier: 0.90,
        memoryCount: 0,
        topics: ['programming', 'ai', 'mathematics'],
        metadata: { type: 'root', color: 'purple' }
      }
    ]).returning();

    await db.insert(sectors).values([
      {
        id: 'programming',
        name: 'Programming',
        parentId: 'learning',
        decayMultiplier: 0.90,
        memoryCount: 0,
        topics: ['python', 'javascript', 'typescript', 'rust'],
        metadata: { type: 'subcategory', color: 'purple' }
      },
      {
        id: 'ai-ml',
        name: 'AI/ML',
        parentId: 'learning',
        decayMultiplier: 0.88,
        memoryCount: 0,
        topics: ['machine learning', 'neural networks', 'llms', 'rag'],
        metadata: { type: 'subcategory', color: 'purple' }
      },
      {
        id: 'project-alpha',
        name: 'Project Alpha',
        parentId: 'work',
        decayMultiplier: 0.92,
        memoryCount: 0,
        topics: ['development', 'api', 'database'],
        metadata: { type: 'project', status: 'active' }
      }
    ]);

    const sampleMemories = await db.insert(memories).values([
      {
        id: uuidv4(),
        content: 'Python decorators are powerful for metaprogramming and allow you to modify function behavior dynamically.',
        strength: 0.8,
        decayRate: 0.95,
        initialStrength: 0.8,
        accessCount: 0,
        reinforcementCount: 0,
        sectorId: 'programming',
        metadata: { type: 'concept', difficulty: 'intermediate' }
      },
      {
        id: uuidv4(),
        content: 'Multiple inheritance in Python can lead to the diamond problem, where a class inherits from two classes that both inherit from the same base class.',
        strength: 0.75,
        decayRate: 0.95,
        initialStrength: 0.75,
        accessCount: 0,
        reinforcementCount: 0,
        sectorId: 'programming',
        metadata: { type: 'problem', difficulty: 'advanced' }
      },
      {
        id: uuidv4(),
        content: 'Python uses C3 linearization (Method Resolution Order) to resolve method conflicts in multiple inheritance scenarios.',
        strength: 0.7,
        decayRate: 0.95,
        initialStrength: 0.7,
        accessCount: 0,
        reinforcementCount: 0,
        sectorId: 'programming',
        metadata: { type: 'solution', difficulty: 'advanced' }
      },
      {
        id: uuidv4(),
        content: 'RAG (Retrieval-Augmented Generation) combines vector search with language models to provide more accurate and context-aware responses.',
        strength: 0.85,
        decayRate: 0.88,
        initialStrength: 0.85,
        accessCount: 0,
        reinforcementCount: 0,
        sectorId: 'ai-ml',
        metadata: { type: 'concept', difficulty: 'intermediate' }
      },
      {
        id: uuidv4(),
        content: 'Memory decay algorithms simulate human forgetting patterns, strengthening frequently accessed memories while weakening unused ones.',
        strength: 0.9,
        decayRate: 0.88,
        initialStrength: 0.9,
        accessCount: 0,
        reinforcementCount: 0,
        sectorId: 'ai-ml',
        metadata: { type: 'concept', difficulty: 'advanced' }
      }
    ]).returning();

    if (sampleMemories.length >= 5) {
      const mem0 = sampleMemories[0];
      const mem1 = sampleMemories[1];
      const mem2 = sampleMemories[2];
      const mem3 = sampleMemories[3];
      const mem4 = sampleMemories[4];
      
      if (mem0 && mem1 && mem2 && mem3 && mem4) {
        await db.insert(waypoints).values([
          {
            id: uuidv4(),
            sourceMemoryId: mem0.id,
            targetMemoryId: mem1.id,
            relationshipType: RELATIONSHIP_TYPES.ELABORATION,
            strength: 0.8,
            metadata: { context: 'decorators are often used in inheritance patterns' }
          },
          {
            id: uuidv4(),
            sourceMemoryId: mem1.id,
            targetMemoryId: mem2.id,
            relationshipType: RELATIONSHIP_TYPES.CAUSAL,
            strength: 0.9,
            metadata: { context: 'solution to the diamond problem' }
          },
          {
            id: uuidv4(),
            sourceMemoryId: mem3.id,
            targetMemoryId: mem4.id,
            relationshipType: RELATIONSHIP_TYPES.SEMANTIC,
            strength: 0.7,
            metadata: { context: 'both relate to memory systems' }
          }
        ]);
      }
    }

    for (const sector of rootSectors) {
      const memoryCount = await db.select({ count: sql`count(*)` })
        .from(memories)
        .where(sql`sector_id LIKE ${sector.id + '%'}`);
      
      const count = memoryCount[0]?.count || 0;
      await db.update(sectors)
        .set({ memoryCount: count as number })
        .where(sql`id = ${sector.id}`);
    }

    console.log('Database seeded successfully!');
    console.log(`Created ${rootSectors.length} root sectors`);
    console.log(`Created ${sampleMemories.length} sample memories`);
    console.log(`Created relationships between memories`);

  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  seedDatabase();
}

export { seedDatabase };