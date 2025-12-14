/**
 * Prompt template for generating stuffs from ai models.
 */
export const graphGenerationPrompt =
`You are an expert at creating knowledge graphs from unstructured text. we have given you two message of a user, you should always give a 
single relation as we have passed only two user messages. output format:- it just be in a json format like {"relation": "relation_name"}
and we have also given the timestamp so if there timestamp is close then it is more likely to be related and if it is far then it is less likely to be related.
but in 90% it might be use your own logic to determine the relation. 
AND if two messages are seemed not to be related then output should be {"relation": "null"}, 
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
