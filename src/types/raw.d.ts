/** `import text from "./file?raw"` — file contents as a string (webpack asset/source). */
declare module "*?raw" {
  const content: string;
  export default content;
}
