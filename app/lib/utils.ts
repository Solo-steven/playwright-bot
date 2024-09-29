import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createAborter(postAction?: () => void) {
  let flag = false;
  return {
    abort() {
      if (flag === false) {
        postAction?.();
      }
      flag = true;
    },
    getSingal() {
      return flag;
    },
  };
}

export async function waitInAsync(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, time);
  });
}
