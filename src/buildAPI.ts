import ts, { TsConfigSourceFile } from "typescript";
import { js as beautify } from "js-beautify";
import assert, { deepStrictEqual } from "assert";
import { getHeader, generateTSConfig } from "./utils";
import fs from "fs";
import path from "path";
import {
  packageJSON,
  DocString,
  RouteData,
  BuildOptions,
  MultiRoute,
  FullType,
} from "./types";
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

function generateJSDoc(
  path: string,
  method: "post" | "get",
  parameters: { id: string; type: FullType }[],
  returnType: FullType,
  checker: ts.TypeChecker,
  docs?: ts.JSDoc[]
): { code: string; data: DocString } {
  const params: { [prop: string]: { type: FullType; comment: string } } = {};
  parameters.forEach((p) => (params[p.id] = { comment: "", type: p.type }));
  const response = {
    comment: "",
    params,
    return: { comment: "", type: returnType },
  };
  // Enrich with doc info from jsdoc
  if (docs && docs.length > 0) {
    const doc = docs[0];
    response.comment = doc.comment || "";
    doc.tags?.forEach((t) => {
      if (ts.isJSDocParameterTag(t) && t.name.getText() in response.params) {
        response.params[t.name.getText()].comment = t.comment || "";
      }
      if (ts.isJSDocReturnTag(t)) {
        response.return.comment = t.comment || "";
      }
    });
  }
  let paramsRaw = Object.keys(response.params)
    .map((key) => {
      const m = response.params[key];
      return ` * @apiParam {${m.type}} ${key} ${m.comment}`;
    })
    .join("\n");
  if (paramsRaw.length > 0) {
    paramsRaw = "\n" + paramsRaw;
  }
  const ret = response.return;
  const returnValue = ` * @apiReturn {${ret.type}} ${ret.comment}`;
  const code = `/**
 * @api {${method}} ${path}
 * ${response.comment.replace("\n", "\n * ")}
 * ${params}
${returnValue}
 */\n`;
  return { code, data: response };
}

