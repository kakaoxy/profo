import type { CollisionDetection, Collision } from "@dnd-kit/core";
import { rectIntersection } from "@dnd-kit/core";

// 自定义碰撞检测：优先识别容器（阶段）而不是照片
export const customCollisionDetection: CollisionDetection = (args): Collision[] => {
  const collisions = rectIntersection(args);

  if (collisions.length === 0) {
    return [];
  }

  const containerCollisions = collisions.filter(
    (collision) => collision.id === "marketing" || String(collision.id).startsWith("renovation-")
  );

  if (containerCollisions.length > 0) {
    return containerCollisions;
  }

  return collisions;
};
