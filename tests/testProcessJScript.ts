import { assert } from "chai";
import "mocha";
import { parseScript } from "esprima";
import { buildJSExpress } from "../index";
import processJScript from "../src/processJScript";
import fs from "fs";
import path from "path";
import del from "del";
import { packageJSON } from "./utils";

describe("processJScript", () => {
  const dir = "__js_temp_output";
  // Create temporary directory for building files
  fs.mkdirSync(dir);
  describe("missing files", () => {
    const folder = path.join(dir, "missing_files");
    it("should throw an exception when folder is missing", () =>
      assert.throws(() => processJScript(folder, "index.js")));
    fs.mkdirSync(folder);
    it("should throw an exception when file is missing", () =>
      assert.throws(() => processJScript(folder, "index.js")));
    fs.writeFileSync(
      path.join(folder, "index.js"),
      "module.exports = {foo: ()=>'hi'}"
    );
    it("should throw an exception when package.json is missing", () =>
      assert.throws(() => processJScript(folder, "index.js")));
  });
  describe("handle malformed javascript", () => {
    const folder = path.join(dir, "malformed");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "index.js"), "lett v = 5;");
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    it("should throw an exception", () =>
      assert.throws(() => processJScript(folder, "index.js")));
  });
  describe("no export", () => {
    const folder = path.join(dir, "no_export");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    fs.writeFileSync(
      path.join(folder, "index.js"),
      "function f() {console.log('hello')}"
    );
    it("should throw an exception when no exports are present", () =>
      assert.throws(() => processJScript(folder, "index.js")));
  });
  describe("multiple exports", () => {
    const folder = path.join(dir, "multiple_exports");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    fs.writeFileSync(
      path.join(folder, "index.js"),
      `function f() {console.log('hello')};
      module.exports = {f}
      module.exports = {foo: f}`
    );
    it("should throw an exception when more than 1 export are present", () =>
      assert.throws(() => processJScript(folder, "index.js")));
  });

  describe("file with single func exported", () => {
    const folder = path.join(dir, "basic_func");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    fs.writeFileSync(
      path.join(folder, "index.js"),
      `function f() {return "foo"};
      module.exports = {foo: f}`
    );
    const response = processJScript(folder, "index.js");
    it("should have an API get request for '/foo'", () =>
      assert.include(response.index, "app.get('/foo'"));
    it("should make a call to __API.foo", () =>
      assert.include(response.index, "__API.foo()"));
    const foundJSON = JSON.parse(response.packageJSON);
    it("should have express, is-promise and body-parser as dependencies", () =>
      assert.hasAllKeys(foundJSON.dependencies, [
        "express",
        "is-promise",
        "body-parser",
      ]));
    it("should properly parse resulting JS", () =>
      assert.doesNotThrow(() => parseScript(response.index)));
  });
  describe("arrow function", () => {
    const folder = path.join(dir, "arrow_func");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    fs.writeFileSync(
      path.join(folder, "index.js"),
      "module.exports = {foo: ()=> 'Hello world'}"
    );
    const response = processJScript(folder, "index.js");
    it("should have an API get for '/foo'", () =>
      assert.include(response.index, "app.get('/foo'"));
    it("should make call to __API.foo", () =>
      assert.include(response.index, "__API.foo()"));
    it("should properly parse resulting JS", () =>
      assert.doesNotThrow(() => parseScript(response.index)));
  });
  describe("literal", () => {
    const folder = path.join(dir, "literal_not_func");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    fs.writeFileSync(
      path.join(folder, "index.js"),
      "module.exports = {foo: 5}"
    );
    it("should throw an exception when trying to export a constant", () =>
      assert.throws(() => processJScript(folder, "index.js")));
  });
  describe("deep path", () => {
    const folder = path.join(dir, "deep_path");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    fs.writeFileSync(
      path.join(folder, "index.js"),
      "module.exports = {foo: {bar:{baz: ()=>'hello'}}}"
    );
    const response = processJScript(folder, "index.js");
    it("should have an API get for '/foo'", () =>
      assert.include(response.index, "app.get('/foo/bar/baz'"));
    it("should make call to __API.foo", () =>
      assert.include(response.index, "__API.foo.bar.baz()"));
    it("should properly parse resulting JS", () =>
      assert.doesNotThrow(() => parseScript(response.index)));
  });
  describe("external object", () => {
    const folder = path.join(dir, "external_obj");
    fs.mkdirSync(folder);
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify(packageJSON())
    );
    fs.writeFileSync(
      path.join(folder, "index.js"),
      `function baz(){return 1;}
      const foo = {
        bar:{
          baz
        }
      }
      module.exports = {nip: foo}`
    );
    const response = processJScript(folder, "index.js");
    it("should have an API get for '/nip/bar/baz'", () =>
      assert.include(response.index, "app.get('/nip/bar/baz'"));
    it("should make call to __API.foo", () =>
      assert.include(response.index, "__API.nip.bar.baz()"));
    it("should properly parse resulting JS", () =>
      assert.doesNotThrow(() => parseScript(response.index)));
  });
  after(() => del(dir));
});
