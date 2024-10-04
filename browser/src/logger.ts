export const Logger = {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(...args: any[]) {
    console.log("[Logger Info]:", ...args);
  },
};
