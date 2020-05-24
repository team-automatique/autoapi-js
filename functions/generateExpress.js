const beautify = require("js-beautify").js;

const { processAPIFile } = require("./processFunctions");
function generateRoute(func) {
    let full = func.raw + '\n';
    if (func.args.length > 0) {
        return full + `app.post('/${func.name}', (req, res) => {
    const body = req.body;
    const response = ${func.name}(${func.args.map(a => `body.${a}`).join(', ')});
    res.send(JSON.stringify(response));
});`;
    } else {
        return full + `app.get('/${func.name}', (req, res) => {
    const response = ${func.name}();
    res.send(JSON.stringify(response));
});`
    }
}

function generatePackageJson() {
    return {
        name: "generator-js",
        version: "1.0.0",
        description: "",
        main: "index.js",
        scripts: {
            "test": "echo \"Error: no test specified\" && exit 1"
        },
        author: "",
        license: "ISC",
        dependencies: {
            "express": "^4",
            "body-parser": "latest"
        }
    }
}

module.exports = function generateExpress(raw, functions) {
    let response = "const express = require('express');\nconst app = express();\n"
    const packages = ['express'];
    const processed = processAPIFile(raw, functions);
    const allGet = processed.functions.every(f => f.args.length === 0);
    if (!allGet) {
        response += "const bodyParser = require('body-parser');\n app.use(bodyParser.json());\n";
        packages.push('body-parser');
    }
    response += "\n/*User-Declared `require` statements, non-public functions, globally scoped variables*/\n" + processed.initializer + "\n\n";
    return {
        index: beautify(response + "/*Public routes based on the open APIs are declared below*/\n" +
            processed.functions.map(m => generateRoute(m)).join('\n\n') +
            "\n\napp.listen(3000, () => console.log('example app listening at http://localhost:3000'))"),
        package: JSON.stringify(generatePackageJson(packages), null, 2)
    }
}