const esprima = require("esprima");
const beautify = require("js-beautify").js;
const testProgram = `function f(name){for(var i = 0; i<4; i++){const x = false ? 1 : {abc:5}}; f = 3;}`;

function parsedToString(parsed) {
  console.log(parsed);
  switch (parsed.type) {
    case "FunctionDeclaration":
      return `function ${parsed.id.name}(){${parsedToString(parsed.body)}};`;
    case "BlockStatement":
      return parsed.body.map((m) => parsedToString(m)).join("\n");
    case "ExpressionStatement":
      return parsedToString(parsed.expression);
    case "MemberExpression":
      return `${parsedToString(parsed.object)}.${parsedToString(
        parsed.property
      )}`;
    case "BinaryExpression":
      return `${parsedToString(parsed.left)} ${
        parsed.operator
      } ${parsedToString(parsed.right)}`;
    case "IfStatement":
      return (
        `if(${parsedToString(parsed.test)}){${parsedToString(
          parsed.consequent
        )}}` +
        (parsed.alternate ? ` else {${parsedToString(parsed.alternate)}}` : "")
      );
    case "ForStatement":
      return `for(${parsedToString(parsed.init)}; ${parsedToString(
        parsed.test
      )}; ${parsedToString(parsed.update)}){${parsedToString(parsed.body)}}`;
    case "ConditionalExpression":
      return `${parsedToString(parsed.test)} ? ${parsedToString(
        parsed.consequent
      )} : ${parsedToString(parsed.alternate)}`;
    case "CallExpression":
      return `${parsedToString(parsed.callee)}(${parsed.arguments
        .map((m) => parsedToString(m))
        .join(", ")});`;
    case "UpdateExpression":
      if (parsed.prefix)
        return `${parsed.operator}${parsedToString(parsed.argument)}`;
      else return `${parsedToString(parsed.argument)}${parsed.operator}`;
    case "ReturnStatement":
      return `return ${parsedToString(parsed.argument)};`;
    case "VariableDeclaration":
      return `${parsed.kind} ${parsed.declarations
        .map((m) => parsedToString(m))
        .join(", ")}`;
    case "VariableDeclarator":
      return `${parsedToString(parsed.id)} = ${parsedToString(parsed.init)}`;
    case "AssignmentExpression":
      return `${parsedToString(parsed.left)} ${
        parsed.operator
      } ${parsedToString(parsed.right)}`;
    case "ObjectExpression":
      return `{${parsed.properties.map((m) => parsedToString(m)).join("\n")}}`;
    case "Property":
      return `${parsedToString(parsed.key)}: ${parsedToString(parsed.value)},`;
    case "Literal":
      return `${parsed.raw}`;
    case "Identifier":
      return `${parsed.name}`;
    case "EmptyStatement":
      return "";
    default:
      return "ERR";
  }
}
function getFunctions(rawProgram) {
  const parsed = esprima.parseScript(rawProgram);
  const functions = parsed.body.filter(
    (item) => item.type === "FunctionDeclaration"
  );
  console.log(beautify(parsedToString(functions[0])));
  return functions;
}
getFunctions(testProgram);
