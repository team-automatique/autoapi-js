import { parseScript } from "esprima";
import type { FunctionDeclaration, Identifier } from "estree";
import type { functions, decompFunction } from "./generateExpress";
function processFunction(
  raw: string,
  func: FunctionDeclaration
): decompFunction {
  return {
    name: func.id!!.name,
    raw: raw.substring(func.range!![0], func.range!![1]),
    args: func.params.map((m) => {
      switch (m.type) {
        case "Identifier":
          return m.name;
        case "AssignmentPattern":
          return (<Identifier>m.left).name;
        default:
          return "NULL";
      }
    }),
    async: func.async || false,
  };
}

export default function processJScript(raw: string, functions: functions) {
  const parsed = parseScript(raw, { comment: true, range: true });
  const topLevelFound = (<FunctionDeclaration[]>(
    parsed.body.filter((f) => f.type === "FunctionDeclaration")
  )).map((m) => processFunction(raw, m));
  const topLevelExposed = topLevelFound.filter((f) => {
    if (functions[f.name] && functions[f.name].api) {
      functions[f.name].discovered = true;
      return true;
    }
    return false;
  });
  // Check that all functions expressed have been found
  const missingFunctions = Object.keys(functions).filter(
    (f) => !functions[f].discovered
  );
  if (missingFunctions.length !== 0) {
    throw new Error(
      `Failed to find declarations for functions (${missingFunctions.join(
        ", "
      )}). Ensure that the source file contains them`
    );
  }
  const topLevelNames = new Set(topLevelExposed.map((m) => m.name));
  const remaining = parsed.body.filter(
    (f) => f.type !== "FunctionDeclaration" || !topLevelNames.has(f.id!!.name)
  );
  const initializer = remaining
    .map((m) => raw.substring(m.range!![0], m.range!![1]))
    .join("\n");
  return { initializer, functions: topLevelExposed };
}
