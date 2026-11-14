export type EventType = 'wedding' | 'potluck' | 'collection' | 'custom';

export type ModuleKey = 'voiceform' | 'ledger' | 'album' | 'potluck' | 'playlist';

export interface EventConfig {
  functions?: string[];
  targetAmount?: number;
  upiId?: string;
  payeeName?: string;
  ledgerLabel?: string;
  expectedHeadcount?: number;
  recapNarrative?: string;
  recapGeneratedAt?: string;
}

export interface UtsavEvent {
  id: string;
  name: string;
  type: EventType;
  date_start: string;
  date_end: string;
  host_name: string;
  location: string;
  modules_enabled: ModuleKey[];
  config: EventConfig;
  created_at: string;
}

export interface VoiceFormPayload {
  guestName: string;
  phone?: string;
  attending: boolean;
  headcount: number;
  ambiguousHeadcount: boolean;
  clarificationQuestion?: string;
  functions: string[];
  dietaryNotes: string;
  arrivalNote: string;
  transcript: string;
  source: 'voice' | 'text';
}

export interface LedgerPayload {
  memberName: string;
  phone?: string;
  baseAmount: number;
  fractionCents: number;
  totalAmount: number;
  paid: boolean;
  utr?: string;
  receiptNote?: string;
  paidAt?: string;
}

export interface AlbumPayload {
  imageUrl: string;
  uploaderName: string;
  caption: string;
  tags: string[];
  exifTimestamp?: string;
  withinEventWindow: boolean;
  width?: number;
  height?: number;
}

export interface PotluckPayload {
  guestName: string;
  dishName: string;
  category: 'Starter' | 'Main' | 'Side' | 'Dessert' | 'Drink';
  servings: number;
  dietary: 'Veg' | 'Vegan' | 'Non-Veg' | 'Jain' | 'Gluten-Free';
  notes?: string;
}

export type EnergyTier = 'chill' | 'mid' | 'high';

export interface PlaylistPayload {
  trackName: string;
  artistName: string;
  albumName?: string;
  artworkUrl?: string;
  previewUrl?: string;
  durationSec?: number;
  genre?: string;
  estimatedBpm: number;
  energyTier: EnergyTier;
  addedBy: string;
  votes: number;
  vibeOrder?: number;
}

export interface ModuleRecord<T = unknown> {
  id: string;
  event_id: string;
  module: ModuleKey;
  payload: T;
  created_at: string;
}

export interface PotluckAnalysis {
  duplicateGroups: Array<{
    canonicalName: string;
    dishes: string[];
    reason: string;
  }>;
  categoryCounts: Record<string, number>;
  totalServings: number;
  gaps: string[];
  suggestions: string[];
  summary: string;
}

export interface RecapStats {
  event: UtsavEvent;
  totalRecords: number;
  voiceform: {
    totalResponses: number;
    attendingResponses: number;
    declinedResponses: number;
    confirmedHeadcount: number;
    ambiguousCount: number;
    functionBreakdown: Record<string, number>;
  };
  ledger: {
    targetAmount: number;
    collectedAmount: number;
    paidCount: number;
    totalContributors: number;
    completionPct: number;
  };
  album: {
    totalPhotos: number;
    uniqueContributors: number;
    taggedPeople: string[];
    inWindowCount: number;
  };
  potluck: {
    totalDishes: number;
    totalServings: number;
    categoryBreakdown: Record<string, number>;
  };
  playlist: {
    totalTracks: number;
    totalVotes: number;
    topTrack: { trackName: string; artistName: string; votes: number } | null;
  };
  narrative: string;
}

export interface DecemberRollupEvent {
  id: string;
  name: string;
  type: EventType;
  date_start: string;
  targetAmount: number;
  collectedAmount: number;
  paidCount: number;
  totalContributors: number;
}

export interface DecemberRollup {
  totalCollected: number;
  totalTarget: number;
  totalPaidContributors: number;
  events: DecemberRollupEvent[];
}
