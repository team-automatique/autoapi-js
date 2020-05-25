import esprima from "esprima";
import { FunctionDeclaration, Pattern } from "estree"
function processFunction(raw: string, func: FunctionDeclaration) {
    return {
        name: func.id!!.name,
        raw: raw.substring(func.range!![0], func.range!![1]),
        args: func.params.map(m => m),
        async: func.async
    };
}

// TODO: Make this more restrictive
export default function processJScript(raw: string, functions: any) {
    const parsed = esprima.parseScript(raw, { comment: true, range: true });
    const topLevelFound = (<FunctionDeclaration[]>parsed.body.filter(f => f.type === "FunctionDeclaration")).map(m => processFunction(raw, m));
    const topLevelExposed = topLevelFound.filter(f => functions[f.name] && functions[f.name].api);
    const topLevelNames = new Set(topLevelExposed.map(m => m.name));
    const remaining = parsed.body.filter(f => f.type !== "FunctionDeclaration" || !(topLevelNames.has(f.id!!.name)));
    const initializer = remaining.map(m => raw.substring(m.range!![0], m.range!![1])).join('\n');
    return { initializer, functions: topLevelExposed };
}