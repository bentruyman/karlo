import { atom } from "recoil";

export const contextState = atom<string | null>({
  key: "contextState",
  default: null,
});
