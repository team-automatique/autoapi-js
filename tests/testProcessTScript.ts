// import assert from "assert";
import "mocha";
import { assert } from "chai";

import { buildProgram } from "../src/processTScript";
import { buildTSExpress } from "../index";

describe("process TypeScript", () => {
  describe("parse trivial function", () => {
    const program = "console.log('hello world');";
    it("should properly parse typescript", () => buildProgram(program));
  });
  describe("incorrectly typed program", () => {
    const program = "function foo():string{ return 1;}";
    it("should fail to parse typescript", () =>
      assert.throws(() => buildProgram(program)));
  });
  describe("missing function", () => {
    const program = "function foo():string{return 'hello';}";
    it("should throw an exception when looking for function bar", () =>
      assert.throws(() => buildTSExpress(program, { bar: { api: true } }, {})));
  });
  describe("build 0 function express server", () => {
    const programText = "console.log('hello world');";
    const result = buildTSExpress(programText, {}, {});
    it("should produce parsable package.json", () => {
      JSON.parse(result.packageJSON);
    });
    const packageJson = JSON.parse(result.packageJSON);
    it("should declare 'express' as a requirement", () =>
      assert("express" in packageJson.dependencies));
    it("should declare 'typescript' as a devDependency", () =>
      assert("typescript" in packageJson.devDependencies));
    it("should retain the program text", () =>
      assert.notEqual(result.index.indexOf(programText), -1));
    it("should import express", () =>
      assert.notEqual(
        result.index.indexOf('import express from "express"'),
        -1
      ));
  });
  describe("build a single function with arg", () => {
    const program = "function odd(x:number){return x % 2 === 1;}";
    const result = buildTSExpress(program, { odd: { api: true } }, {});
    it("should have an api post request", () =>
      assert.include(result.index, "app.post('/odd', (req, res) => "));
  });
});
