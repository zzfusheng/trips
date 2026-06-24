// 行程类型定义

export interface TripPlan {
  id: string;
  title: string;
  destination: string;
  origin?: string;
  travelers?: number;
  startDate: string;
  endDate: string;
  days: number;
  description: string;
  image: string;
  tags: string[];
  status: 'draft' | 'active' | 'completed';
  checkedIn?: boolean;
  itinerary: DayPlan[];
  createdAt: string;
}

export interface DayPlan {
  day: number;
  date: string;
  title: string;
  activities: Activity[];
}

export interface Activity {
  id: string;
  time: string;
  title: string;
  description: string;
  location: string;
  type: 'sightseeing' | 'food' | 'transport' | 'hotel' | 'other';
  icon: string;
  image?: string;
  jumpUrl?: string;
  flyaiResults?: SearchItem[];
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  image: string;
  description: string;
  rating: number;
  tags: string[];
  bestSeason: string;
  budget: string;
}

export interface SearchItem {
  title: string;
  price: string;
  jumpUrl: string;
  description: string;
  image: string;
  features?: string[];
  recommendedDishes?: string[];
  address?: string;
  avgPrice?: string;
  noDetail?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tripPlan?: TripPlan;
  searchItems?: SearchItem[];
  context?: {
    reselectAct?: {
      tripId: string;
      dayIdx: number;
      actIdx: number;
      originalTitle: string;
      destination?: string;
      actType?: string;
    };
  };
  timestamp: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  location: string;
  description: string;
  reminder: boolean;
  reminderTime: number; // 提前分钟数
  tripId?: string;
  type: 'sightseeing' | 'food' | 'transport' | 'hotel' | 'other';
}
