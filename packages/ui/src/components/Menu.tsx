import React from "react";

export interface MainMenuProps {
  body: React.ReactNode;
  context: React.ReactNode;
  guide: React.ReactNode;
}

export function Menu({ body, context, guide }: MainMenuProps) {
  return (
    <div className="menu">
      <div className="body">{body}</div>
      <div className="context">{context}</div>
      <div className="guide">{guide}</div>
      <style jsx>{`
        .menu {
          position: absolute;
          height: 100%;
          width: 100%;
        }

        .body {
          height: 100%;
          position: absolute;
          left: 30px;
          top: 0;
        }

        .context {
          position: absolute;
          right: 30px;
          top: 10px;
        }

        .guide {
          position: absolute;
          right: 30px;
          bottom: 10px;
        }
      `}</style>
    </div>
  );
}
