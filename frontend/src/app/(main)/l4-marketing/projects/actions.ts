/**
 * L4 Marketing Actions (兼容导出)
 * @deprecated 请直接从 './actions' 目录导入
 *
 * 此文件仅为保持向后兼容，新代码请使用:
 * import { ... } from "./actions/projects";
 * import { ... } from "./actions/media";
 */

// 项目相关
export {
  getL4MarketingProjectsAction,
  createL4MarketingProjectAction,
  getL4MarketingProjectAction,
  updateL4MarketingProjectAction,
  deleteL4MarketingProjectAction,
} from "./actions/projects";

// 媒体相关
export {
  getL4MarketingMediaAction,
  createL4MarketingMediaAction,
  updateL4MarketingMediaAction,
  deleteL4MarketingMediaAction,
  batchAddL4PhotosAction,
} from "./actions/media";
