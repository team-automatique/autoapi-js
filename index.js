const esprima = require("esprima");
const testProgram = `function f(name){console.log("hello " + name); return 0;}`
function getFunctions(rawProgram){
  const parsed = esprima.parseScript(rawProgram);
  const functions = parsed.body.filter(item => item.type === "FunctionDeclaration");
  console.log(functions[0]);
  return functions;
}
getFunctions(testProgram);
