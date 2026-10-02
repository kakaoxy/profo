"""项目待办看板服务.

规则驱动的体检报告：对签约+装修阶段项目实时计算待办，不落库、只读展示。
数据加载单次批量预载（避免 N+1），规则判定下沉纯函数模块 todo_board_rules。
"""

import uuid
from datetime import date, datetime

from sqlalchemy.orm import Session, joinedload, selectinload

from constants.project_todo import MAX_TODOS_PER_CARD
from models import Project, ProjectDocument
from models.common import ProjectStatus
from schemas.project import (
    ProjectTodoBoardResponse,
    TodoBoardSummary,
    TodoItemOut,
    TodoManagerBrief,
    TodoProjectCard,
)

from .todo_board_config import load_rules
from .todo_board_rules import (
    DocumentFact,
    ProjectFacts,
    TodoDraft,
    build_project_todos,
    card_sort_key,
    sort_todos,
)


def _to_local_date(value: datetime | None) -> date | None:
    """时区感知 datetime → 服务器本地 date（日粒度规则统一口径）。"""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone()
    return value.date()


class TodoBoardService:
    """项目待办看板服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_board(self) -> ProjectTodoBoardResponse:
        """实时计算看板快照（规则阈值读 system_configs，容忍缺行回退默认）."""
        today = datetime.now().astimezone().date()
        rules = load_rules(self.db)
        projects = self._load_projects()
        documents_by_project = self._load_documents([p.id for p in projects])

        cards: list[TodoProjectCard] = []
        for project in projects:
            facts = self._build_facts(project, documents_by_project.get(project.id, []))
            drafts = build_project_todos(facts, today, rules)
            if not drafts:
                continue
            ordered = sort_todos(drafts)
            card = self._build_card(project, facts, ordered)
            # 卡片间排序键基于截断前的完整待办集（P0 多 → P1 多 → 最深滞后长）
            max_overdue = max((t.overdue_days for t in ordered if t.overdue_days is not None), default=None)
            key = card_sort_key(
                sum(1 for t in ordered if t.priority == "p0"),
                sum(1 for t in ordered if t.priority == "p1"),
                max_overdue,
                card.contract_no,
            )
            cards.append((key, card))

        cards.sort(key=lambda pair: pair[0])
        sorted_cards = [card for _, card in cards]

        all_todos = [t for c in sorted_cards for t in c.todos]
        return ProjectTodoBoardResponse(
            generated_at=datetime.now().astimezone(),
            summary=TodoBoardSummary(
                project_count=len(sorted_cards),
                todo_count=sum(c.todo_count for c in sorted_cards),
                p0_count=sum(1 for t in all_todos if t.priority == "p0"),
                max_overdue_days=max(
                    (t.overdue_days for t in all_todos if t.overdue_days is not None),
                    default=None,
                ),
            ),
            projects=sorted_cards,
        )

    # ── 数据加载 ──────────────────────────────────────────────────────

    def _load_projects(self) -> list[Project]:
        """签约+装修阶段项目批量加载（预载规则所需关联，避免 N+1）。"""
        return (
            self.db.query(Project)
            .filter(
                Project.is_deleted.is_(False),
                Project.status.in_([ProjectStatus.SIGNING, ProjectStatus.RENOVATING]),
            )
            .options(
                joinedload(Project.contract),
                selectinload(Project.owners),
                joinedload(Project.renovation),
                selectinload(Project.status_logs),
                joinedload(Project.project_manager),
            )
            .all()
        )

    def _load_documents(self, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ProjectDocument]]:
        """文书无 relationship（见 models/project/project.py），按 ID 集合 in 查询一次。"""
        if not project_ids:
            return {}
        docs = (
            self.db.query(ProjectDocument)
            .filter(
                ProjectDocument.project_id.in_(project_ids),
                ProjectDocument.is_deleted.is_(False),
            )
            .all()
        )
        grouped: dict[uuid.UUID, list[ProjectDocument]] = {}
        for doc in docs:
            grouped.setdefault(doc.project_id, []).append(doc)
        return grouped

    # ── 组装 ─────────────────────────────────────────────────────────

    def _build_facts(self, project: Project, documents: list[ProjectDocument]) -> ProjectFacts:
        contract = project.contract
        renovation = project.renovation
        owners = [o for o in project.owners if not o.is_deleted]

        # 进入装修时刻：最新一条 new_status=renovating 的状态日志
        entering_renovating_at: date | None = None
        for log in project.status_logs:
            if log.new_status == ProjectStatus.RENOVATING:
                log_date = _to_local_date(log.operate_at)
                if log_date and (entering_renovating_at is None or log_date > entering_renovating_at):
                    entering_renovating_at = log_date

        return ProjectFacts(
            project_id=project.id,
            status=project.status.value,
            community_name=project.community_name,
            contract_no=contract.contract_no if contract else None,
            business_form=project.business_form.value if project.business_form else None,
            renovation_stage=project.renovation_stage.value if project.renovation_stage else None,
            contract_status=contract.contract_status if contract else None,
            signing_date=_to_local_date(contract.signing_date) if contract else None,
            signing_period=contract.signing_period if contract else None,
            extension_period=contract.extension_period if contract else None,
            signing_price=contract.signing_price if contract else None,
            planned_handover_date=_to_local_date(contract.planned_handover_date) if contract else None,
            area=project.area,
            layout=project.layout,
            orientation=project.orientation,
            floor_info=project.floor_info,
            electricity_account=project.electricity_account,
            water_account=project.water_account,
            gas_account=project.gas_account,
            has_owner_contact=any(o.owner_name and o.owner_phone for o in owners),
            documents=tuple(
                DocumentFact(
                    document_name=d.document_name,
                    signoff_status=d.signoff_status,
                    archive_date=d.archive_date,
                    updated_at=_to_local_date(d.updated_at),
                )
                for d in documents
            ),
            renovation_company=renovation.renovation_company if renovation else None,
            contract_start_date=_to_local_date(renovation.contract_start_date) if renovation else None,
            contract_end_date=_to_local_date(renovation.contract_end_date) if renovation else None,
            actual_start_date=_to_local_date(renovation.actual_start_date) if renovation else None,
            actual_end_date=_to_local_date(renovation.actual_end_date) if renovation else None,
            stage_completed_dates=(
                dict(renovation.stage_completed_dates) if renovation and renovation.stage_completed_dates else {}
            ),
            entering_renovating_at=entering_renovating_at,
        )

    def _build_card(self, project: Project, facts: ProjectFacts, ordered: list[TodoDraft]) -> TodoProjectCard:
        """组装卡片（ordered 为已排序的完整待办集，截断在此处收口）。"""
        manager = project.project_manager
        return TodoProjectCard(
            project_id=project.id,
            community_name=project.community_name,
            contract_no=facts.contract_no,
            status=project.status.value,
            renovation_stage=facts.renovation_stage,
            renovation_company=facts.renovation_company,
            business_form=facts.business_form,
            manager=(
                TodoManagerBrief(
                    id=str(manager.id),
                    name=manager.nickname or manager.username,
                )
                if manager
                else None
            ),
            todo_count=len(ordered),
            p0_count=sum(1 for t in ordered if t.priority == "p0"),
            todos=[
                TodoItemOut(
                    rule_code=t.rule_code,
                    priority=t.priority,
                    title=t.title,
                    hint=t.hint,
                    items=t.items,
                    days_label=t.days_label,
                    days_hot=t.days_hot,
                    overdue_days=t.overdue_days,
                    anchor=t.anchor,
                )
                for t in ordered[:MAX_TODOS_PER_CARD]
            ],
            todo_overflow=max(0, len(ordered) - MAX_TODOS_PER_CARD),
        )
