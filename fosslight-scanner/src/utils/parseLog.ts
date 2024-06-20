export const removeAnsiEscapeCodes = (str: string): string => {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
};
