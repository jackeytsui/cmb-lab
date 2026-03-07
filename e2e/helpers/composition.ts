import type { Page } from "@playwright/test";

/**
 * Simulates Chinese IME text input via composition events.
 *
 * Browsers handle CJK input through a composition lifecycle:
 * compositionstart -> compositionupdate(s) -> compositionend -> input
 *
 * This helper dispatches those events in the correct order so that
 * React components relying on `onCompositionEnd` or `isComposing`
 * behave the same way they would with a real IME.
 *
 * @example
 * ```ts
 * await typeChineseText(page, '[data-testid="chinese-input"]', '\u4f60\u597d', [
 *   'ni',   // pinyin typed so far
 *   'nih',
 *   'niha',
 *   'nihao',
 * ]);
 * ```
 */
export async function typeChineseText(
  page: Page,
  selector: string,
  finalText: string,
  intermediateSteps: string[] = [],
): Promise<void> {
  const element = page.locator(selector);
  await element.click();

  await element.evaluate((el: HTMLInputElement) => {
    el.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
  });

  for (const step of intermediateSteps) {
    await element.evaluate(
      (el: HTMLInputElement, data: string) => {
        el.dispatchEvent(
          new CompositionEvent("compositionupdate", {
            bubbles: true,
            data,
          }),
        );
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            data,
            isComposing: true,
            inputType: "insertCompositionText",
          }),
        );
      },
      step,
    );
  }

  await element.evaluate(
    (el: HTMLInputElement, data: string) => {
      el.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data,
        }),
      );

      // Set the value using the native setter so React picks up the change
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(el, data);
      } else {
        el.value = data;
      }

      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data,
          isComposing: false,
          inputType: "insertCompositionText",
        }),
      );
    },
    finalText,
  );
}
