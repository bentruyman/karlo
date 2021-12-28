import { atom } from "recoil";

export interface Guide {
  color: "red" | "blue";
  label: string;
}

export const guideState = atom<Guide[] | null>({
  key: "guideState",
  default: null,
});
