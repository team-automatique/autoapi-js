// import assert from "assert";
import "mocha";
import { assert } from "chai";

import { buildProgram } from "../src/processTScript";
import { buildTSExpress } from "../index";
import { packageJSON } from "./utils";
import fs from "fs";
import del from "del";
import path from "path";

describe("process TypeScript", () => {
  const dir = "__ts_temp_output";
  // Create temporary directory for building files
  fs.mkdirSync(dir);
  describe("parse trivial function", () => {
    const folder = path.join(dir, "trivial_func");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "index.ts"),
      "console.log('hello world');"
    );
    it("should properly parse typescript", () =>
      buildProgram(folder, "index.ts"));
  });

  describe("incorrectly typed program", () => {
    const folder = path.join(dir, "bad_typing");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "index.ts"),
      "function foo(): string { return 1; }"
    );
    it("should fail to parse typescript", () =>
      assert.throws(() => buildProgram(folder, "index.ts")));
  });

  describe("missing function", () => {
    const program = "function foo():string{return 'hello';}";
    const folder = path.join(dir, "missing_func");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "index.ts"), program);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    it("should throw an exception when looking for function bar", () =>
      assert.throws(() =>
        buildTSExpress(folder, "index.ts", { bar: { api: true } })
      ));
  });
  describe("build 0 function express server", () => {
    const program = "console.log('hello world');";
    const folder = path.join(dir, "0_functions");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "index.ts"), program);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    const result = buildTSExpress(folder, "index.ts", {});
    it("should produce parsable package.json", () => {
      JSON.parse(result.packageJSON);
    });
    const packageJson = JSON.parse(result.packageJSON);
    it("should declare 'express' as a requirement", () =>
      assert("express" in packageJson.dependencies));
    it("should declare 'typescript' as a devDependency", () =>
      assert("typescript" in packageJson.devDependencies));
    it("should retain the program text", () =>
      assert.notEqual(result.index.indexOf(program), -1));
    it("should import express", () =>
      assert.notEqual(
        result.index.indexOf('import express from "express"'),
        -1
      ));
  });
  describe("build a single function with arg", () => {
    const program = "function odd(x:number){return x % 2 === 1;}";
    const infolder = path.join(dir, "single_func");
    fs.mkdirSync(infolder);
    fs.writeFileSync(path.join(infolder, "index.ts"), program);
    fs.writeFileSync(
      path.join(infolder, "package.json"),
      JSON.stringify(packageJSON())
    );
    const result = buildTSExpress(infolder, "index.ts", { odd: { api: true } });
    it("should have an api post request", () =>
      assert.include(result.index, "app.post('/odd', (req, res) => "));
    it("should have the original function text", () =>
      assert.include(result.index, "function odd(x: number)"));
    it("should have app.listen", () =>
      assert.include(result.index, "app.listen("));
  });
  // // TODO: Add in package installation if a package exists
  // // describe("build a function with an external import", () => {
  // //   const program = "import fetch from 'esprima';";
  // //   it("should compile with external dependency", () =>
  // //     buildTSExpress(program, {}, { typescript: "latest" }));
  // // });
  after(() => del(dir));
});
