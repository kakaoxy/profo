"use server";

/**
 * 通用文件上传 Action
 */
export async function uploadFileAction(formData: FormData) {
  try {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    const defaultUrl = "http://127.0.0.1:8000";
    const apiBase = (envUrl || defaultUrl).replace(/\/api\/v1\/?$/, "");
    const uploadUrl = `${apiBase}/api/v1/files/upload`;

    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      if (res.status === 413) {
        return { success: false, message: "文件大小超过服务器限制 (10MB)" };
      }

      const errorText = await res.text();
      console.error("❌ [Upload Action] Failed:", res.status, errorText);

      try {
        const errorJson = JSON.parse(errorText);
        return {
          success: false,
          message: errorJson.detail || `上传失败 (${res.status})`,
        };
      } catch {
        return { success: false, message: `上传失败 (${res.status})` };
      }
    }

    const json = await res.json();
    if (json.code !== 200) {
      return { success: false, message: json.msg || "上传被后端拒绝" };
    }

    return { success: true, data: json.data };
  } catch (e) {
    console.error("文件上传网络异常:", e);
    return { success: false, message: "网络连接错误，请检查后端服务是否启动" };
  }
}
