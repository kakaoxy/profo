"use client";

export interface TimeMonitor {
  progress: number;
  remaining_days: number;
  daily_loss: number;
  monthly_loss: number;
}

export function calculateTimeMonitor(
  signingDate: string | null,
  signingPeriod: number | null,
  extensionRent: number | null,
): TimeMonitor {
  const defaultMonitor: TimeMonitor = {
    progress: 0,
    remaining_days: 0,
    daily_loss: 0,
    monthly_loss: 0,
  };

  if (!signingDate || !signingPeriod) {
    return defaultMonitor;
  }

  const startDate = new Date(signingDate);
  const today = new Date();
  const totalDays = signingPeriod;
  const consumedDays = Math.floor(
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const remainingDays = Math.max(0, totalDays - consumedDays);
  const progress = Math.min(100, Math.max(0, (consumedDays / totalDays) * 100));

  const monthlyLoss = extensionRent ?? 0;
  const dailyLoss = Math.round(monthlyLoss / 30);

  return {
    progress: Math.round(progress),
    remaining_days: remainingDays,
    daily_loss: dailyLoss,
    monthly_loss: monthlyLoss,
  };
}
