import assert from "assert";
import "mocha";
import processJScript from "../src/processJScript";

describe("processJScript", () => {
  describe("trivial function", () => {
    const program = "console.log('hello');";
    const response = processJScript(program, {});
    it("should not generate any functions when none are presented", () =>
      assert.equal(response.functions.length, 0));
    it("should leave the program intact, not removing any extra stuff", () =>
      assert.equal(response.initializer, program));
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
});
