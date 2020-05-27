import assert from "assert";
import "mocha";
import buildTSExpress, { buildProgram } from "../src/processTScript";
describe("processJScript", () => {
  describe("parse trivial function", () => {
    const program = "console.log('hello world');";
    it("should properly parse typescript", () => buildProgram(program));
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
});
