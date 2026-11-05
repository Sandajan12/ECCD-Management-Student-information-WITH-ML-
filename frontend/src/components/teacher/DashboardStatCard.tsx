import type { ReactNode } from "react";

export interface DashboardStatCardProps {
  title: string;
  value: ReactNode;
  subtitle: string;
  icon: ReactNode;
  iconClassName: string;
  badgeClassName?: string;
  muted?: boolean;
}
