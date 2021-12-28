import React from "react";

export interface ScreenProps {
  children: React.ReactNode;
}

export function Screen({ children }: ScreenProps) {
  return (
    <div className="screen-outer">
      <div className="screen-inner">{children}</div>
      <style jsx>{`
        .screen-outer {
          position: absolute;
          height: 100%;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .screen-inner {
          color: #fff;
          background: #111;
          height: 480px;
          width: 720px;
          position: relative;
        }
      `}</style>
    </div>
  );
}
