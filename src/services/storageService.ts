import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { requireStorage } from "../lib/firebase";
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
async function uploadImage(
  folder: string,
  photo: UploadPhoto,
  maxDimension = 1600,
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
  const result = await rendered.saveAsync({
    compress: 0.84,
    format: SaveFormat.JPEG,
  });
  const data =
    Platform.OS === "web"
      ? new Uint8Array(await (await fetch(result.uri)).arrayBuffer())
      : await readNativeBlob(result.uri);
  try {
    const snapshot = await uploadBytes(
      ref(requireStorage(), `${folder}/${Date.now()}-${randomUUID()}.jpg`),
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
export async function uploadPostPhotosWithThumbnails(
  uid: string,
  postId: string,
  files: UploadPhoto[],
) {
  const photos = [];
  for (const file of files) {
    photos.push(
      await Promise.all([
        uploadImage(`posts/${uid}/${postId}`, file),
        uploadImage(`posts/${uid}/${postId}`, file, 480),
      ]),
    );
  }
  return {
    photoUrls: photos.map((p) => p[0]),
    photoThumbnailUrls: photos.map((p) => p[1]),
  };
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
