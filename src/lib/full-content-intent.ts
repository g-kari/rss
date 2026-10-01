/** A one-use request from an explicit immersive read action; never a global preference. */
export interface FullContentIntent {
  requestId: number;
  articleId: string;
  link: string;
  target: "pane" | "overlay";
}
