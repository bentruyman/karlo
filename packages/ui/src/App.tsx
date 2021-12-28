import React from "react";
import { useKey } from "react-use";
import { useRecoilState } from "recoil";

import { overscanState } from "./atom/overscan_state";
import { Menu } from "./components/Menu";
import { Overscan } from "./components/Overscan";
import { Screen } from "./components/Screen";

export default function App() {
  const [overscan, setOverscan] = useRecoilState(overscanState);
  useKey("o", () => setOverscan(!overscan), {}, [overscan]);

  return (
    <div>
      <Screen>
        {overscan && <Overscan />}
        <Menu body="Body" context="Context" guide="Guide" />
      </Screen>
    </div>
  );
}
