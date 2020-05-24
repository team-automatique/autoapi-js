const functions = require('firebase-functions');
// const beautify = require("js-beautify").js;
const genExpress = require("./generateExpress");
exports.generateExpress = functions.https.onRequest((request, response) => {
    const funcs = request.body.functions;
    response.send(genExpress(funcs));
});