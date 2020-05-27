import ts from "typescript";
import { functions, packages, getHeader } from "./shared";

function processTScript(raw: string, functions: functions) {
  const options = ts.getDefaultCompilerOptions();
  const realHost = ts.createCompilerHost(options, true);

  const sourcePath = "/in-memory-file.ts";
  const sourceFile = ts.createSourceFile(
    sourcePath,
    raw,
    ts.ScriptTarget.Latest
  );

  const host: ts.CompilerHost = {
    fileExists: (filePath) =>
      filePath === sourcePath || realHost.fileExists(filePath),
    directoryExists:
      realHost.directoryExists && realHost.directoryExists.bind(realHost),
    getCurrentDirectory: realHost.getCurrentDirectory.bind(realHost),
    getDirectories: realHost.getDirectories!!.bind(realHost),
    getCanonicalFileName: (fileName) => realHost.getCanonicalFileName(fileName),
    getNewLine: realHost.getNewLine.bind(realHost),
    getDefaultLibFileName: realHost.getDefaultLibFileName.bind(realHost),
    getSourceFile: (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    ) => {
      if (fileName === sourcePath) {
        return sourceFile;
      } else {
        return realHost.getSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile
        );
      }
    },
    readFile: (filePath) =>
      filePath === sourcePath ? raw : realHost.readFile(filePath),
    useCaseSensitiveFileNames: () => realHost.useCaseSensitiveFileNames(),
    writeFile: () => {},
  };

  const rootNames = ["es2015"].map((lib) =>
    require.resolve(`typescript/lib/lib.${lib}.d.ts`)
  );
  const program = ts.createProgram(
    rootNames.concat([sourcePath]),
    options,
    host
  );
  // Check to ensure that valid TypeScript is passed into the program
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length !== 0) {
    throw new Error(
      "Failed to compile typescript module: " +
        diagnostics.map((m) => m.messageText).join("\n")
    );
  }

  const parsedFunctions: string[] = [];
  sourceFile.forEachChild((c) => {
    if (ts.isFunctionDeclaration(c)) {
      parsedFunctions.push(c.name!!.text);
    }
  });
  const missingFunctions = Object.keys(functions).filter(
    (k) => !parsedFunctions.includes(k)
  );
  if (missingFunctions.length !== 0) {
    throw new Error(
      `Failed to find all specified functions in the source code.
Missing (${missingFunctions.join(",")})`
    );
  }
  const functionsToBeAPId: ts.FunctionDeclaration[] = [];
  sourceFile.forEachChild((c) => {
    if (ts.isFunctionDeclaration(c) && c.name!!.text in functions) {
      functionsToBeAPId.push(c);
    }
  });
  return functionsToBeAPId;
}

function generatePackageJSON(packages: packages) {
  return JSON.stringify(
    {
      name: "generator-js",
      version: "1.0.0",
      description: "",
      main: "index.ts",
      scripts: {
        test: 'echo "Error: no test specified" && exit 1',
      },
      author: "",
      license: "ISC",
      dependencies: packages,
    },
    null,
    2
  );
}

function convertFuncToRoute(func: ts.FunctionDeclaration): string {
  return "app.get()\n";
}

export default function buildTSExpress(
  raw: string,
  functions: functions,
  packages: packages
) {
  const processed = processTScript(raw, functions);
  // Check if all items can be represented as a GET request (ie no args)
  const allGet = processed.every((p) => p.parameters.length === 0);
  if (!allGet) {
    packages["body-parser"] = "latest";
  }
  const packageJSON = generatePackageJSON({
    ...packages,
    express: "~4",
    "is-promise": "^4",
  });
  let response = getHeader();
  response += 'import express from "express";';
  // Sort all exported functions to allow for correct insertion of functions
  processed.sort((e1, e2) => e2.pos - e1.pos);
  let prevPos = 0;
  processed.forEach((func) => {
    response += "\n" + raw.substring(prevPos, func.end) + "\n";
    const newRoute = convertFuncToRoute(func);
    prevPos = func.end;
    response += newRoute;
  });
  response += raw.substring(prevPos);
  return { index: response, packageJSON };
}
