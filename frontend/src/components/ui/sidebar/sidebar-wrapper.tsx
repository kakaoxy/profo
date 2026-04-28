"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from "./constants"
import { SidebarProvider } from "./sidebar-context"
import type { SidebarProviderProps } from "./types"

export function SidebarWrapper({
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
    >
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarProvider>
  )
}
