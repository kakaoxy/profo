import { z } from "zod";

/**
 * 全站密码复杂度策略
 * - 至少 8 位
 * - 必须包含小写字母、大写字母、数字、特殊字符
 *
 * 引用方：
 * - use-user-form.ts::createSchema (创建/编辑用户)
 * - reset-password-dialog.tsx::schema (重置密码)
 * - admin/login/actions.ts::changePasswordAction (改密)
 * - (c)/register/actions.ts::registerInputSchema (注册)
 * - (c)/profile/actions.ts::updatePhoneSchema (修改手机号二次校验)
 */
export const passwordSchema = z
  .string()
  .min(8, "密码至少 8 个字符")
  .regex(/[a-z]/, "密码必须包含小写字母")
  .regex(/[A-Z]/, "密码必须包含大写字母")
  .regex(/\d/, "密码必须包含数字")
  .regex(/[^a-zA-Z0-9]/, "密码必须包含特殊字符");
