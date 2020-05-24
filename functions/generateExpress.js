const { processManyFunctions } = require("./processFunctions");
function generateRoute(func) {
    let full = func.raw + '\n';
    if (func.args.length > 0) {
        return full + "//TODO:";
    } else {
        return full + `app.get('/${func.name}', (req, res) => {
    const response = ${func.name}();
    res.send(response);
})`
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
        }
    }
}

module.exports = function generateExpress(rawFunctions) {
    let response = "const express = require('express');\nconst app = express();\n"
    const functions = processManyFunctions(rawFunctions);
    return {
        index: response + functions.map(m => generateRoute(m)).join('\n') + "\napp.listen(3000, () => console.log('example app listening at http://localhost:3000'))",
        package: JSON.stringify(generatePackageJson())
    }
}