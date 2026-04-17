export type BrowseViewId =
  | "favorites"
  | "recent"
  | "genre"
  | "year"
  | "manufacturer";

export interface GameRecord {
  id: string;
  title: string;
  machineName: string;
  year: number;
  manufacturer: string;
  genre: string;
  attractCaption?: string;
  isFavorite?: boolean;
  wasRecentlyPlayed?: boolean;
}

export interface BrowseView {
  id: BrowseViewId;
  label: string;
  description: string;
}
