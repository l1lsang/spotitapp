import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { requireStorage } from "../lib/firebase";
import {
  DISPLAY_MAX_PX,
  DISPLAY_QUALITY,
  PRINT_MAX_PX,
  PRINT_QUALITY,
  THUMBNAIL_MAX_PX,
  needsPrintCopy,
  printPathFor,
} from "../lib/photoPrint";
import type { PostPhotoPrint } from "../types/post";
export interface UploadPhoto {
  uri: string;
  name?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  size?: number;
}
// Firebase wraps the upload in `new Blob([header, data, footer])`. React Native's Blob
// cannot be built from an ArrayBuffer or Uint8Array ("Creating blobs from 'ArrayBuffer'
// and 'ArrayBufferView' are not supported"), so phones hand over a native Blob read
// from the file, which React Native can combine with the string parts.
function readNativeBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.onload = () => resolve(request.response as Blob);
    request.onerror = () => reject(new Error("사진 파일을 읽지 못했습니다. 다시 시도해 주세요."));
    request.responseType = "blob";
    request.open("GET", uri, true);
    request.send(null);
  });
}
// Each copy is encoded once from the picked photo, never from another copy.
async function encodeJpeg(
  photo: UploadPhoto,
  maxDimension: number,
  compress: number,
) {
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (
    photo.width &&
    photo.height &&
    Math.max(photo.width, photo.height) > maxDimension
  ) {
    ctx.resize(
      photo.width > photo.height
        ? { width: maxDimension }
        : { height: maxDimension },
    );
  }
  const rendered = await ctx.renderAsync();
  return rendered.saveAsync({ compress, format: SaveFormat.JPEG });
}
async function uploadJpeg(path: string, uri: string) {
  const data =
    Platform.OS === "web"
      ? new Uint8Array(await (await fetch(uri)).arrayBuffer())
      : await readNativeBlob(uri);
  try {
    const snapshot = await uploadBytes(
      ref(requireStorage(), path),
      data,
      {
        contentType: "image/jpeg",
        cacheControl: "private,max-age=31536000,immutable",
      },
    );
    return getDownloadURL(snapshot.ref);
  } finally {
    // React Native keeps a native Blob's memory until it is closed.
    (data as Blob & { close?: () => void }).close?.();
  }
}
const newPhotoName = () => `${Date.now()}-${randomUUID()}.jpg`;
async function uploadImage(
  folder: string,
  photo: UploadPhoto,
  maxDimension = DISPLAY_MAX_PX,
  compress = 0.84,
  name = newPhotoName(),
) {
  const result = await encodeJpeg(photo, maxDimension, compress);
  return uploadJpeg(`${folder}/${name}`, result.uri);
}
/**
 * The private print copy of a record photo, stored beside its display copy. It is an
 * extra: a photo too small to need one, or a failed upload, leaves the record as it
 * was, and books fall back to the display copy.
 */
async function uploadPrintCopy(
  folder: string,
  name: string,
  photo: UploadPhoto,
): Promise<{ width: number; height: number } | null> {
  if (!needsPrintCopy(photo.width, photo.height)) return null;
  try {
    const result = await encodeJpeg(photo, PRINT_MAX_PX, PRINT_QUALITY);
    if (!needsPrintCopy(result.width, result.height)) return null;
    await uploadJpeg(printPathFor(`${folder}/${name}`), result.uri);
    return { width: result.width, height: result.height };
  } catch (error) {
    if (__DEV__) console.warn("인쇄용 사진을 올리지 못했습니다.", error);
    return null;
  }
}
export async function uploadPostPhotosWithThumbnails(
  uid: string,
  postId: string,
  files: UploadPhoto[],
) {
  const folder = `posts/${uid}/${postId}`;
  const photos = [];
  for (const file of files) {
    const name = newPhotoName();
    photos.push(
      await Promise.all([
        uploadImage(folder, file, DISPLAY_MAX_PX, DISPLAY_QUALITY, name),
        uploadImage(folder, file, THUMBNAIL_MAX_PX, DISPLAY_QUALITY),
        uploadPrintCopy(folder, name, file),
      ]),
    );
  }
  return {
    photoUrls: photos.map((p) => p[0]),
    photoThumbnailUrls: photos.map((p) => p[1]),
    photoPrints: photos.flatMap(([url, , print]): PostPhotoPrint[] =>
      print ? [{ url, ...print }] : [],
    ),
  };
}
/**
 * The best source the owner has for re-editing a record photo: its print copy when
 * there is one, so editing does not shrink the photo to its display size.
 */
export async function bestEditSource(displayUrl: string): Promise<string> {
  try {
    const printPath = printPathFor(ref(requireStorage(), displayUrl).fullPath);
    return printPath
      ? await getDownloadURL(ref(requireStorage(), printPath))
      : displayUrl;
  } catch {
    return displayUrl;
  }
}
export async function uploadPostPhotos(
  uid: string,
  postId: string,
  files: UploadPhoto[],
) {
  return (await uploadPostPhotosWithThumbnails(uid, postId, files)).photoUrls;
}
export function uploadProfilePhoto(uid: string, file: UploadPhoto) {
  if (file.size && file.size > 5 * 1024 * 1024)
    throw new Error("프로필 사진은 5MB 이하로 선택해 주세요.");
  return uploadImage(`profiles/${uid}`, file, 384);
}
export function uploadChatPhoto(
  uid: string,
  chatId: string,
  file: UploadPhoto,
) {
  return uploadImage(`chats/${chatId}/${uid}`, file);
}
