import type { CollisionDetection, Collision } from "@dnd-kit/core";
import { pointerWithin, rectIntersection, getFirstCollision } from "@dnd-kit/core";

// 容器ID判断：营销容器 "marketing" 或改造阶段容器 "renovation-*"
const isContainerId = (id: unknown): boolean =>
  id === "marketing" || String(id).startsWith("renovation-");

// 自定义碰撞检测：
// - 指针命中具体照片时返回照片（用于同一容器内排序）
// - 指针命中容器空白区时返回容器（用于跨容器移动）
export const customCollisionDetection: CollisionDetection = (args): Collision[] => {
  const pointerCollisions = pointerWithin(args);

  const firstCollision = getFirstCollision(pointerCollisions);
  if (firstCollision && isContainerId(firstCollision.id)) {
    // 拖到容器空白处：返回最接近的容器
    const containerCollisions = rectIntersection(args).filter((c) =>
      isContainerId(c.id)
    );
    return containerCollisions.length > 0 ? containerCollisions : [firstCollision];
  }

  // 指针命中照片，返回用于排序
  return pointerCollisions;
};
