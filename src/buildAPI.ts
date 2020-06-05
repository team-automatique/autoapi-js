import ts from "typescript";
import { js as beautify } from "js-beautify";
import assert from "assert";
import { getHeader } from "./shared";
import fs from "fs";
import path from "path";
import { packageJSON } from "./types";
/** buildProgram
 *
 * @param {string} root the root directory to an existing workspace
 * @param {string} file the file which to parse
 * @param {boolean} js a boolean whether or not the funcions are in JavaScript
 * @return {ts.Program} an in-memory, type-checked TypeScript program
 */
export function buildProgram(
  root: string,
  file: string,
  js: boolean
): ts.Program {
  if (!fs.existsSync(root)) {
    throw new Error(`Unable to find provided directory ${root}`);
  }
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`No such file ${file} found in provided directory`);
  }
  const options = ts.getDefaultCompilerOptions();
  options.allowJs = js;
  options.outDir = "__api";
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
  return program;
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

interface routeData {
  type: "func";
  doc: string;
  params: { id: string; optional: boolean; inline: boolean; type: any }[];
  method: "get" | "post";
  path: string;
  returnType: string[];
}
interface multiRoute {
  [propName: string]:
    | {
        type: "export";
        export: multiRoute;
      }
    | routeData;
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
): { code: string; route: routeData } {
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
      optional: !!param.questionToken || !!param.initializer,
      id: param.name.getText(),
      types,
      inlineable: types.every((t) => t.match("number") || t.match("string")),
      inline: false,
    };
  });
  // Perform a GET request
  if (params.length < 2 && params.every((p) => p.inlineable)) {
    method = "get";
    params.forEach((p) => (p.inline = true));
  }
  response += `app.${method}('${path}', (req, res) => {`;
  // Build local variables and check for existance
  response += params
    .map((p) => {
      let variable = `const ${p.id}: any = ${
        p.inline ? "req.query" : "req.body"
      }.${p.id};\n`;
      if (!p.optional) {
        variable += `if(!${p.id}){
        res.status(400).send({error: "Missing parameter ${p.id}"});
        return;}\n`;
      }
      return variable;
    })
    .join("\n");
  // Execute function
  let body = `const response = ${funcAlias}(${params
    .map((p) => p.id)
    .join(", ")});\n`;
  if (hasPromise) {
    body += `if(isPromise(response))
       response.then(r => res.send({response:r}))
              .catch(e => res.status(500).send({
                  error: process.env.DEBUG == "true" ?
                    e.stack : 'An error occurred'})); 
      else res.send({response});`;
  } else {
    body += "res.send({response});";
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
  const code =
    generateJSDoc(path, method, func.parameters, checker, (<any>func).jsDoc) +
    response;
  return {
    code,
    route: {
      type: "func",
      doc: (<any>func).jsDoc || "",
      method,
      path,
      returnType: rtypes,
      params: params.map((p) => ({
        id: p.id,
        inline: p.inline,
        type: p.types,
        optional: p.optional,
      })),
    },
  };
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
): { code: string; routes: multiRoute } {
  let code = "";
  const routes: multiRoute = {};
  Object.keys(exports).forEach((key) => {
    const exp = exports[key];
    if (exp.type === "exports") {
      const res = buildRoutes(exp.exports, basePath + "/" + key, checker);
      code += res.code;
      routes[key] = {
        type: "export",
        export: res.routes,
      };
    } else {
      const path = basePath + "/" + key;
      const alias = path.split("/").slice(1).join(".");
      const res = convertFuncToRoute(
        <any>exp.func,
        "__API." + alias,
        basePath + "/" + key,
        checker
      );
      code += res.code;
      routes[key] = res.route;
    }
  });
  return { code, routes };
}

interface buildOptions {
  language: "TypeScript" | "JavaScript";
  newSource?: string;
}

export default function buildExpress(
  root: string,
  file: string,
  options: buildOptions
) {
  options.newSource = options.newSource || file;
  // Assert the package.json exists
  if (!fs.existsSync(path.join(root, "package.json"))) {
    throw new Error("No package.json found in provided directory");
  }
  const packageJSON: packageJSON = JSON.parse(
    fs.readFileSync(path.join(root, "package.json")).toString()
  ); // Build program
  const program = buildProgram(root, file, options.language === "JavaScript");
  const typeChecker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(path.join(root, file));
  assert(sourceFile);

  // Grab exports (export default)
  let exports: exportMap = {};
  let foundExports = false;
  sourceFile.forEachChild((c) => {
    if (ts.isExportAssignment(c)) {
      if (foundExports)
        throw new Error("Multiple default export declarations found");
      exports = grabExports(c, typeChecker, "");
      foundExports = true;
    }
    if (
      ts.isExpressionStatement(c) &&
      ts.isBinaryExpression(c.expression) &&
      ts.isPropertyAccessExpression(c.expression.left) &&
      ts.isIdentifier(c.expression.left.expression) &&
      ts.isIdentifier(c.expression.left.name) &&
      c.expression.left.expression.text === "module" &&
      c.expression.left.name.text === "exports"
    ) {
      if (foundExports)
        throw new Error("Multiple default export declarations found");
      exports = grabExports(c.expression.right, typeChecker, "");
      foundExports = true;
    }
  });
  if (!foundExports) {
    throw new Error(
      `Provided file ${file} has no default exports
Functions must be exported in order to build an API`
    );
  }

  // Parse out and build routes
  const base = exports[""];
  const routes =
    base.type === "exports"
      ? buildRoutes(base.exports, "", typeChecker)
      : buildRoutes(exports, "", typeChecker);

  // Add dependencies for express
  packageJSON.dependencies = {
    "body-parser": "latest",
    express: "~4",
    "is-promise": "^4",
    ...packageJSON.dependencies,
  };
  // Add package depedencies if being compiled to TypeScript
  if (options.language == "TypeScript") {
    packageJSON.dependencies = {
      "@types/express": "~4",
      ...packageJSON.dependencies,
    };
    packageJSON.devDependencies = {
      typescript: "latest",
      ...packageJSON.devDependencies,
    };
  }
  let response = getHeader();

  // Differentiate imports when building for TypeScript or JavaScript
  if (options.language === "TypeScript") {
    response += `import __API from './${options.newSource.substring(
      0,
      options.newSource.lastIndexOf(".")
    )}'\n`;
    response += 'import express from "express";\n';
    response += "import isPromise from 'is-promise';\n";
    response += "import bodyParser from 'body-parser'\n";
  } else {
    // Use commonjs imports for JavaScript
    response += `const __API = require("./${options.newSource.substring(
      0,
      options.newSource.lastIndexOf(".")
    )}");\n`;
    response += 'const express = require("express");\n';
    response += 'const isPromise = require("is-promise");\n';
    response += 'const bodyParser = require("body-parser");\n';
  }

  response += "const app = express();\n";
  response += "app.use(bodyParser.json());\n\n";
  response += routes.code;
  // Add action to listen on local host
  response +=
    "\napp.listen(3000, () => console.log('API listening at http://localhost:3000'));";
  const tsConfig = options.language === "TypeScript" ? generateTsconfig() : {};
  return {
    index: beautify(response),
    packageJSON,
    tsConfig,
    routeData: routes.routes,
  };
}
