"use client";

import React, { memo } from "react";
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DndContextProps,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

interface DndProviderProps extends Omit<DndContextProps, "sensors"> {
  children: React.ReactNode;
}

export const DndProvider = memo(function DndProvider({
  children,
  ...props
}: DndProviderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} {...props}>
      {children}
    </DndContext>
  );
});
