"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";

export interface ActionDef {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "ghost" | "default" | "destructive";
  disabled?: boolean;
}

export interface TableActionCellProps {
  actions: ActionDef[];
  maxVisible?: number;
}

function ActionButton({ label, icon: Icon, onClick, variant = "ghost", disabled }: ActionDef) {
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

export function TableActionCell({ actions, maxVisible = 2 }: TableActionCellProps) {
  const visibleActions = actions.slice(0, maxVisible);
  const overflowActions = actions.slice(maxVisible);

  return (
    <div className="flex items-center gap-1">
      {visibleActions.map((action, i) => (
        <ActionButton key={i} {...action} />
      ))}
      {overflowActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflowActions.map((action, i) => (
              <DropdownMenuItem
                key={i}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}