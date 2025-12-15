"use client";

import { Project } from "../../../types";
import { RenovationKPIs } from "../renovation-kpi";
import { RenovationTimeline } from "../renovation-timeline";

interface RenovationViewProps {
  project: Project;
}

export function RenovationView({ project }: RenovationViewProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <RenovationKPIs project={project} />
      <RenovationTimeline project={project} />
    </div>
  );
}
