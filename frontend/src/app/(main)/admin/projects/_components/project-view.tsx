"use client";

import { useMemo, useState } from "react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import type { Project } from "../types";
import { ProjectPageHeader } from "./project-page-header";
import { ProjectPortfolio } from "./project-portfolio";
import { ProjectListCard, type ViewMode } from "./project-list-card";
import {
  getProjectStage,
  projectMeta,
  projectTitle,
  type ProjectStageKey,
} from "./project-display";

interface ProjectViewProps {
  data: Project[];
}

type SortKey = "updated" | "signing" | "holding";

export function ProjectView({ data }: ProjectViewProps) {
  const [{ status: activeStage, page, business_form: businessForm, is_archived: archivedFilter }, setQuery] =
    useQueryStates(
      {
        status: parseAsString.withDefault("all"),
        page: parseAsInteger.withDefault(1),
        business_form: parseAsString.withDefault("all"),
        is_archived: parseAsString.withDefault("all"),
      },
      { shallow: true },
    );
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("table");

  const filteredData = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return data.filter((project) => {
      if (activeStage !== "all" && getProjectStage(project.status) !== activeStage) return false;
      if (businessForm !== "all" && project.business_form !== businessForm) return false;
      if (archivedFilter === "true" && !project.is_archived) return false;
      if (archivedFilter === "false" && project.is_archived) return false;
      if (!keyword) return true;
      return [projectTitle(project), project.community_name, project.address, project.contract_no, projectMeta(project)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [data, activeStage, businessForm, archivedFilter, searchQuery]);

  const handleStageChange = (stage: ProjectStageKey | "all") => {
    void setQuery({ status: stage, page: 1 });
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-7 pb-10 pt-2">
        <ProjectPageHeader projects={data} />
        <ProjectPortfolio projects={data} activeStage={activeStage} onStageChange={handleStageChange} />
        <ProjectListCard
          projects={filteredData}
          totalCount={data.length}
          activeStage={activeStage}
          businessForm={businessForm}
          archivedFilter={archivedFilter}
          searchQuery={searchQuery}
          sort={sort}
          page={page}
          view={view}
          onSearchChange={(value) => {
            setSearchQuery(value);
            void setQuery({ page: 1 });
          }}
          onSortChange={setSort}
          onViewChange={setView}
          onStageChange={(value) => handleStageChange(value)}
          onBusinessFormChange={(value) => void setQuery({ business_form: value, page: 1 })}
          onArchivedFilterChange={(value) => void setQuery({ is_archived: value, page: 1 })}
          onPageChange={(nextPage) => void setQuery({ page: nextPage })}
        />
      </PageContainer>
    </div>
  );
}
