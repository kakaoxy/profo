import { describe, it, expect } from "vitest";
import {
  detectMediaType,
  isVideoFile,
  isImageFile,
  VIDEO_EXTENSIONS,
  IMAGE_EXTENSIONS,
} from "./media-utils";

describe("detectMediaType", () => {
  it("应识别图片文件", () => {
    expect(detectMediaType("photo.jpg")).toBe("image");
    expect(detectMediaType("photo.jpeg")).toBe("image");
    expect(detectMediaType("photo.png")).toBe("image");
    expect(detectMediaType("photo.gif")).toBe("image");
    expect(detectMediaType("photo.webp")).toBe("image");
    expect(detectMediaType("photo.bmp")).toBe("image");
  });

  it("应识别视频文件", () => {
    expect(detectMediaType("video.mp4")).toBe("video");
    expect(detectMediaType("video.webm")).toBe("video");
    expect(detectMediaType("video.ogg")).toBe("video");
    expect(detectMediaType("video.mov")).toBe("video");
    expect(detectMediaType("video.avi")).toBe("video");
    expect(detectMediaType("video.mkv")).toBe("video");
  });

  it("未知扩展名应返回 undefined", () => {
    expect(detectMediaType("file.txt")).toBeUndefined();
    expect(detectMediaType("file.pdf")).toBeUndefined();
    expect(detectMediaType("file.doc")).toBeUndefined();
  });

  it("null 应返回 undefined", () => {
    expect(detectMediaType(null)).toBeUndefined();
  });

  it("undefined 应返回 undefined", () => {
    expect(detectMediaType(undefined)).toBeUndefined();
  });

  it("应忽略大小写", () => {
    expect(detectMediaType("photo.JPG")).toBe("image");
    expect(detectMediaType("video.MP4")).toBe("video");
  });

  it("带查询参数的 URL 应正确识别", () => {
    expect(detectMediaType("photo.png?v=1")).toBeUndefined();
    expect(detectMediaType("photo.png?size=large")).toBeUndefined();
  });
});

describe("isVideoFile", () => {
  it("应识别视频文件扩展名", () => {
    for (const ext of VIDEO_EXTENSIONS) {
      expect(isVideoFile(`video${ext}`)).toBe(true);
    }
  });

  it("非视频文件应返回 false", () => {
    expect(isVideoFile("photo.jpg")).toBe(false);
    expect(isVideoFile("file.txt")).toBe(false);
  });

  it("null 应返回 false", () => {
    expect(isVideoFile(null)).toBe(false);
  });

  it("undefined 应返回 false", () => {
    expect(isVideoFile(undefined)).toBe(false);
  });

  it("应忽略大小写", () => {
    expect(isVideoFile("video.MP4")).toBe(true);
    expect(isVideoFile("video.WebM")).toBe(true);
  });
});

describe("isImageFile", () => {
  it("应识别图片文件扩展名", () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(isImageFile(`photo${ext}`)).toBe(true);
    }
  });

  it("非图片文件应返回 false", () => {
    expect(isImageFile("video.mp4")).toBe(false);
    expect(isImageFile("file.txt")).toBe(false);
  });

  it("null 应返回 false", () => {
    expect(isImageFile(null)).toBe(false);
  });

  it("undefined 应返回 false", () => {
    expect(isImageFile(undefined)).toBe(false);
  });

  it("应忽略大小写", () => {
    expect(isImageFile("photo.JPG")).toBe(true);
    expect(isImageFile("photo.Png")).toBe(true);
  });
});
