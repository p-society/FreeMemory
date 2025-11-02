/**
 * Prompt template for generating stuffs from ai models.
 */
export const graphGenerationPrompt =
`You are an expert at creating knowledge graphs from unstructured text. we have given you two message of a user,identify the key 
entities and their relationships, and output them in a structured format suitable for constructing a knowledge graph.
When analyzing the text, focus on:
1. Identifying main entities (people, places, concepts, events).
2. Determining the relationships between these entities (e.g., "is a part of", "is related to", "causes", "influences").
3. Capturing attributes of entities that provide additional context (e.g., dates, descriptions, categories).
Output Format:
- give the output in JSON format only to represent the entities and their relationships.
- Relationships should clearly indicate the source entity, target entity, and the nature of the relationship.
`;

/**
 * List of predefined sectors for categorizing memories.
 */
export const sectorList = [
    'technology',
    'health',
    'finance',
    'education',
    'programming',
    'history',
    'sports',
    'travel',
    'food',
    'politics',
    'culture',
    'business',
    'lifestyle',
    'fashion',
    'music',
    'hobbies',
    'not-listed'
];

export const sectorPrompt =
`Analyze the following content and determine the most appropriate sector it belongs to ${sectorList.join(', ')}. 
Respond with just one of the sector names. if none of these sectors fit, respond with 'not-listed' but do not add any explanations
or any sector names outside the provided list. also includes the topics like a subset of sector as my schema design is 
  name: text('name').notNull(),
  topics: text('topics', { mode: 'json' }), 
  here name means the sector name and topics means the subset of sector.
output format:- it just be in a json format like {"name": "sector_name", "topics": ["topic1", "topic2"]}
`;
