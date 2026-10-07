/**
 * 测试专用模块声明：vite/vitest 的 ?raw 导入（wxml/wxss 静态资源断言用）.
 *
 * tsconfig 的 types 仅含 miniprogram-api-typings（无 @types/node），
 * vite/client 不适合整包引入（会带 import.metaEnv 等运行时注入声明），
 * 这里只声明测试里实际用到的 ?raw 通配模块，避免全局类型污染。
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
