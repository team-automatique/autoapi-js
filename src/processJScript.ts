import { parseScript } from "esprima";
import type { FunctionDeclaration } from "estree";
function processFunction(raw: string, func: FunctionDeclaration) {
  return {
    name: func.id!!.name,
    raw: raw.substring(func.range!![0], func.range!![1]),
    args: func.params.map((m) => m),
    async: func.async,
  };
}

export default function processJScript(raw: string, functions: any) {
  const parsed = parseScript(raw, { comment: true, range: true });
  const topLevelFound = (<FunctionDeclaration[]>(
    parsed.body.filter((f) => f.type === "FunctionDeclaration")
  )).map((m) => processFunction(raw, m));
  const topLevelExposed = topLevelFound.filter(
    (f) => functions[f.name] && functions[f.name].api
  );
  const topLevelNames = new Set(topLevelExposed.map((m) => m.name));
  const remaining = parsed.body.filter(
    (f) => f.type !== "FunctionDeclaration" || !topLevelNames.has(f.id!!.name)
  );
  const initializer = remaining
    .map((m) => raw.substring(m.range!![0], m.range!![1]))
    .join("\n");
  return { initializer, functions: topLevelExposed };
}
