import { apiFetch } from "./client";

export interface FeedbackImage {
  readonly name: string;
  readonly type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** Base64, no data: prefix. */
  readonly data: string;
}

export const sendFeedback = (input: {
  message: string;
  email?: string;
  page: string;
  images: readonly FeedbackImage[];
}) => apiFetch<{ ok: true }>("/feedback", { method: "POST", body: JSON.stringify(input) });

/**
 * A screenshot off a phone is 3–6MB; the email needs a few hundred KB. Drawn
 * onto a canvas no wider than 1600px and saved as JPEG, which also turns HEIC
 * and whatever else the picker hands over into something every inbox opens.
 */
export const shrinkImage = async (file: File): Promise<FeedbackImage> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.82);
  return { name: file.name, type: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
};
