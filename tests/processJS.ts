import assert from "assert";
import "mocha";
import { parseScript } from "esprima";
import processJScript from "../src/processJScript";
import generateExpress from "../src/generateExpress";

describe("processJScript", () => {
  describe("trivial function", () => {
    const program = "console.log('hello');";
    const response = processJScript(program, {});
    it("should not generate any functions when none are presented", () =>
      assert.equal(response.functions.length, 0));
    it("should leave the program intact, not removing any extra stuff", () =>
      assert.equal(response.initializer, program));
  });
  describe("handle malformed javascript", () => {
    const program = "lett v = 5;";
    it("should throw an exception", () =>
      assert.throws(() => processJScript(program, {})));
  });
  describe("function with 0 params, otherwise empty file", () => {
    const program = "function hello(){return 'hello world'}";
    const response = processJScript(program, { hello: { api: true } });
    it("should have 1 function found", () =>
      assert.equal(response.functions.length, 1));
    it("should have no extra setup code", () =>
      assert.equal(response.initializer.length, 0));
    it("should have no arguments in the single function", () =>
      assert.equal(response.functions[0].args.length, 0));
    it("should not be async", () =>
      assert.equal(response.functions[0].async, false));
    it("should match function found and input raw values", () =>
      assert.equal(response.functions[0].raw, program));
    it('should have the correct name of the function, namely "hello"', () =>
      assert.equal(response.functions[0].name, "hello"));
  });
  describe("function with 1 params, nothing else", () => {
    const program = "function times2(x){ return 2*x;}";
    const response = processJScript(program, { times2: { api: true } });
    it("should have 1 function found", () => {
      assert.equal(response.functions.length, 1);
    });
    it("should have no extra setup code", () =>
      assert.equal(response.initializer.length, 0));
    it("should have 1 argument", () =>
      assert.equal(response.functions[0].args.length, 1));
    it("should have argument titled 'x'", () =>
      assert.equal(response.functions[0].args[0], "x"));
  });
  describe("function with 1 param, with preset value", () => {
    const program = "function times2(x = 5){ return 2*x;}";
    const response = processJScript(program, { times2: { api: true } });
    it("should have 1 function found", () => {
      assert.equal(response.functions.length, 1);
    });
    it("should have no extra setup code", () =>
      assert.equal(response.initializer.length, 0));
    it("should have 1 argument", () =>
      assert.equal(response.functions[0].args.length, 1));
    it("should have argument titled 'x'", () =>
      assert.equal(response.functions[0].args[0], "x"));
  });
  describe("script is missing required function", () => {
    const program = "function times2(x = 5){return 2*x;}";
    it("should throw an exception that the function (hello) is missing", () =>
      assert.throws(() => processJScript(program, { hello: { api: true } })));
  });
});

describe("Build Express", () => {
  describe("Empty program", () => {
    const program = "";
    const response = generateExpress(program, {}, {});
    it("should produce valid package.json", () => JSON.parse(response.package));
    it("should have express in package dependencies", () => {
      assert.equal(JSON.parse(response.package).dependencies.express, "^4");
    });
    it("should have import of express in index.js", () =>
      assert.notEqual(response.index.search(/require\('express'\)/), -1));
    it("should not have any app.get functions", () =>
      assert.equal(response.index.search("app.get"), -1));
    it("should successfully parse as a script", () =>
      parseScript(response.index));
  });
});
