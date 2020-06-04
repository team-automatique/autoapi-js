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
  checker: ts.TypeChecker,
  doc?: ts.JSDoc
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
  const rtValues = checker
    .getTypeAtLocation(func)
    .getCallSignatures()[0]
    .getReturnType();
  const rtypes = rtValues.isUnionOrIntersection()
    ? rtValues.types.map((t) => checker.typeToString(t))
    : [checker.typeToString(rtValues)];
  const hasPromise = rtypes.filter((f) => f.match(/^Promise<.*>$/)).length > 0;
  let response = "";
  let method: "post" | "get" = "post";
  const params = func.parameters.map((param) => {
    const ptypeRaw = checker.getTypeAtLocation(param);
    const types = ptypeRaw.isUnionOrIntersection()
      ? ptypeRaw.types.map((t) => checker.typeToString(t))
      : [checker.typeToString(ptypeRaw)];
    types.forEach((t) => {
      if (t.match(/^Promise<.*>$/))
        throw new Error("Cannot accept a promise as the input to an API");
    });
    return {
      required: !param.questionToken && !param.initializer,
      name: param.name.getText(),
      types,
      inlineable: types.every((t) => t.match("number") || t.match("string")),
      inlined: false,
    };
  });
  // Perform a GET request
  if (params.length < 2 && params.every((p) => p.inlineable)) {
    method = "get";
    params.forEach((p) => (p.inlined = true));
  }
  response += `app.${method}('${path}', (req, res) => {`;
  // Build local variables and check for existance
  response += params
    .map((p) => {
      let variable = `const ${p.name}: any = ${
        p.inlined ? "req.query" : "req.body"
      }.${p.name};\n`;
      if (p.required) {
        variable += `if(!${p.name}){
        res.status(400).send({error: "Missing parameter ${p.name}"});
        return;}\n`;
      }
      return variable;
    })
    .join("\n");
  // Execute function
  let body = `const response = ${funcAlias}(${params
    .map((p) => p.name)
    .join(", ")});\n`;
  if (hasPromise) {
    body += `if(isPromise(response))
       response.then(r => res.send(r))
              .catch(e => res.status(500).send({
                  error: process.env.DEBUG == "true" ?
                    e.stack : 'An error occurred'})); 
      else res.send(response);`;
  } else {
    body += "res.send(response);";
  }
  body =
    "try{ " +
    body +
    `} catch(e){ if(process.env.DEBUG == "true")
      res.status(500).send({error: e.stack});
     else res.status(500).send({error: 'An unknown error occurred'});}`;
  response += body;
  response += "});";
  // Generate API documentation
  return (
    generateJSDoc(path, method, func.parameters, checker, (<any>func).jsDoc) +
    response
  );
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

/** buildRoutes - recursively build API routes
 *
 * @param {exportMap} exports
 * @param {string} basePath
 * @param {ts.TypeChecker} checker
 * @return {string} Express routes constructed from the exportMap
 */
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

export default function buildTSExpress(
  root: string,
  file: string,
  newSource: string = file
) {
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
  packageJSON.dependencies = {
    "body-parser": "latest",
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
  response += `import __API from './${newSource.substring(
    0,
    newSource.lastIndexOf(".")
  )}'\n`;
  response += "// Setup server to send API routes\n";
  response += 'import express from "express";\n';
  response += "import isPromise from 'is-promise';\n";
  response += "import bodyParser from 'body-parser'\n";
  response += "const app = express();\n";
  response += "app.use(bodyParser.json());\n\n";
  response += routes;
  // Add action to listen on local host
  response +=
    "\napp.listen(3000, () => console.log('API listening at http://localhost:3000'));";
  return {
    index: beautify(response),
    packageJSON: JSON.stringify(packageJSON, null, 2),
    tsConfig: JSON.stringify(generateTsconfig(), null, 2),
  };
}