function decompileType(
  type: ts.Type,
  checker: ts.TypeChecker,
  allowUnion: boolean,
  allowPromise: boolean = false
): FullType {
  // console.log(checker.typeToString(type));
  if (type.isUnion()) {
    // Resolve Union types
    const resolved = type.types.map((t) =>
      decompileType(t, checker, allowUnion)
    );
    const results = new Set<string>();
    resolved.forEach((r) => results.add(JSON.stringify(r)));
    const unpacked: FullType[] = [];
    results.forEach((r) => unpacked.push(JSON.parse(r)));
    if (unpacked.length === 1) return unpacked[0];
    if (!allowUnion)
      throw new Error(
        "Union types which cannot be coerced together are not supported"
      );
    return { type: "union", value: unpacked };
  }
  if (ts.TypeFlags.String === type.flags) {
    return { type: "string" };
  }
  if (type.isStringLiteral()) {
    return { type: "string" };
  }
  if (ts.TypeFlags.Number === type.flags) {
    return { type: "double" };
  }
  if (type.isNumberLiteral()) {
    return { type: "double" };
  }
  if (ts.TypeFlags.Void === type.flags) {
    return { type: "void" };
  }
  if (ts.TypeFlags.Null === type.flags) {
    return { type: "null" };
  }
  if (ts.TypeFlags.Undefined === type.flags) {
    return { type: "null" };
  }
  if (ts.TypeFlags.Boolean === type.flags) {
    return { type: "boolean" };
  }
  if (ts.TypeFlags.BooleanLiteral === type.flags) {
    return { type: "boolean" };
  }
  if (ts.TypeFlags.Object === type.flags) {
    if (type.symbol.name === "Promise") {
      if (!allowPromise)
        throw new Error(
          "Cannot have a nested Promise in an API param or return type"
        );
      const c = (type as ts.TypeReference).typeArguments!![0];
      return decompileType(c, checker, allowUnion);
    }
    if (type.symbol.name === "Array") {
      const c = decompileType(
        (type as ts.TypeReference).typeArguments!![0],
        checker,
        allowUnion
      );
      return { type: "array", value: c };
    }
    if (type.symbol.name === "Set") {
      const c = decompileType(
        (type as ts.TypeReference).typeArguments!![0],
        checker,
        allowUnion
      );
      return { type: "set", value: c };
    }
    if (type.symbol.name === "__object" || type.symbol.name === "__type") {
      const props = type.getProperties();
      const result: { [prop: string]: any } = {};
      props.forEach(
        (p) =>
          (result[p.name] = decompileType(
            checker.getTypeAtLocation(p.getDeclarations()!![0]),
            checker,
            allowUnion
          ))
      );
      return { type: "object", value: result };
    }
    throw new Error(`Cannot return symbol of type ${type.symbol.name}`);
  }
  throw new Error(`Type ${checker.typeToString(type)} is not supported!`);
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
): { code: string; route: RouteData } {
  let rtype;
  try {
    rtype = decompileType(
      checker.getTypeAtLocation(func).getCallSignatures()[0].getReturnType(),
      checker,
      false,
      true
    );
  } catch (e) {
    throw new Error(`Function ${funcAlias}:\n${e}`);
  }
  // console.log(rtype);
  const hasPromise = !!checker
    .typeToString(
      checker.getTypeAtLocation(func).getCallSignatures()[0].getReturnType()
    )
    .match(/^Promise<.*>$/);
  let method: "post" | "get" = "post";
  const params = func.parameters.map((param) => {
    const type = decompileType(
      checker.getTypeAtLocation(param),
      checker,
      true, // Union
      false // Promise
    );
    return {
      optional: !!param.questionToken || !!param.initializer,
      id: param.name.getText(),
      type,
      inlineable:
        type.type === "boolean" ||
        type.type === "string" ||
        type.type === "double",
      inline: false,
    };
  });
  // Perform a GET request
  if (params.length < 2 && params.every((p) => p.inlineable)) {
    method = "get";
    params.forEach((p) => (p.inline = true));
  }

  let response = `app.${method}('${path}', (req, res) => {\n`;
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
    body += `if(isPromise(response)){
       response.then(r => {
          res.send({response:r});
         })
        .catch(e => {
              res.status(500).send({
                error: process.env.DEBUG == "true" ?
                  e.stack : 'An error occurred'});
          })
        }
      else{
        res.send({response});
      }`;
  } else {
    body += "res.send({response});";
  }
  body =
    "try{ " +
    body +
    `} catch(e){ if(process.env.DEBUG == "true")
      res.status(500).send({error: e.stack});
     else res.status(500).send({error: 'An unknown error occurred'});
   }`;
  response += body;
  response += "});";

  // Generate API documentation
  const doc = generateJSDoc(
    path,
    method,
    params.map((p) => ({ id: p.id, type: p.type })),
    rtype,
    checker,
    (<any>func).jsDoc
  );

  return {
    code: doc.code + response,
    route: {
      type: "func",
      doc: doc.data,
      method,
      path,
      return: rtype,
      params: params.map((p) => ({
        id: p.id,
        inline: p.inline,
        type: p.type,
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
): { code: string; routes: MultiRoute } {
  let code = "";
  const routes: MultiRoute = {};
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

export default function buildExpress(
  root: string,
  file: string,
  options: BuildOptions
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
      options.language === "JavaScript" &&
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
    morgan: "^1.10.0",
    ...packageJSON.dependencies,
  };
  // Add package depedencies if being compiled to TypeScript
  if (options.language == "TypeScript") {
    packageJSON.dependencies = {
      "@types/express": "~4",
      "@types/morgan": "^1.9.0",
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
    response += `import __API from "./${options.newSource.substring(
      0,
      options.newSource.lastIndexOf(".")
    )}"\n`;
    response += 'import express from "express";\n';
    response += 'import isPromise from "is-promise";\n';
    response += 'import bodyParser from "body-parser"\n';
    response += 'import morgan from "morgan";\n';
  } else {
    // Use commonjs imports for JavaScript
    response += `const __API = require("./${options.newSource.substring(
      0,
      options.newSource.lastIndexOf(".")
    )}");\n`;
    response += 'const express = require("express");\n';
    response += 'const isPromise = require("is-promise");\n';
    response += 'const bodyParser = require("body-parser");\n';
    response += 'const morgan = require("morgan");\n';
  }

  response += "const app = express();\n";
  response += "app.use(bodyParser.json());\n";
  response += 'app.use(morgan("combined"));\n\n';
  response += routes.code;
  // Add action to listen on local host
  const port = options.port || 3000;
  response += `\napp.listen(${port}, () => console.log('API listening at http://localhost:${port}'));`;
  const tsConfig = options.language === "TypeScript" ? generateTSConfig() : {};
  return {
    index: beautify(response),
    packageJSON,
    tsConfig,
    routeData: routes.routes,
  };
}
