export const getHeader = () =>
  `/*This is an automatic API generated by Automatique (https://automatique.dev)
Generated ${new Date()}*/\n`;

export const generateTSConfig = () => ({
  compilerOptions: {
    lib: [
      "ES2016",
      "DOM",
    ] /* Specify library files to be included in the compilation. */,
    declaration: true /* Generates corresponding '.d.ts' file. */,
    sourceMap: true /* Generates corresponding '.map' file. */,
    outDir: "./dist" /* Redirect output structure to the directory. */,
    strict: true /* Enable all strict type-checking options. */,
    moduleResolution: "node",
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
  },
});
