/**
 * 安全的日志工具
 * - 只在开发环境输出详细日志
 * - 生产环境自动脱敏敏感信息
 * - 支持日志级别控制
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogConfig {
  level: LogLevel;
  isDevelopment: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// 敏感字段列表，这些字段在日志中会被脱敏
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "temp_token",
  "api_key",
  "secret",
  "authorization",
  "cookie",
  "session",
];

/**
 * 检测值是否为简单对象（非null、非数组的对象）
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 递归脱敏敏感数据
 */
function maskSensitiveData(data: unknown): unknown {
  if (isPlainObject(data)) {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
        // 敏感字段脱敏显示
        if (typeof value === "string" && value.length > 0) {
          masked[key] = value.length > 10 ? `${value.slice(0, 3)}***${value.slice(-3)}` : "***";
        } else {
          masked[key] = "***";
        }
      } else if (isPlainObject(value)) {
        masked[key] = maskSensitiveData(value);
      } else if (Array.isArray(value)) {
        masked[key] = value.map((item) => maskSensitiveData(item));
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }
  return data;
}

/**
 * 安全地序列化数据，处理循环引用
 */
function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    // 处理循环引用或其他序列化错误
    return String(data);
  }
}

class Logger {
  private config: LogConfig;

  constructor() {
    this.config = {
      level: (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || "info",
      isDevelopment: process.env.NODE_ENV === "development",
    };
  }

  /**
   * 检查日志级别是否允许输出
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * 处理日志消息和数据
   */
  private processLog(
    level: LogLevel,
    message: string,
    data?: unknown
  ): { message: string; data?: unknown } {
    if (!this.config.isDevelopment) {
      // 生产环境：脱敏所有数据
      return {
        message,
        data: data !== undefined ? maskSensitiveData(data) : undefined,
      };
    }
    // 开发环境：保留原始数据
    return { message, data };
  }

  debug(message: string, data?: unknown): void {
    if (!this.shouldLog("debug")) return;
    const processed = this.processLog("debug", message, data);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] ${processed.message}`, processed.data !== undefined ? processed.data : "");
  }

  info(message: string, data?: unknown): void {
    if (!this.shouldLog("info")) return;
    const processed = this.processLog("info", message, data);
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${processed.message}`, processed.data !== undefined ? processed.data : "");
  }

  warn(message: string, data?: unknown): void {
    if (!this.shouldLog("warn")) return;
    const processed = this.processLog("warn", message, data);
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${processed.message}`, processed.data !== undefined ? processed.data : "");
  }

  error(message: string, error?: unknown): void {
    if (!this.shouldLog("error")) return;
    // 错误日志中永远不要包含敏感信息
    const safeError = error instanceof Error
      ? { name: error.name, message: error.message }
      : maskSensitiveData(error);
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`, safeError);
  }

  /**
   * 开发环境专用调试日志，生产环境完全不会输出
   */
  devDebug(message: string, data?: unknown): void {
    if (this.config.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(`[DEV] ${message}`, data !== undefined ? data : "");
    }
  }
}

// 导出单例实例
export const logger = new Logger();

/**
 * 创建安全的日志上下文
 * 用于 Server Actions 中的日志记录
 */
export function createActionLogger(actionName: string) {
  return {
    debug: (msg: string, data?: unknown) => logger.debug(`[${actionName}] ${msg}`, data),
    info: (msg: string, data?: unknown) => logger.info(`[${actionName}] ${msg}`, data),
    warn: (msg: string, data?: unknown) => logger.warn(`[${actionName}] ${msg}`, data),
    error: (msg: string, err?: unknown) => logger.error(`[${actionName}] ${msg}`, err),
    devDebug: (msg: string, data?: unknown) => logger.devDebug(`[${actionName}] ${msg}`, data),
  };
}
