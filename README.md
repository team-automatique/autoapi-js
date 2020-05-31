# AutoAPI-JS

##### Build TypeScript and JavaScript functions automatically into a REST API

### Installing

This package can be added to an existing Node project via the command
`npm install @automatique/generator-js`

### Usage

Generator-JS currently exports two major functions, `buildJSExpress` and `buildTSExpress`.
Additionally, the function `getTSTopLevelFunctions` will return a list of all top-level functions
in a TypeScript file.

Example Usage:

```javascript
// Build a program, with the function "foo" exported
buildTSExpress(
  // Program
  "/some/path/to/a/typescript/project",
  // Main file
  "index.ts",
  // Functions to be exported
  {
    foo: { api: true },
  }
);
```

The above returns an object with three attributes, "index", the text of an index.ts script,
"packageJSON", a package.json file, and "tsConfig", a valid typescript config.

Note there are some changes in the source file that must be made to correctly work

1. URL Paths are case-insensitive, unlike JavaScript/TypeScript identifiers. If you attempt to export 2 functions with the same name, differing by casing (eg foo() and FOO()), undefined behaviour will occur
