/**
 * 日期处理工具函数
 * 用于前后端日期格式转换、日期验证和格式化
 */

/**
 * 将ISO 8601日期字符串转换为yyyy-MM-dd格式
 * @param dateStr ISO 8601日期字符串（如：2025-12-01T00:00:00）
 * @returns yyyy-MM-dd格式的日期字符串
 */
export const formatDateToInput = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return '';
  
  try {
    // 如果是日期对象，先转换为字符串
    const dateString = typeof dateStr === 'string' ? dateStr : dateStr.toISOString();
    
    // 提取日期部分（yyyy-MM-dd）
    return dateString.split('T')[0];
  } catch (error) {
    console.error('日期格式转换失败:', error);
    return '';
  }
};

/**
 * 将前端输入的yyyy-MM-dd格式转换为ISO 8601格式
 * @param dateStr yyyy-MM-dd格式的日期字符串
 * @returns ISO 8601格式的日期字符串（如：2025-12-01T00:00:00.000Z）
 */
export const formatDateToApi = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  
  try {
    // 验证日期格式是否为yyyy-MM-dd
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) {
      throw new Error('日期格式不正确，应为yyyy-MM-dd');
    }
    
    // 创建日期对象并转换为ISO格式
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('无效的日期');
    }
    
    return date.toISOString();
  } catch (error) {
    console.error('日期格式转换失败:', error);
    return null;
  }
};

/**
 * 验证日期格式是否为yyyy-MM-dd
 * @param dateStr 待验证的日期字符串
 * @returns 是否为有效的yyyy-MM-dd格式
 */
export const isValidDateFormat = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false;
  
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }
  
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

/**
 * 比较两个日期的大小
 * @param date1 第一个日期字符串（yyyy-MM-dd格式）
 * @param date2 第二个日期字符串（yyyy-MM-dd格式）
 * @returns 1: date1 > date2, 0: date1 === date2, -1: date1 < date2
 */
export const compareDates = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    throw new Error('无效的日期格式');
  }
  
  if (d1 > d2) return 1;
  if (d1 < d2) return -1;
  return 0;
};

/**
 * 格式化日期为指定格式
 * @param date 日期对象或字符串
 * @param format 格式化模板（如：yyyy-MM-dd HH:mm:ss）
 * @returns 格式化后的日期字符串
 */
export const formatDate = (date: Date | string, format: string = 'yyyy-MM-dd'): string => {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(d.getTime())) {
      throw new Error('无效的日期');
    }
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
      .replace('yyyy', String(year))
      .replace('MM', month)
      .replace('dd', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  } catch (error) {
    console.error('日期格式化失败:', error);
    return '';
  }
};

/**
 * 获取当前日期的yyyy-MM-dd格式
 * @returns 当前日期的yyyy-MM-dd格式字符串
 */
export const getCurrentDate = (): string => {
  return formatDate(new Date(), 'yyyy-MM-dd');
};

/**
 * 日期加减操作
 * @param date 基础日期（yyyy-MM-dd格式）
 * @param days 加减的天数（正数为加，负数为减）
 * @returns 计算后的日期（yyyy-MM-dd格式）
 */
export const addDays = (date: string, days: number): string => {
  try {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return formatDate(d, 'yyyy-MM-dd');
  } catch (error) {
    console.error('日期计算失败:', error);
    return date;
  }
};

/**
 * 验证日期是否在指定范围内
 * @param date 待验证日期（yyyy-MM-dd格式）
 * @param minDate 最小日期（yyyy-MM-dd格式，可选）
 * @param maxDate 最大日期（yyyy-MM-dd格式，可选）
 * @returns 是否在范围内
 */
export const isDateInRange = (date: string, minDate?: string, maxDate?: string): boolean => {
  if (!isValidDateFormat(date)) {
    return false;
  }
  
  const d = new Date(date);
  
  if (minDate && isValidDateFormat(minDate)) {
    const min = new Date(minDate);
    if (d < min) {
      return false;
    }
  }
  
  if (maxDate && isValidDateFormat(maxDate)) {
    const max = new Date(maxDate);
    if (d > max) {
      return false;
    }
  }
  
  return true;
};
