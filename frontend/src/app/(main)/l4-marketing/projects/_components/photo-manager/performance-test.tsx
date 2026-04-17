"use client";

import { useEffect, useState, useCallback } from "react";

interface PerformanceTestResult {
  testName: string;
  duration: number;
  success: boolean;
  details?: string;
}

interface DeviceInfo {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  connection?: string;
}

class PerformanceTester {
  private results: PerformanceTestResult[] = [];
  private deviceInfo: DeviceInfo;

  constructor() {
    this.deviceInfo = this.getDeviceInfo();
  }

  private getDeviceInfo(): DeviceInfo {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string };
    };

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency || 1,
      deviceMemory: nav.deviceMemory,
      connection: nav.connection?.effectiveType,
    };
  }

  async runDialogOpenTest(
    openFn: () => void,
    targetTime: number = 300
  ): Promise<PerformanceTestResult> {
    const startTime = performance.now();

    try {
      openFn();

      // 等待两帧确保渲染完成
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const duration = performance.now() - startTime;
      const success = duration <= targetTime;

      const result: PerformanceTestResult = {
        testName: "弹窗打开时间",
        duration,
        success,
        details: `实际: ${duration.toFixed(2)}ms, 目标: ${targetTime}ms`,
      };

      this.results.push(result);
      return result;
    } catch (error) {
      const result: PerformanceTestResult = {
        testName: "弹窗打开时间",
        duration: 0,
        success: false,
        details: `错误: ${error}`,
      };
      this.results.push(result);
      return result;
    }
  }

  async runScrollTest(
    scrollFn: () => void,
    targetFPS: number = 30
  ): Promise<PerformanceTestResult> {
    const frames: number[] = [];
    let lastTime = performance.now();
    let frameCount = 0;

    const measureFrame = () => {
      const currentTime = performance.now();
      const delta = currentTime - lastTime;
      frames.push(delta);
      lastTime = currentTime;
      frameCount++;

      if (frameCount < 60) {
        requestAnimationFrame(measureFrame);
      }
    };

    return new Promise((resolve) => {
      scrollFn();
      requestAnimationFrame(measureFrame);

      setTimeout(() => {
        const avgFrameTime = frames.reduce((a, b) => a + b, 0) / frames.length;
        const fps = 1000 / avgFrameTime;
        const success = fps >= targetFPS;

        const result: PerformanceTestResult = {
          testName: "滚动流畅度",
          duration: avgFrameTime,
          success,
          details: `平均FPS: ${fps.toFixed(1)}, 目标: ${targetFPS}fps`,
        };

        this.results.push(result);
        resolve(result);
      }, 1000);
    });
  }

  async runMemoryTest(
    loadFn: () => void
  ): Promise<PerformanceTestResult> {
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    const beforeMemory = perf.memory?.usedJSHeapSize || 0;
    const startTime = performance.now();

    loadFn();

    // 等待加载完成
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const afterMemory = perf.memory?.usedJSHeapSize || 0;
    const memoryIncrease = (afterMemory - beforeMemory) / 1024 / 1024; // MB
    const duration = performance.now() - startTime;

    const result: PerformanceTestResult = {
      testName: "内存占用测试",
      duration,
      success: memoryIncrease < 100, // 100MB阈值
      details: `内存增加: ${memoryIncrease.toFixed(2)}MB`,
    };

    this.results.push(result);
    return result;
  }

  generateReport(): string {
    const passedTests = this.results.filter((r) => r.success).length;
    const totalTests = this.results.length;

    const report = {
      timestamp: new Date().toISOString(),
      deviceInfo: this.deviceInfo,
      summary: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        passRate: ((passedTests / totalTests) * 100).toFixed(1) + "%",
      },
      results: this.results,
    };

    return JSON.stringify(report, null, 2);
  }

  getResults(): PerformanceTestResult[] {
    return [...this.results];
  }

  clearResults(): void {
    this.results = [];
  }
}

// React Hook for performance testing
export function usePerformanceTester() {
  const [tester] = useState(() => new PerformanceTester());
  const [results, setResults] = useState<PerformanceTestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  const runAllTests = useCallback(
    async (testConfig: {
      openTest: () => void;
      scrollTest: () => void;
      memoryTest: () => void;
    }) => {
      setIsTesting(true);
      tester.clearResults();

      try {
        await tester.runDialogOpenTest(testConfig.openTest);
        await tester.runScrollTest(testConfig.scrollTest);
        await tester.runMemoryTest(testConfig.memoryTest);

        setResults(tester.getResults());
      } finally {
        setIsTesting(false);
      }
    },
    [tester]
  );

  const generateReport = useCallback(() => {
    return tester.generateReport();
  }, [tester]);

  return {
    results,
    isTesting,
    runAllTests,
    generateReport,
    runSingleTest: {
      dialogOpen: tester.runDialogOpenTest.bind(tester),
      scroll: tester.runScrollTest.bind(tester),
      memory: tester.runMemoryTest.bind(tester),
    },
  };
}

// 性能测试组件
export function PerformanceTestPanel({
  onRunTests,
}: {
  onRunTests: () => Promise<PerformanceTestResult[]>;
}) {
  const [results, setResults] = useState<PerformanceTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      const testResults = await onRunTests();
      setResults(testResults);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg border">
      <h3 className="font-semibold mb-3">性能测试面板</h3>
      <button
        onClick={handleRunTests}
        disabled={isRunning}
        className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
      >
        {isRunning ? "测试中..." : "运行性能测试"}
      </button>

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-3 rounded ${
                result.success ? "bg-green-100" : "bg-red-100"
              }`}
            >
              <div className="font-medium">{result.testName}</div>
              <div className="text-sm">
                耗时: {result.duration.toFixed(2)}ms
              </div>
              {result.details && (
                <div className="text-xs text-gray-600">{result.details}</div>
              )}
              <div
                className={`text-xs font-bold ${
                  result.success ? "text-green-600" : "text-red-600"
                }`}
              >
                {result.success ? "通过" : "未通过"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { PerformanceTester };
export type { PerformanceTestResult, DeviceInfo };
