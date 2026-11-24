import type { ReactNode } from "react";
import ScenePhoto from "./ScenePhoto";

/** The photo header on top of the practice screens (styles in pages/practice.css). */
export function PracticeCover({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="pr-cover">
      <ScenePhoto className="pr-cover-photo" />
      <div className="pr-cover-copy">{children}<h1>{title}</h1></div>
    </header>
  );
}

export default PracticeCover;
