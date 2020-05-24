const assert = require("assert");
const esprima = require("esprima");

function processSingleFunction(raw) {
    const parsed = esprima.parseScript(raw, { comment: true, loc: true, range: true });
    // console.log(parsed);
    const allFunctions = parsed.body.filter(f => f.type === "FunctionDeclaration");
    assert(allFunctions.length === 1);
    const mainFunction = allFunctions[0];
    return {
        imports: [],
        name: mainFunction.id.name,
        raw: raw.substring(mainFunction.range[0], mainFunction.range[1]),
        args: mainFunction.params.map(m => m.name)
    };
}

function processManyFunctions(strings) {
    imports = new Set();
    functions = strings.map(f => processSingleFunction(f));
    functions.forEach(f => { imports.add(f.imports); delete f.imports; });
    // console.log(functions);
    return functions;
}

module.exports = {
    processManyFunctions
}