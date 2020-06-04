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
  describe("missing exports", () => {
    const program = "function foo():string{return 'hello';}";
    const folder = path.join(dir, "missing_exports");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "index.ts"), program);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    it("should throw an exception when nothing is exported", () =>
      assert.throws(() => buildTSExpress(folder, "index.ts")));
  });
  describe("build 1 function express server", () => {
    const program = `console.log('hello world');
    function foo(){return 1;}
    export default {foo}`;
    const folder = path.join(dir, "1_function");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "index.ts"), program);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    const result = buildTSExpress(folder, "index.ts");
    it("should produce parsable package.json", () => {
      JSON.parse(result.packageJSON);
    });
    const packageJson = JSON.parse(result.packageJSON);
    it("should declare 'express' as a requirement", () =>
      assert("express" in packageJson.dependencies));
    it("should declare 'typescript' as a devDependency", () =>
      assert("typescript" in packageJson.devDependencies));
    it("should have a call to the function", () =>
      assert.include(result.index, "__API.foo()"));
    it("should import express", () =>
      assert.notEqual(
        result.index.indexOf('import express from "express"'),
        -1
      ));
    it("should have path foo", () =>
      assert.include(result.index, "app.get('/foo'"));
  });

  describe("build a single function with arg", () => {
    const program = `function odd(x:number){return x % 2 === 1;}
    export default {
      odd: odd
    }`;
    const infolder = path.join(dir, "single_func");
    fs.mkdirSync(infolder);
    fs.writeFileSync(path.join(infolder, "index.ts"), program);
    fs.writeFileSync(
      path.join(infolder, "package.json"),
      JSON.stringify(packageJSON())
    );
    const result = buildTSExpress(infolder, "index.ts");
    it("should have an api post request", () =>
      assert.include(result.index, "app.post('/odd', (req, res) => "));
    it("should have the a check that body.odd exists", () =>
      assert.include(result.index, "!body.x"));
    it("should have app.listen", () =>
      assert.include(result.index, "app.listen("));
  });
  describe("build a deep path", () => {
    const program = `function square(x: number){ return x * x; }
    function cube(x: number){ return x * square(x); }
    export default {
      math: {
        square,
        cube
      },
      hello:{
        darkness:{
          my:{
            old:{
              friend: () => "I've come to talk to you again"
            }
          }
        }
      }
    }`;
    const folder = path.join(dir, "deep_path");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "index.ts"), program);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    const result = buildTSExpress(folder, "index.ts");
    it("should have an api post request", () =>
      assert.include(result.index, "app.post("));
    it("should have path /math/square", () =>
      assert.include(result.index, "app.post('/math/square'"));
    it("should have path /math/cube", () =>
      assert.include(result.index, "app.post('/math/cube'"));
    it("should have deep greeting", () =>
      assert.include(result.index, "app.get('/hello/darkness/my/old/friend'"));
  });
  after(() => del(dir));
});
