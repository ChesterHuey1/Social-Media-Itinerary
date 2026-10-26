// Times of day are minutes from local midnight in the place's own time zone.
// A close time past 1440 means the window runs into the next date.

export type Objective = 'eat' | 'explore' | 'pictures' | 'experience';
export type StopColor = 'green' | 'blue' | 'amber' | 'ink';
export type TravelMode = 'walk' | 'transit';
export type ExpenseCategory = 'flights' | 'stay' | 'food' | 'tickets' | 'transit';

/** Where a value came from. Anything from `deepseek` shows as an estimate. */
export type FactSource = 'google' | 'scrape' | 'deepseek';

export type LatLng = { lat: number; lng: number };

export type OpenWindow = { openMin: number; closeMin: number };

export type Hours =
  | { kind: 'windows'; windows: OpenWindow[]; source: 'google' | 'scrape' }
  | { kind: 'always' }
  | { kind: 'unconfirmed' };

export type Place = {
  id: string;
  name: string;
  area: string;
  city: string;
  location: LatLng;
  hours: Hours;
  lastEntryMin: number;
  cost: { usd: number; per: 'person' | 'ticket'; source: FactSource } | null;
  needsBooking: boolean;
  tip: { text: string; source: FactSource } | null;
  objectives: Objective[];
};

export type Comment = { id: string; body: string; createdAt: string };

/** What the user controls. Arrival times are computed from the order, see timeline.ts. */
export type Stop = {
  id: string;
  placeId: string;
  /** User's own title. Null shows the place name. */
  title: string | null;
  color: StopColor;
  objectives: Objective[];
  stay: { minutes: number; source: 'estimate' | 'user' };
  lockedAtMin: number | null;
  comments: Comment[];
};

export type Leg = {
  mode: TravelMode;
  minutes: number;
  distanceM: number;
  line: string | null;
  fareUsd: number | null;
  /** `routes` came from Google; `estimate` is a straight-line guess until Routes is wired in. */
  source: 'routes' | 'estimate';
};

/** Key for a leg between two route nodes: a stay id or a place id. */
export type LegKey = `${string}>${string}`;

export type FixedRow = { kind: 'hotel' | 'flight'; text: string; atMin: number };

export type Day = {
  number: number;
  date: string;
  title: string;
  note: string | null;
  stayId: string;
  startMin: number;
  endMin: number;
  startRows: FixedRow[];
  endRows: FixedRow[];
  /** In visit order. */
  stops: Stop[];
};

export type Stay = {
  id: string;
  name: string;
  city: string;
  location: LatLng;
  checkInDate: string;
  checkOutDate: string;
  checkInMin: number;
  checkOutMin: number;
  costUsd: number | null;
};

export type Flight = {
  id: string;
  airline: string;
  number: string;
  from: string;
  to: string;
  date: string;
  /** Landing time for the inbound flight, departure time for the outbound one. */
  timeMin: number;
  direction: 'arrive' | 'depart';
  international: boolean;
  costUsd: number | null;
};

export type BacklogItem = { placeId: string; reason: string };

export type Expense = {
  id: string;
  amountUsd: number;
  category: Exclude<ExpenseCategory, 'flights' | 'stay'>;
  note: string;
  date: string;
};

export type SavedPlace = { placeId: string; from: 'reel' | 'search'; reelCount: number; included: boolean };

export type SavedPost = { id: string; url: string; status: 'pending' | 'done' | 'needs_review' };

export type Trip = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budgetUsd: number;
  stays: Stay[];
  flights: Flight[];
  days: Day[];
  /** Known travel legs by node pair. Pairs not listed get an estimate. */
  legs: Partial<Record<LegKey, Leg>>;
  backlog: BacklogItem[];
  expenses: Expense[];
  places: Record<string, Place>;
  savedPlaces: SavedPlace[];
  savedPosts: SavedPost[];
};
