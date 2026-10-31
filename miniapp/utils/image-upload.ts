/**
 * 小程序图片选择 + 上传公共工具（商户门店照片 / 拜访照片复用）.
 *
 * 复用现有 /public/files/upload（jpg/jpeg/png），401 时刷新 C 端令牌重试一次。
 * 返回 StorePhotoItem 结构，可直接写入门店/拜访 photos 字段。
 */
import type { components } from "../types/api-types";
import { BASE_URL } from "./config";
import { refreshCAccessToken } from "./request";
import { getAccessToken, getCAccessToken } from "./token";

export type MerchantPhoto = components["schemas"]["StorePhotoItem"];
export type MerchantPhotoType = "head" | "interior" | "other";

interface UploadResult {
  statusCode: number;
  data: string;
}

function uploadFile(filePath: string, token: string): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}/public/files/upload`,
      filePath,
      name: "file",
      header: { Authorization: `Bearer ${token}` },
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: reject,
    });
  });
}

/**
 * 上传任意允许类型文件（图片/PDF 等）并返回服务端 URL.
 *
 * 供协议签名图、盖章扫描件等非 chooseMedia 场景复用。
 */
export async function uploadFileToServer(filePath: string): Promise<string> {
  return uploadOne(filePath);
}

async function uploadOne(filePath: string): Promise<string> {
  let token = getCAccessToken() || getAccessToken();
  let res = await uploadFile(filePath, token);
  if (res.statusCode === 401) {
    const refreshed = await refreshCAccessToken();
    if (refreshed) {
      res = await uploadFile(filePath, refreshed);
    }
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error("图片上传失败");
  }
  const parsed = JSON.parse(res.data) as { url?: string };
  if (!parsed.url) {
    throw new Error("图片上传返回异常");
  }
  return parsed.url;
}

/**
 * 选择并上传图片（最多 remaining 张）.
 *
 * @param remaining 还可上传的张数
 * @param photoType 照片类型（门店门头/店内/拜访其他）
 */
export async function pickAndUploadPhotos(
  remaining: number,
  photoType: MerchantPhotoType = "other",
): Promise<MerchantPhoto[]> {
  if (remaining <= 0) {
    return [];
  }
  const chosen = await new Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult>(
    (resolve, reject) => {
      wx.chooseMedia({
        count: remaining,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: resolve,
        fail: reject,
      });
    },
  );

  const photos: MerchantPhoto[] = [];
  for (const file of chosen.tempFiles) {
    if (!/\.(jpe?g|png)$/i.test(file.tempFilePath)) {
      wx.showToast({ title: "仅支持 jpg/jpeg/png", icon: "none" });
      continue;
    }
    wx.showLoading({ title: "上传中", mask: true });
    try {
      const url = await uploadOne(file.tempFilePath);
      photos.push({
        file_url: url,
        photo_type: photoType,
        uploaded_at: new Date().toISOString(),
      });
    } finally {
      wx.hideLoading();
    }
  }
  return photos;
}
