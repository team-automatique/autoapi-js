import ts from "typescript";
import { js as beautify } from "js-beautify";
import assert from "assert";
import { getHeader } from "./shared";
import fs from "fs";
import path from "path";

/** buildProgram
 *
 * @param {string} root the root directory to an existing workspace
 * @param {string} file the file which to parse
 * @return {ts.Program} an in-memory, type-checked TypeScript program
 */
export function buildProgram(
  root: string,
  file: string
): { program: ts.Program; root: string } {
  if (!fs.existsSync(root)) {
    throw new Error(`Unable to find provided directory ${root}`);
  }
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`No such file ${file} found in provided directory`);
  }
  const options = ts.getDefaultCompilerOptions();
  const host = ts.createCompilerHost(options, true);
  const program = ts.createProgram([path.join(root, file)], options, host);
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

interface packageJSON {
  name: string;
  version: string;
  description: string;
  main: "dist/index.js";
  scripts: {
    prepare: "tsc";
    test: 'echo "Error: no test specified" && exit 1';
  };
  author: string;
  license: string;
  dependencies: { [propName: string]: string };
  devDependencies: { [propName: string]: string };
}

function generateTsconfig() {
  return {
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
  };
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
/** convertFuncToRoute - Turn a ts.FunctionDeclaration into a string snippet
 * The resulting string from this function is an API route (for an express
 * server) which calls the function in question. It also performs some checking
 * to prevent missing arguments
 *
 * @param {ts.FunctionDeclaration} func
 * @param {string} funcAlias
 * @param {string} path
 * @param {ts.TypeChecker} checker
 * @return {string} function as an API route for an express server
 */
function convertFuncToRoute(
  func: ts.FunctionDeclaration,
  funcAlias: string,
  path: string,
  checker: ts.TypeChecker
): string {
  let rt = checker.typeToString(checker.getTypeAtLocation(func));
  rt = rt.substr(rt.indexOf("=>") + 3);
  let response = "";
  let method: "post" | "get" = "post";
  if (func.parameters.length === 0) {
    // Perform a GET request
    method = "get";
    response = `app.get('${path}', (req, res) => {
      const response = ${funcAlias}();
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
    response = `app.post('${path}', (req, res) => {
      const body = req.body;
      // Assert that required incoming arguments are all present
      ${typeAssertions.join("\n")}
      const response = ${funcAlias}(${requestParams});
      res.send(JSON.stringify(response));
    });`;
  }
  // Generate API documentation
  return generateJSDoc(path, method, func.parameters, checker) + response;
}

function buildTSProgram(
  root: string,
  file: string
): {
  program: ts.Program;
  packageJSON: packageJSON;
} {
  if (!fs.existsSync(path.join(root, "package.json"))) {
    throw new Error("Unable to find a package.json in the root directory");
  }
  const packageJSON = JSON.parse(
    fs.readFileSync(path.join(root, "package.json")).toString()
  );
  const { program } = buildProgram(root, file);
  return { program, packageJSON };
}

interface exportMap {
  [key: string]:
    | { type: "exports"; exports: exportMap }
    | { type: "func"; func: ts.Node };
}

function grabExports(
  node: ts.Node,
  checker: ts.TypeChecker,
  name: string
): exportMap {
  // console.log(ts.SyntaxKind[node.kind]);
  if (ts.isExportAssignment(node)) {
    return grabExports(node.expression, checker, name);
  }
  if (ts.isObjectLiteralExpression(node)) {
    let result: exportMap = {};
    node.forEachChild((c) => {
      if (ts.isPropertyAssignment(c)) {
        result = {
          ...result,
          ...grabExports(c.initializer, checker, c.name.getText()),
        };
      }
      if (ts.isShorthandPropertyAssignment(c)) {
        checker.getShorthandAssignmentValueSymbol(c);
        result = {
          ...result,
          ...grabExports(
            checker.getShorthandAssignmentValueSymbol(c)!!.valueDeclaration,
            checker,
            c.name.getText()
          ),
        };
      }
    });
    return { [name]: { type: "exports", exports: result } };
  }
  if (ts.isVariableDeclaration(node)) {
    return grabExports(node.initializer!!, checker, name);
  }
  if (ts.isIdentifier(node)) {
    return grabExports(
      checker.getSymbolAtLocation(node)!!.valueDeclaration,
      checker,
      name
    );
  }
  if (ts.isArrowFunction(node)) {
    return { [name]: { func: node, type: "func" } };
  }
  if (ts.isFunctionDeclaration(node)) {
    return { [name]: { func: node, type: "func" } };
  }
  throw new Error(`Unrecognized operator ${ts.SyntaxKind[node.kind]}`);
}

function buildRoutes(
  exports: exportMap,
  basePath: string,
  checker: ts.TypeChecker
): string {
  const result = Object.keys(exports)
    .map((key) => {
      const exp = exports[key];
      if (exp.type === "exports") {
        return buildRoutes(exp.exports, basePath + "/" + key, checker);
      } else {
        const path = basePath + "/" + key;
        const alias = path.split("/").slice(1).join(".");
        return convertFuncToRoute(
          <any>exp.func,
          "__API." + alias,
          basePath + "/" + key,
          checker
        );
      }
    })
    .filter((f) => f)
    .join("\n\n");
  return result;
}

export default function buildTSExpress(root: string, file: string) {
  const { program, packageJSON } = buildTSProgram(root, file);
  const typeChecker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(path.join(root, file));
  assert(sourceFile);
  let exports: exportMap = {};
  let foundExports = false;
  sourceFile.forEachChild((c) => {
    if (ts.isExportAssignment(c)) {
      exports = grabExports(c, typeChecker, "");
      foundExports = true;
    }
  });
  if (!foundExports) {
    throw new Error(
      `Provided file ${file} has no default exports
Functions must be exported in order to build an API`
    );
  }
  const base = exports[""];
  const routes =
    base.type === "exports"
      ? buildRoutes(base.exports, "", typeChecker)
      : buildRoutes(exports, "", typeChecker);
  // console.log(routes);
  // // Check if all items can be represented as a GET request (ie no args)
  // const allGet = processed.every((p) => p.parameters.length === 0);
  // if (!allGet) {
  packageJSON.dependencies["body-parser"] = "latest";
  // }
  packageJSON.dependencies = {
    express: "~4",
    "@types/express": "~4",
    "is-promise": "^4",
    ...packageJSON.dependencies,
  };
  packageJSON.devDependencies = {
    typescript: "latest",
    ...packageJSON.devDependencies,
  };
  let response = getHeader();
  response += `import * as __API from './${file}'`;
  response += "// Setup server to send API routes\n";
  response += 'import express from "express";\n';
  response += "const app = express();\n";
  response += routes;
  // // Add action to listen on local host
  response +=
    "app.listen(3000, () => console.log('API listening at http://localhost:3000'));";
  return {
    index: beautify(response),
    packageJSON: JSON.stringify(packageJSON, null, 2),
    tsConfig: JSON.stringify(generateTsconfig(), null, 2),
  };
}
