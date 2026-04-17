"use client";

import React, { useCallback, useRef } from "react";

interface PerformanceMetrics {
  [key: string]: number[];
}

interface PerformanceReport {
  metrics: PerformanceMetrics;
  averages: { [key: string]: number };
  totalOperations: number;
}

export function usePerformanceMonitor(componentName: string) {
  const metricsRef = useRef<PerformanceMetrics>({});

  const recordMetric = useCallback((metricName: string, value: number) => {
    if (!metricsRef.current[metricName]) {
      metricsRef.current[metricName] = [];
    }
    metricsRef.current[metricName].push(value);

    // 在开发环境下打印详细性能信息
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[${componentName}] ${metricName}: ${value.toFixed(2)}ms`
      );
    }
  }, [componentName]);

  const getMetrics = useCallback((): PerformanceReport => {
    const averages: { [key: string]: number } = {};
    let totalOperations = 0;

    Object.entries(metricsRef.current).forEach(([key, values]) => {
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        averages[key] = sum / values.length;
        totalOperations += values.length;
      }
    });

    return {
      metrics: { ...metricsRef.current },
      averages,
      totalOperations,
    };
  }, []);

  const clearMetrics = useCallback(() => {
    metricsRef.current = {};
  }, []);

  const measureAsync = useCallback(
    async <T,>(
      metricName: string,
      asyncFn: () => Promise<T>
    ): Promise<T> => {
      const startTime = performance.now();
      try {
        const result = await asyncFn();
        recordMetric(metricName, performance.now() - startTime);
        return result;
      } catch (error) {
        recordMetric(`${metricName}_error`, performance.now() - startTime);
        throw error;
      }
    },
    [recordMetric]
  );

  const measureSync = useCallback(
    <T,>(metricName: string, fn: () => T): T => {
      const startTime = performance.now();
      try {
        const result = fn();
        recordMetric(metricName, performance.now() - startTime);
        return result;
      } catch (error) {
        recordMetric(`${metricName}_error`, performance.now() - startTime);
        throw error;
      }
    },
    [recordMetric]
  );

  return {
    recordMetric,
    getMetrics,
    clearMetrics,
    measureAsync,
    measureSync,
  };
}

// 全局性能监控工具
export class GlobalPerformanceMonitor {
  private static instance: GlobalPerformanceMonitor;
  private metrics: Map<string, PerformanceMetrics> = new Map();

  static getInstance(): GlobalPerformanceMonitor {
    if (!GlobalPerformanceMonitor.instance) {
      GlobalPerformanceMonitor.instance = new GlobalPerformanceMonitor();
    }
    return GlobalPerformanceMonitor.instance;
  }

  record(componentName: string, metricName: string, value: number): void {
    if (!this.metrics.has(componentName)) {
      this.metrics.set(componentName, {});
    }
    const componentMetrics = this.metrics.get(componentName)!;
    if (!componentMetrics[metricName]) {
      componentMetrics[metricName] = [];
    }
    componentMetrics[metricName].push(value);
  }

  getReport(componentName?: string): PerformanceReport | Map<string, PerformanceReport> {
    if (componentName) {
      const metrics = this.metrics.get(componentName) || {};
      const averages: { [key: string]: number } = {};
      let totalOperations = 0;

      Object.entries(metrics).forEach(([key, values]) => {
        if (values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0);
          averages[key] = sum / values.length;
          totalOperations += values.length;
        }
      });

      return {
        metrics,
        averages,
        totalOperations,
      };
    }

    const allReports = new Map<string, PerformanceReport>();
    this.metrics.forEach((_, name) => {
      allReports.set(name, this.getReport(name) as PerformanceReport);
    });
    return allReports;
  }

  clear(componentName?: string): void {
    if (componentName) {
      this.metrics.delete(componentName);
    } else {
      this.metrics.clear();
    }
  }
}

// React组件渲染性能高阶组件
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> {
  return function PerformanceTrackedComponent(props: P) {
    const renderStartTime = performance.now();

    const result = React.createElement(Component, props);

    const renderTime = performance.now() - renderStartTime;
    if (renderTime > 16) { // 超过一帧时间(60fps)
      console.warn(
        `[Performance] ${componentName} 渲染耗时: ${renderTime.toFixed(2)}ms`
      );
    }

    GlobalPerformanceMonitor.getInstance().record(
      componentName,
      "render",
      renderTime
    );

    return result;
  };
}
