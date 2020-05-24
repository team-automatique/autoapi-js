const assert = require("assert");
const esprima = require("esprima");

function processFunction(raw, func) {
    return {
        name: func.id.name,
        raw: raw.substring(func.range[0], func.range[1]),
        args: func.params.map(m => m.name),
        async: func.async
    };
}

function processAPIFile(raw, functions) {
    console.log(raw);
    const parsed = esprima.parseScript(raw, { comment: true, range: true });
    const topLevelFound = parsed.body.filter(f => f.type === "FunctionDeclaration").map(m => processFunction(raw, m));
    const topLevelExposed = topLevelFound.filter(f => functions[f.name] && functions[f.name].api);
    const topLevelNames = topLevelExposed.map(m => m.name);
    console.log(topLevelExposed);
    const remaining = parsed.body.filter(f => f.type !== "FunctionDeclaration" || !(topLevelNames.includes(f.id.name)));
    const initializer = remaining.map(m => raw.substring(m.range[0], m.range[1])).join('\n');
    return { initializer, functions: topLevelExposed };
}

module.exports = {
    processAPIFile
}