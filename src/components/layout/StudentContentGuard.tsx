"use client";

import { useEffect } from "react";

/**
 * Client-side download deterrent for student accounts.
 *
 * Mounted from the dashboard layout only when the viewer's role is
 * "student". It closes the easy save-a-copy paths on lesson content:
 *
 * - Blocks the right-click context menu everywhere (no "Save Video As…" /
 *   "Save Audio As…" / "Save Image As…"), except inside editable fields so
 *   students can still paste into inputs and textareas.
 * - Blocks dragging media out of the page (dragging a video/image to the
 *   desktop saves a copy).
 * - Forces `controlslist="nodownload"` and disables picture-in-picture on
 *   every <video>/<audio>, including ones rendered later, so the native
 *   control bar never offers a download button. A MutationObserver keeps
 *   this applied as players mount.
 *
 * This is a deterrent, not DRM: the media still streams to the browser and
 * a determined user can always capture it. The goal is to remove the
 * one-click paths.
 */

const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable=""], [contenteditable="true"]';

const MEDIA_SELECTOR = "video, audio";

function hardenMediaElement(el: Element) {
  if (!(el instanceof HTMLMediaElement)) return;
  const list = el.getAttribute("controlslist") ?? "";
  if (!/\bnodownload\b/.test(list)) {
    el.setAttribute("controlslist", `${list} nodownload`.trim());
  }
  if (el instanceof HTMLVideoElement) {
    el.disablePictureInPicture = true;
  }
}

function hardenTree(root: ParentNode) {
  if (root instanceof Element && root.matches(MEDIA_SELECTOR)) {
    hardenMediaElement(root);
  }
  root.querySelectorAll(MEDIA_SELECTOR).forEach(hardenMediaElement);
}

export function StudentContentGuard() {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(EDITABLE_SELECTOR)) {
        return;
      }
      event.preventDefault();
    };

    const onDragStart = (event: DragEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("video, audio, img, picture, svg")
      ) {
        event.preventDefault();
      }
    };

    hardenTree(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) hardenTree(node);
        });
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("dragstart", onDragStart, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("dragstart", onDragStart, true);
    };
  }, []);

  return null;
}
