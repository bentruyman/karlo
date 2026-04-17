export type BrowseViewId =
  | "favorites"
  | "recent"
  | "genre"
  | "year"
  | "manufacturer";

export type FocusZone = "views" | "carousel";

export interface GameRecord {
  id: string;
  title: string;
  machineName: string;
  year: number;
  manufacturer: string;
  genre: string;
  description: string;
  marqueeText: string;
  attractCaption: string;
  isFavorite: boolean;
  wasRecentlyPlayed: boolean;
  accentPrimary: string;
  accentSecondary: string;
  cabinetColor: string;
}

export interface BrowseView {
  id: BrowseViewId;
  label: string;
  description: string;
}
