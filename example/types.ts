export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string; // Tailwind class for bg color
  initial: string;
}

export interface Project {
  id: string;
  name: string;
  appId: string;
  icon: string; // URL or name
  pendingCount: number;
  resolvedCount: number;
}

export interface FileItem {
  id: string;
  name: string;
  type: 'figma' | 'folder' | 'sketch' | 'doc';
  size: string;
  owner: string;
  avatarUrl: string;
  updatedAt: string;
}

export interface StatItem {
  label: string;
  value: string;
  suffix?: string;
  trend?: {
    value: string;
    isUp: boolean;
  };
  highlight?: boolean;
}