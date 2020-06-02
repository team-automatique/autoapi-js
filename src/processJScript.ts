import { parseScript, Program } from "esprima";
import { js as beautify } from "js-beautify";
import type { Node, Identifier } from "estree";
import fs from "fs";
import path from "path";
import { getHeader } from "./shared";
import assert from "assert";

interface exportMap {
  [key: string]:
    | { type: "exports"; exports: exportMap }
    | { type: "func"; func: Node };
}

function grabExports(node: Node, name: string, program: Program): exportMap {
  switch (node.type) {
    case "ObjectExpression":
      let results: exportMap = {};
      node.properties.forEach((n) => {
        if (n.type === "Property") {
          const assign = grabExports(
            n.value,
            (<Identifier>n.key).name,
            program
          );
          console.log(assign);
          results = { ...results, ...assign };
        } else {
        }
      });
      return { [name]: { type: "exports", exports: results } };
    case "ArrowFunctionExpression":
      return { [name]: { type: "func", func: node } };
    case "FunctionDeclaration":
      return { [name]: { type: "func", func: node } };
    case "FunctionExpression":
      return { [name]: { type: "func", func: node } };
    case "Identifier":
      let declaration: Node | undefined;
      for (const dec of program.body.slice().reverse()) {
        if (dec.type === "FunctionDeclaration") {
          if (dec.id?.name === node.name) {
            declaration = dec;
            break;
          }
        }
      }
      if (!declaration)
        throw new Error("Unable to find declaration for " + node.name);
      return grabExports(declaration, name, program);
    default:
      throw new Error("Unsupported export " + node.type);
  }
}
function convertFuncToRoute(func: Node, funcAlias: string, path: string) {
  if (
    func.type === "FunctionDeclaration" ||
    func.type === "ArrowFunctionExpression" ||
    func.type === "FunctionExpression"
  ) {
    const params = func.params;
    let response = "";
    if (params.length === 0) {
      // Perform a GET
      response += `app.get('${path}', (req, res) => {
        const response = ${funcAlias}();
        if(isPromise(response)){
          response.then(r => res.send(r));
        }else{
          res.send(response);
        }
      })`;
    } else {
      // Perform a POST
      const paramList = params
        .map((p) => {
          if (p.type === "Identifier") return `body.${p.name}`;
          if (p.type === "AssignmentPattern" && p.left.type === "Identifier")
            return `body.${p.left.name}`;
          throw new Error("Cannot map param " + p.type + " into a func call");
        })
        .join(", ");
      response += `app.post('${path}', (req, res) => {
        const response = ${funcAlias}(${paramList});
        if(isPromise(response)){
          response.then(r => res.send(r));
        }else{
          res.send(response);
        }
      })`;
    }
    return response;
  } else {
    throw new Error("Unrecognized Type " + func.type);
  }
}

function buildRoutes(exports: exportMap, basePath: string): string {
  const result = Object.keys(exports)
    .map((key) => {
      const exp = exports[key];
      if (exp.type === "exports") {
        return buildRoutes(exp.exports, basePath + "/" + key);
      } else {
        const path = basePath + "/" + key;
        const alias = path.split("/").slice(1).join(".");
        return convertFuncToRoute(
          <any>exp.func,
          "__API." + alias,
          basePath + "/" + key
        );
      }
    })
    .filter((f) => f)
    .join("\n\n");
  return result;
}

export default function buildJSExpress(root: string, file: string) {
  const packageJSON = JSON.parse(
    fs.readFileSync(path.join(root, "package.json")).toString()
  );
  const raw = fs.readFileSync(path.join(root, file)).toString();
  const program = parseScript(raw);
  const expRaw = program.body.filter(
    (f) =>
      f.type === "ExpressionStatement" &&
      f.expression.type === "AssignmentExpression" &&
      f.expression.left.type === "MemberExpression" &&
      f.expression.left.object.type === "Identifier" &&
      f.expression.left.object.name === "module" &&
      f.expression.left.property.type === "Identifier" &&
      f.expression.left.property.name === "exports"
  );
  if (expRaw.length !== 1) {
    throw new Error(
      `Expected exactly 1 "export default" declaration. Found ${expRaw.length}`
    );
  }
  const singleExport = expRaw[0];
  assert(
    singleExport.type === "ExpressionStatement" &&
      singleExport.expression.type === "AssignmentExpression"
  );
  const exportTree = grabExports(singleExport.expression.right, "", program);
  const exp = exportTree[""];
  let routes: string;
  if (exp.type === "func") {
    routes = buildRoutes(exportTree, "");
  } else {
    routes = buildRoutes(exp.exports, "");
  }
  // Update the package.json file to include newly found requirements
  packageJSON.dependencies = {
    express: "^4",
    "is-promise": "^4",
    "body-parser": "latest",
    ...packageJSON.dependencies,
  };

  packageJSON.description += " - API generated by Automatique";

  let index = getHeader();
  index += `const  __API = require("./${file.substring(
    0,
    file.lastIndexOf(".")
  )}")\n`;
  index += "// Setup server to send API routes\n";
  index += 'const express = require("express");\n';
  index += 'const isPromise = require("is-promise");\n';
  index += 'const bodyParser = require("body-parser")\n;';
  index += "const app = express();\n";
  index += "app.use(bodyParser.json());\n\n";
  index += routes + "\n\n";
  // // Add action to listen on local host
  index +=
    "app.listen(3000, () => console.log('API listening at http://localhost:3000'));";
  return {
    index: beautify(index),
    packageJSON: JSON.stringify(packageJSON, null, 2),
  };
}
