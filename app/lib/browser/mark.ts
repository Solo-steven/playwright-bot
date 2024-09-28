import { Page } from "@playwright/test";
import { INJECT_TEST_ID_KEY, BOX_ID_PREIFX } from "~/lib/type";

export async function markPage(page: Page) {
  return await page.evaluate(
    ({ injectKey: key, boxPrfix: prefix }) => {
      const allElements = Array.from(document.querySelectorAll("*"));
      let items = allElements
        .map((element) => {
          const vw = Math.max(
            document.documentElement.clientWidth || 0,
            window.innerWidth || 0,
          );
          const vh = Math.max(
            document.documentElement.clientHeight || 0,
            window.innerHeight || 0,
          );

          const rects = [...element.getClientRects()]
            .filter((bb) => {
              const center_x = bb.left + bb.width / 2;
              const center_y = bb.top + bb.height / 2;
              const elAtCenter = document.elementFromPoint(center_x, center_y);

              return elAtCenter === element || element.contains(elAtCenter);
            })
            .map((bb) => {
              const rect = {
                left: Math.max(0, bb.left),
                top: Math.max(0, bb.top),
                right: Math.min(vw, bb.right),
                bottom: Math.min(vh, bb.bottom),
              };
              return {
                ...rect,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
              };
            });

          const area = rects.reduce((acc, rect) => acc + rect.width * rect.height, 0);

          return {
            element: element,
            include:
              element.tagName === "INPUT" ||
              element.tagName === "TEXTAREA" ||
              element.tagName === "SELECT" ||
              element.tagName === "BUTTON" ||
              element.tagName === "A" ||
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (element as any).onclick != null ||
              window.getComputedStyle(element).cursor == "pointer" ||
              element.tagName === "IFRAME" ||
              element.tagName === "VIDEO",
            area,
            rects,
            text: element.textContent?.trim().replace(/\s{2,}/g, " "),
          };
        })
        .filter((item) => item.include && item.area >= 20);

      // Only keep inner clickable items
      items = items.filter(
        (x) => !items.some((y) => x.element.contains(y.element) && !(x == y)),
      );

      // Lets create a floating border on top of these elements that will always be visible
      items.forEach(function (item, index) {
        item.element.setAttribute(key, index.toString());
        item.rects.forEach((bbox) => {
          const borderColor = `hsl(${Math.random() * 360}, 100%, 25%)`;
          const textColor = `white`;

          const newElement = document.createElement("div");
          newElement.id = `${prefix}-${index}`;
          newElement.style.outline = `2px dashed ${borderColor}`;
          newElement.style.position = "fixed";
          newElement.style.left = bbox.left + "px";
          newElement.style.top = bbox.top + "px";
          newElement.style.width = bbox.width + "px";
          newElement.style.height = bbox.height + "px";
          newElement.style.pointerEvents = "none";
          newElement.style.boxSizing = "border-box";
          newElement.style.zIndex = "2147483647";
          // newElement.style.background = `${borderColor}80`;

          // Add floating label at the corner
          const label = document.createElement("span");
          label.textContent = index.toString();
          label.style.position = "absolute";
          label.style.top = `-${Math.min(19, bbox.top)}px`;
          label.style.left = "0px";
          label.style.background = borderColor;
          label.style.color = textColor;
          label.style.padding = "2px 4px";
          label.style.fontSize = "14px";
          label.style.fontFamily = "monospace";
          label.style.borderRadius = "2px";
          newElement.appendChild(label);

          document.body.appendChild(newElement);
          // item.element.setAttribute("-ai-label", label.textContent);
        });
      });
      return items.length;
    },
    {
      injectKey: INJECT_TEST_ID_KEY,
      boxPrfix: BOX_ID_PREIFX,
    },
  );
}

export async function clearMark(page: Page, indexs: number) {
  const isOk = await page.evaluate(
    ({ indexs, boxPrefix }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isOkCur: any = {};

      for (let index = 0; index < indexs; ++index) {
        const ele = document.getElementById(`${boxPrefix}-${index}`);
        if (!ele) {
          continue;
        }
        ele?.parentNode?.removeChild(ele);
      }
      return isOkCur;
    },
    { indexs, boxPrefix: BOX_ID_PREIFX },
  );
  return isOk;
}
