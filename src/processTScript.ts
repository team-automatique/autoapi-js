import ts from "typescript";
import { js as beautify } from "js-beautify";
import assert from "assert";
import del from "del";
import { functions, packages, getHeader } from "./shared";
import fs from "fs";
import path from "path";

/** buildProgram
 *
 * @param {string} root the root directory to an existing workspace
 * @return {ts.Program} an in-memory, type-checked TypeScript program
 */
export function buildProgram(
  root: string
): { program: ts.Program; root: string } {
  if (!fs.existsSync(root)) {
    throw new Error(`Unable to find provided directory ${root}`);
  }
  if (!fs.existsSync(path.join(root, "index.ts"))) {
    throw new Error("No index.ts found in provided directory");
  }
  const options = ts.getDefaultCompilerOptions();
  const host = ts.createCompilerHost(options, true);
  const program = ts.createProgram(
    [path.join(root, "index.ts")],
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
  return { program, root };
}

export function buildProgramInMemory(
  raw: string,
  packages: packages
): { program: ts.Program; root: string } {
  // TODO:
  const options = ts.getDefaultCompilerOptions();
  const host = ts.createCompilerHost(options, true);
  const tempDir = fs.mkdtempSync("builder");
  fs.writeFileSync(path.join(tempDir, "index.ts"), raw);
  const program = ts.createProgram(
    [path.join(tempDir, "index.ts")],
    options,
    host
  );
  // Remove temp Directory from the filesystem
  del.sync(tempDir);
  // Check to ensure that valid TypeScript is passed into the program
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length !== 0) {
    throw new Error(
      "Failed to compile typescript module: " +
        diagnostics.map((m) => m.messageText).join("\n")
    );
  }
  return { program, root: tempDir };
}

/**
 * extractPublicFunctions
 *
 * Checks to ensure that the provided script raw is valid Typescript, and
 * strips out all functions from the top level, returning those which are
 * marked in @param functions
 *
 * @throws if functions requested in functions are missing from the raw script
 *
 * @param {ts.SourceFile} sourceFile
 * @param {functions} functions
 * @return {ts.FunctionDeclaration[]}
 */
function extractPublicFunctions(
  sourceFile: ts.SourceFile,
  functions: functions
) {
  const parsedFunctions: string[] = [];
  assert(sourceFile);
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

function generatePackageJSON(packages: packages, devPackages: packages) {
  return JSON.stringify(
    {
      name: "generator-js",
      version: "1.0.0",
      description: "",
      main: "dist/index.js",
      scripts: {
        prepare: "tsc",
        test: 'echo "Error: no test specified" && exit 1',
      },
      author: "",
      license: "ISC",
      dependencies: packages,
      devDependencies: devPackages,
    },
    null,
    2
  );
}

function generateTsconfig() {
  return JSON.stringify(
    {
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
      // include: ["./src/**/*", "./index.ts"],
      // exclude: ["./tests/**/*"],
    },
    null,
    2
  );
}

function generateJSDoc(
  path: string,
  method: "post" | "get",
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  checker: ts.TypeChecker
): string {
  const params = parameters.map(
    (f) =>
      ` * @apiParam {${checker.typeToString(
        checker.getTypeAtLocation(f)
      )}} ${f.name.getText()}`
  );
  return `/**
 * @api {${method}} ${path}
 *
${params.join("\n")}
 * 
 */\n`;
}

function convertFuncToRoute(
  func: ts.FunctionDeclaration,
  checker: ts.TypeChecker
): string {
  let rt = checker.typeToString(checker.getTypeAtLocation(func));
  rt = rt.substr(rt.indexOf("=>") + 3);
  let response = "";
  let method: "post" | "get" = "post";
  if (func.parameters.length === 0) {
    // Perform a GET request
    method = "get";
    response = `app.get('/${func.name!!.getText()}', (req, res) => {
      const response = ${func.name!!.getText()}();
      res.send(JSON.stringify(response));
      })`;
  } else {
    method = "post";
    const requestParams = func.parameters
      .map((f) => `body.${f.name.getText()}`)
      .join(", ");
    const typeAssertions = func.parameters
      .filter((f) => !f.questionToken && !f.initializer)
      .map((f) => {
        const paramType = checker.typeToString(checker.getTypeAtLocation(f));
        return `if(!body.${f.name.getText()})
          {
            res.status(400)
                .send(
                  { error: "Missing required parameter ${f.name.getText()}"}
                  );
            return;
          }`;
      });
    response = `app.post('/${func.name!!.getText()}', (req, res) => {
      const body = req.body;
      // Assert that required incoming arguments are all present
      ${typeAssertions.join("\n")}
      const response = ${func.name?.getText()}(${requestParams});
      res.send(JSON.stringify(response));
    });`;
  }
  // Generate API documentation
  return (
    generateJSDoc(
      "/" + func.name!!.getText(),
      method,
      func.parameters,
      checker
    ) + response
  );
}

export default function buildTSExpress(
  input: { memory: true; raw: string } | { memory: false; root: string },
  functions: functions,
  packages: packages
) {
  const { program, root } = input.memory
    ? buildProgramInMemory(input.raw, packages)
    : buildProgram(input.root);
  const sourceFile = program.getSourceFile(path.join(root, "index.ts"));
  assert(sourceFile);
  const typeChecker = program.getTypeChecker();
  const processed = extractPublicFunctions(sourceFile, functions);
  // Check if all items can be represented as a GET request (ie no args)
  const allGet = processed.every((p) => p.parameters.length === 0);
  if (!allGet) {
    packages["body-parser"] = "latest";
  }
  const packageJSON = generatePackageJSON(
    {
      ...packages,
      express: "~4",
      "@types/express": "~4",
      "is-promise": "^4",
    },
    { typescript: "latest" }
  );
  let response = getHeader();
  response += "// Setup server to send API routes\n";
  response += 'import express from "express";\n';
  response += "const app = express();\n";
  if (!allGet) {
    response += `// Add body parser for receiving POST requests
      const bodyParser = require('body-parser');
      app.use(bodyParser.json());\n`;
  }
  // Sort all exported functions to allow for correct insertion of functions
  processed.sort((e1, e2) => e1.pos - e2.pos);
  const source = sourceFile.getText();
  let prevPos = 0;
  processed.forEach((func) => {
    response += "\n" + source.substring(prevPos, func.end) + "\n";
    const c = (<any>func).jsDoc;
    const taget = ts.getJSDocTags(func);
    const newRoute = convertFuncToRoute(func, typeChecker);
    prevPos = func.end;
    response += newRoute;
  });
  response += source.substring(prevPos);
  // Add action to listen on local host
  response +=
    "app.listen(3000, () => console.log('API listening at http://localhost:3000'));";
  return {
    index: beautify(response),
    packageJSON,
    tsConfig: generateTsconfig(),
  };
}
