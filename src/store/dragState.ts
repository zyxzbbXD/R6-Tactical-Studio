/**
 * Module-level drag state — shared between Sidebar (drag source) and
 * MainCanvas (drop target). Using this instead of dataTransfer.getData()
 * avoids WKWebView's unreliable handling of custom MIME types.
 */
export const dragState = {
  operator: null as null | { operatorId: string; iconPath: string; name: string; side: "atk" | "def" | "neutral" },
};
