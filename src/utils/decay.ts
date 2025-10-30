import { MEMORY_TYPES, DECAY_TIERS } from '../db/schema';
import type { Memory, MemoryType, DecayTier } from '../db/schema';

export type { MemoryType, DecayTier };

const MEMORY_TYPE_DECAY_RATES: Record<MemoryType, number> = {
  [MEMORY_TYPES.EPISODIC]: DECAY_TIERS.REGULAR.rate,
  [MEMORY_TYPES.SEMANTIC]: DECAY_TIERS.CRITICAL.rate,
  [MEMORY_TYPES.PROCEDURAL]: DECAY_TIERS.CRITICAL.rate,
  [MEMORY_TYPES.EMOTIONAL]: DECAY_TIERS.IMPORTANT.rate,
  [MEMORY_TYPES.REFLECTIVE]: DECAY_TIERS.EPHEMERAL.rate,
};

export class HMDDecay {

  static calculateCurrentStrength(memory: Memory): number {
    const now = new Date();
    const lastAccessed = memory.lastAccessed || new Date();
    const elapsedHours = this.getHoursSince(lastAccessed, now);
    const baseDecay = Math.pow(memory.decayRate, elapsedHours);
    const accessMultiplier = 1 + (0.3 * Math.log(1 + (memory.accessCount || 0)));
    const reinforcementBoost = 1 + (0.2 * (memory.reinforcementCount || 0));
    
    const currentStrength = (
      memory.initialStrength *
      baseDecay *
      accessMultiplier *
      reinforcementBoost
    );
    
    return Math.min(1.0, Math.max(0.0, currentStrength));
  }

  static reinforceMemory(memory: Memory, boost: number = 0.15): number {
    const alpha = boost;
    const newStrength = Math.min(1.0, memory.strength + alpha * (1 - memory.strength));
    return newStrength;
  }

  static calculateDecayCurve(
    initialStrength: number, 
    decayRate: number, 
    days: number
  ): number[] {
    const curve: number[] = [];
    for (let day = 0; day <= days; day++) {
      const strength = initialStrength * Math.pow(decayRate, day);
      curve.push(Math.max(0, strength));
    }
    return curve;
  }

  private static getHoursSince(lastAccessed: Date, now: Date = new Date()): number {
    const elapsedMs = now.getTime() - lastAccessed.getTime();
    return elapsedMs / (1000 * 60 * 60);
  }

  static calculateHalfLife(decayRate: number): number {
    return Math.log(0.5) / Math.log(decayRate);
  }

  static scheduleReview(
    memory: Memory, 
    performance: number
  ): { nextReviewDays: number; adjustedDecayRate: number } {
    if (performance >= 3) {
      return {
        nextReviewDays: 6,
        adjustedDecayRate: Math.min(0.99, memory.decayRate + 0.01)
      };
    } else if (performance === 2) {
      return {
        nextReviewDays: 3,
        adjustedDecayRate: memory.decayRate
      };
    } else {
      return {
        nextReviewDays: 1,
        adjustedDecayRate: Math.max(0.90, memory.decayRate - 0.02)
      };
    }
  }

  static calculateContextualBoost(
    baseStrength: number,
    relatedAccessCount: number,
    beta: number = 0.2
  ): number {
    const contextBoost = 1 + (beta * Math.log(1 + relatedAccessCount));
    return baseStrength * contextBoost;
  }

  static ebbinghausDecay(
    timeElapsed: number,
    initialStrength: number = 1.0,
    k: number = 1.84
  ): number {
    const S = k / Math.log(timeElapsed + 1);
    return initialStrength * Math.exp(-timeElapsed / S);
  }

  static calculateQueryScore(
    memory: Memory,
    semanticSimilarity: number,
    queryTime: Date = new Date()
  ): number {
    const currentStrength = this.calculateCurrentStrength(memory);
    
    const lastAccessed = memory.lastAccessed || new Date();
    const hoursSinceAccess = this.getHoursSince(lastAccessed, queryTime);
    const recency = hoursSinceAccess < 24 ? 1.0 : 0.8;
    
    return semanticSimilarity * 0.6 + currentStrength * 0.3 + recency * 0.1;
  }


  static getDecayTier(memory: Memory): DecayTier {
    const metadata = memory.metadata as any;
        if (metadata?.decayTier) {
      return metadata.decayTier;
    }
    
    const accessCount = memory.accessCount || 0;
    if (accessCount > 50) {
      return 'CRITICAL';
    } else if (accessCount > 20) {
      return 'IMPORTANT';
    } else if (accessCount > 5) {
      return 'REGULAR';
    } else {
      return 'EPHEMERAL';
    }
  }

  static getDecayRate(memory: Memory): number {
    const tier = this.getDecayTier(memory);
    return DECAY_TIERS[tier].rate;
  }

  static batchUpdateStrengths(
    memories: Memory[],
    updateInterval: number = 1
  ): Memory[] {
    return memories.map(memory => {
      const currentStrength = this.calculateCurrentStrength(memory);
      const lastAccessed = memory.lastAccessed || new Date();
      const timeSinceLastUpdate = this.getHoursSince(lastAccessed);
    if (timeSinceLastUpdate >= updateInterval) {
        return {
          ...memory,
          strength: currentStrength,
          lastAccessed: new Date()
        };
      }
      
      return memory;
    });
  }

  static shouldArchive(memory: Memory, threshold: number = 0.1): boolean {
    const currentStrength = this.calculateCurrentStrength(memory);
    return currentStrength < threshold;
  }

  static generateDecayStats(memories: Memory[]): {
    totalMemories: number;
    averageStrength: number;
    weakMemories: number;
    criticalMemories: number;
    decayDistribution: Record<DecayTier, number>;
  } {
    const stats = {
      totalMemories: memories.length,
      averageStrength: 0,
      weakMemories: 0,
      criticalMemories: 0,
      decayDistribution: {
        CRITICAL: 0,
        IMPORTANT: 0,
        REGULAR: 0,
        EPHEMERAL: 0
      } as Record<DecayTier, number>
    };

    let totalStrength = 0;
    
    memories.forEach(memory => {
      const currentStrength = this.calculateCurrentStrength(memory);
      const tier = this.getDecayTier(memory);
      
      totalStrength += currentStrength;
      stats.decayDistribution[tier]++;
      
      if (currentStrength < 0.1) stats.weakMemories++;
      if (tier === 'CRITICAL') stats.criticalMemories++;
    });

    stats.averageStrength = totalStrength / memories.length;
    
    return stats;
  }
}

export const DecayUtils = {

  decayRateToHalfLife(decayRate: number): number {
    return Math.abs(Math.log(0.5) / Math.log(decayRate));
  },

  getOptimalDecayRate(memoryType: MemoryType): number {
    return MEMORY_TYPE_DECAY_RATES[memoryType] ?? DECAY_TIERS.REGULAR.rate;
  },

  getMemoryAge(memory: Memory): number {
    const now = new Date();
    const createdAt = memory.createdAt || new Date();
    const elapsedMs = now.getTime() - createdAt.getTime();
    return elapsedMs / (1000 * 60 * 60 * 24);
  },

  needsReinforcement(memory: Memory, threshold: number = 0.3): boolean {
    return HMDDecay.calculateCurrentStrength(memory) < threshold;
  },

  applySectorMultiplier(
    baseStrength: number,
    sectorDecayMultiplier: number
  ): number {
    return baseStrength * sectorDecayMultiplier;
  }
};