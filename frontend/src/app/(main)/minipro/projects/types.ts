import type { components } from "@/lib/api-types";

export type MiniProject = components["schemas"]["MiniProjectResponse"];
export type MiniProjectCreate = components["schemas"]["MiniProjectCreate"];
export type MiniProjectUpdate = components["schemas"]["MiniProjectUpdate"];
export type Consultant = components["schemas"]["ConsultantResponse"];
export type ConsultantCreate = components["schemas"]["ConsultantCreate"];
export type ConsultantUpdate = components["schemas"]["ConsultantUpdate"];
export type MiniProjectPhoto = components["schemas"]["MiniProjectPhotoResponse"];
export type RenovationPhoto = components["schemas"]["RenovationPhotoResponse"];

export type RenovationStage = "signing" | "renovating" | "selling" | "sold" | "other";
