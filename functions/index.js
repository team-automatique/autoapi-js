const functions = require('firebase-functions');
const genExpress = require("./generateExpress");
exports.generateExpress = functions.https.onRequest((request, response) => {
    const raw = request.body.file;
    const functions = request.body.functions;
    response.send(genExpress(raw, functions));
});
// console.log(genExpress(`const assert = require('assert');
// function square(x){
//     return x*x;
// }
// function add2andSquare(initial){ return square(2 + initial);}
// function sqrt(x){return Math.sqrt(x);}`, { add2andSquare: { api: true } }).index);