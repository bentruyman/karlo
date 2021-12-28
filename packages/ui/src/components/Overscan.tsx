import React from "react";

export function Overscan() {
  return (
    <div className="overscan">
      <style jsx>{`
        .overscan {
          border-color: rgba(255, 255, 255, 0.1);
          border-style: solid;
          border-width: 0 15px;
          position: absolute;
          height: 100%;
          width: 100%;
        }
        .overscan:after {
          content: " ";
        }
      `}</style>
    </div>
  );
}
